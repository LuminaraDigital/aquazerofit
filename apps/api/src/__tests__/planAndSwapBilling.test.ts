/**
 * Credit billing for the two training AI lanes: plan generation (P-05, 5
 * credits) and exercise swap (P-06, 1 credit).
 *
 * Both lanes are optional passes over work the deterministic engine can
 * already do, so the billing question is never "did the request succeed" but
 * "did a model actually produce the thing the user is holding". The rules this
 * file pins, and the concrete way each was got wrong before:
 *
 *   · charge only for kept model output — a draft the contract rejected, or a
 *     null from the engine, still burns provider tokens, and absorbing that is
 *     our cost rather than the user's;
 *   · never charge for degraded output — `meta.degraded` means every real
 *     provider failed and the offline template engine answered. The plan is
 *     usable so the user keeps it, but it is not a model's work. Same stance as
 *     chatDegradedBilling.test.ts and recommendationDegradedBilling.test.ts;
 *   · never charge for a lane that was not entered — a swap served by the
 *     deterministic variationGroup sibling consults no model at all, and
 *     reserving on entry to swapExercise would have billed it;
 *   · an empty balance costs the user the model's opinion, not the feature —
 *     CREDITS_INSUFFICIENT is swallowed and the deterministic engine serves the
 *     request, because an AI extra may never take a core journey down with it.
 *
 * The gateway is mocked at the module seam (as memoryExtraction.test.ts does)
 * rather than the plan engine, so planEngine's own validation, the draft
 * contract in plans/service and the swap constraints all run for real — the
 * commit/release decision is then the genuine outcome of that pipeline and not
 * a value handed to it.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
// Not mocked: this is the offline engine the gateway itself falls through to.
import { mockComplete } from '../modules/ai/providers/mock';
import { CREDIT_COSTS, FREE_TIER_DAILY_CREDITS } from '@aquazerofit/shared';
import type { CreditTransaction, Exercise, WellnessProfile, WorkoutSession } from '@aquazerofit/shared';
import {
  bindIsolatedDataDir,
  clearProviderEnv,
  createIsolatedDataDir,
  pinIsolatedDataDir,
  saveProviderEnv,
  teardownIsolatedDataDir,
} from './helpers/integrationIsolation';

// Shared isolation helpers, not a bare AZF_DATA_DIR assignment: vitest collects
// every file in a worker before any of them run, so a single assignment is just
// the last writer winning, and this file's store ends up bound to another
// suite's directory — which afterAll then deletes across suites. That failure
// mode showed up as a native abort (0xC0000409), not as a test failure.
const savedAzfDataDir = process.env.AZF_DATA_DIR;
const savedProviderEnv = saveProviderEnv();
const dataDir = createIsolatedDataDir('azf-plan-swap-billing-');
bindIsolatedDataDir(dataDir);
// No provider keys: nothing here may reach a network even if the mock is
// bypassed by a future refactor of the gateway seam.
clearProviderEnv();

vi.mock('../modules/ai/gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/ai/gateway')>();
  return { ...actual, complete: vi.fn() };
});

const { complete } = await import('../modules/ai/gateway');
const { creditLedger } = await import('../modules/ai/creditLedger');
const { generatePlanForUser } = await import('../modules/plans/service');
const { swapExercise, sessionId } = await import('../modules/workouts/service');
const { getStore } = await import('../platform/store');

const completeMock = vi.mocked(complete);

// ----- fixtures -----

function exercise(overrides: Partial<Exercise> & Pick<Exercise, 'id' | 'name'>): Exercise {
  return {
    type: 'exercise',
    description: 'test exercise',
    category: 'strength',
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    // Bodyweight throughout so every fixture survives buildExercisePool for a
    // beginner owning no equipment — the pool is what both lanes are validated
    // against, and a filtered-out fixture would look like a billing bug.
    equipment: ['none'],
    difficulty: 'beginner',
    media: [],
    licence: 'CC-BY-SA 4.0',
    licenceAuthor: 'wger.de community contributors',
    sourceId: `test-${overrides.id}`,
    ...overrides,
  };
}

/**
 * The store bootstraps the real curated exercise library (seedIfNeeded runs on
 * the first getStore()), so these fixtures live ALONGSIDE roughly a thousand
 * seeded movements rather than instead of them.
 *
 * That matters for the swap tests, whose subject is which candidate wins: with
 * a real muscle name the deterministic fallback is whichever seeded squat
 * variant happens to sort first, so the assertions would be pinned to library
 * data that a re-import can change. The three swap fixtures therefore share a
 * synthetic primary muscle no seeded exercise carries, which makes their pool
 * tier exactly three known exercises. The plan fixtures use real muscles
 * because there the pool's contents are incidental.
 */
const SWAP_MUSCLE = 'test-quadriceps';

const EXERCISES: Exercise[] = [
  exercise({ id: 'ex-pu-a', name: 'Push Up', variationGroup: 'vg-azf-test-push' }),
  exercise({ id: 'ex-pu-b', name: 'Diamond Push Up', variationGroup: 'vg-azf-test-push' }),
  exercise({ id: 'ex-row', name: 'Inverted Row', primaryMuscles: ['back'] }),
  exercise({ id: 'ex-glute', name: 'Glute Bridge', primaryMuscles: ['glutes'] }),
  exercise({ id: 'ex-ham', name: 'Good Morning', primaryMuscles: ['hamstrings'] }),
  exercise({ id: 'ex-calf', name: 'Calf Raise', primaryMuscles: ['calves'] }),
  exercise({ id: 'ex-shoulder', name: 'Pike Push Up', primaryMuscles: ['shoulders'] }),
  exercise({ id: 'ex-plank', name: 'Plank', category: 'core', primaryMuscles: ['core'] }),
  // Swap tier. Sorted by id (buildExercisePool orders by id), the candidates
  // for ex-sq are ex-lunge then ex-split: the deterministic fallback takes
  // ex-lunge, so a result of ex-split can only be the model's pick.
  exercise({ id: 'ex-sq', name: 'Air Squat', primaryMuscles: [SWAP_MUSCLE] }),
  exercise({ id: 'ex-lunge', name: 'Reverse Lunge', primaryMuscles: [SWAP_MUSCLE] }),
  exercise({ id: 'ex-split', name: 'Split Squat', primaryMuscles: [SWAP_MUSCLE] }),
];

const PLAN_EXERCISE_IDS = ['ex-pu-a', 'ex-row', 'ex-glute', 'ex-ham', 'ex-calf', 'ex-shoulder', 'ex-plank'];

function seedUser(userId: string): void {
  const store = getStore();
  store.upsert('profiles', {
    id: `profile-${userId}`,
    type: 'wellnessProfile',
    userId,
    weightKg: 70,
    heightCm: 175,
    age: 30,
    sex: 'unspecified',
    goal: 'maintain',
    activityLevel: 'moderate',
    exerciseExperience: 'beginner',
    dietaryPreferences: [],
    allergies: [],
    equipment: ['none'],
    unitPreference: 'metric',
    updatedAt: new Date().toISOString(),
  } as WellnessProfile & { id: string; type: 'wellnessProfile' });
}

/**
 * A draft the WHOLE pipeline accepts, which is narrower than either validator
 * alone: planEngine's validatePlanDraft wants exactly `daysPerWeek` days, while
 * plans/service's aiDraftIsValid wants all 7 calendar orders with the non-rest
 * count equal to daysPerWeek. Only daysPerWeek === 7 satisfies both, so every
 * commit case here is a 7-day week. See the note on the daysPerWeek-4 test.
 */
function sevenDayDraft(): Record<string, unknown> {
  return {
    name: '7-Day Bodyweight Week',
    days: Array.from({ length: 7 }, (_, i) => ({
      order: i + 1,
      focus: 'Full Body Strength',
      isRest: false,
      slots: [
        {
          order: 1,
          entries: [
            {
              id: `se-${i + 1}-1`,
              exerciseId: PLAN_EXERCISE_IDS[i % PLAN_EXERCISE_IDS.length],
              sets: 3,
              reps: 10,
              restSeconds: 60,
            },
          ],
        },
      ],
    })),
    progressionRules: [],
    rationale: 'A steady bodyweight week with room to add reps before load.',
  };
}

/** Gateway result envelope; `degraded` is the flag both lanes bill on. */
function gatewayResult(json: unknown, degraded: boolean) {
  return {
    text: JSON.stringify(json),
    json,
    meta: {
      provider: degraded ? 'offline' : 'groq',
      model: degraded ? 'offline-template' : 'llama-3.3-70b',
      promptVersion: 'P-05@1.0.0',
      generatedAt: new Date().toISOString(),
      degraded,
      ...(degraded ? { degradedReason: 'provider_failure' as const } : {}),
    },
  };
}

// ----- ledger assertions -----

type LedgerRow = CreditTransaction;

const ledgerRows = (userId: string): LedgerRow[] =>
  getStore().where<LedgerRow>('ledger', (d) => d.userId === userId && d.type === 'creditTransaction');

/**
 * Rows are matched by reason and reservationId rather than counted, because
 * `commit` appends TWO documents — a `settleReservation` release that keeps the
 * plain balance fold correct, and the `commit:<task>` row itself. Counting rows
 * per reservation reads a commit as a release and passes the degraded tests for
 * the wrong reason.
 */
function reserveRowFor(userId: string, task: keyof typeof CREDIT_COSTS): LedgerRow | undefined {
  return ledgerRows(userId).find((row) => row.reason === `reserve:${task}`);
}

function settlementFor(userId: string, reservationId: string): LedgerRow[] {
  return ledgerRows(userId).filter((row) => row.reservationId === reservationId);
}

function expectCommitted(userId: string, task: keyof typeof CREDIT_COSTS): void {
  const reserve = reserveRowFor(userId, task);
  expect(reserve).toBeDefined();
  const settlement = settlementFor(userId, reserve!.reservationId!);
  const commit = settlement.find((row) => row.kind === 'commit');
  expect(commit).toBeDefined();
  expect(commit!.reason).toBe(`commit:${task}`);
}

function expectReleased(userId: string, task: keyof typeof CREDIT_COSTS): void {
  const reserve = reserveRowFor(userId, task);
  expect(reserve).toBeDefined();
  const settlement = settlementFor(userId, reserve!.reservationId!);
  expect(settlement.some((row) => row.kind === 'commit')).toBe(false);
  expect(settlement.some((row) => row.kind === 'release' && row.reason === 'releaseReservation')).toBe(true);
}

beforeEach(() => {
  // Re-pin: another suite loaded into this worker may have taken the singleton.
  pinIsolatedDataDir(dataDir);
  for (const ex of EXERCISES) getStore().upsert('content', ex);
  completeMock.mockReset();
});

afterAll(async () => {
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

/*
 * The regression that pays for this whole file.
 *
 * `validatePlanDraft` used to require `days.length === daysPerWeek` while
 * `aiDraftIsValid` required seven days with `daysPerWeek` non-rest. Only
 * daysPerWeek 7 could satisfy both, and `generatePlanSchema` caps the field at
 * 6 — so through the API the AI lane spent a planStructured call on every
 * request and had the result discarded every time. Nothing caught it: the unit
 * tests asserted the broken shape, and the evals stop at the first gate.
 *
 * These run at the DEFAULT day count and through the real offline engine (no
 * gateway mock), which is what a keyless deployment and every dev run use. A
 * non-null `generatedBy` is the whole assertion: it means a draft survived
 * both gates.
 */
describe('the AI plan lane can actually land a plan', () => {
  it.each([2, 3, 4, 5, 6])('keeps the model draft at daysPerWeek %i', async (daysPerWeek) => {
    const userId = `u-plan-lands-${daysPerWeek}`;
    seedUser(userId);
    await creditLedger.grantDailyIfNeeded(userId);
    /*
     * Delegate to the real offline engine rather than a hand-written draft.
     * `mockComplete` is what the gateway itself falls through to when no
     * provider key is configured, so this exercises the actual draft a keyless
     * deployment produces against the actual validators — which is precisely
     * the combination that was silently failing. A fixture draft here would
     * test the validators and let the generator stay broken.
     */
    completeMock.mockImplementation(async (task, messages, opts) => {
      const offline = mockComplete(task, messages as never, {
        context: opts?.context,
        promptId: opts?.promptId,
      });
      return gatewayResult(offline.json, false);
    });

    const plan = await generatePlanForUser(userId, { daysPerWeek, focus: 'general' }, '2026-08-03');

    expect(plan.generatedBy).not.toBeNull();
    expect(plan.days).toHaveLength(7);
    expect(plan.days.filter((d) => !d.isRest)).toHaveLength(daysPerWeek);
  });
});

describe('plan generation billing (planGeneration, 5 credits)', () => {
  it('commits the reservation when a real provider produced the plan that was kept', async () => {
    const userId = 'u-plan-commit';
    seedUser(userId);
    await creditLedger.grantDailyIfNeeded(userId);
    const before = await creditLedger.balance(userId);
    completeMock.mockResolvedValue(gatewayResult(sevenDayDraft(), false));

    const plan = await generatePlanForUser(userId, { daysPerWeek: 7, focus: 'general' }, '2026-08-03');

    // generatedBy proves the AI lane, not buildPlan, produced this week —
    // without it a deterministic fallback would satisfy every other assertion
    // here except the commit, and the test would be pinning nothing.
    expect(plan.generatedBy).not.toBeNull();
    expect(plan.name).toBe('7-Day Bodyweight Week');
    expectCommitted(userId, 'planGeneration');
    expect(await creditLedger.balance(userId)).toBe(before - CREDIT_COSTS.planGeneration);
    expect(CREDIT_COSTS.planGeneration).toBe(5);
  });

  it('releases the reservation when the gateway degraded, and still hands over the plan', async () => {
    const userId = 'u-plan-degraded';
    seedUser(userId);
    await creditLedger.grantDailyIfNeeded(userId);
    const before = await creditLedger.balance(userId);
    completeMock.mockResolvedValue(gatewayResult(sevenDayDraft(), true));

    const plan = await generatePlanForUser(userId, { daysPerWeek: 7, focus: 'general' }, '2026-08-03');

    // Template output from the offline engine is a week the user can train, so
    // it is kept — it is simply not a model's work, so it is not charged for.
    expect(plan.generatedBy).not.toBeNull();
    expect(plan.days).toHaveLength(7);
    expectReleased(userId, 'planGeneration');
    expect(await creditLedger.balance(userId)).toBe(before);
  });

  it('releases the reservation when the engine yields nothing usable, and falls back deterministically', async () => {
    const userId = 'u-plan-engine-null';
    seedUser(userId);
    await creditLedger.grantDailyIfNeeded(userId);
    const before = await creditLedger.balance(userId);
    // Well-formed JSON of the wrong shape: planEngine's validator rejects it and
    // tryGenerateAiPlan returns null. The provider was still called and still
    // billed us — the refund is the point.
    completeMock.mockResolvedValue(gatewayResult({ sorry: 'no plan today' }, false));

    const plan = await generatePlanForUser(userId, { daysPerWeek: 7, focus: 'general' }, '2026-08-03');

    expect(plan.generatedBy).toBeNull(); // deterministic buildPlan served it
    expect(plan.days).toHaveLength(7);
    expectReleased(userId, 'planGeneration');
    expect(await creditLedger.balance(userId)).toBe(before);
  });

  it('releases the reservation when the draft passes the engine but fails the plan contract', async () => {
    const userId = 'u-plan-draft-rejected';
    seedUser(userId);
    await creditLedger.grantDailyIfNeeded(userId);
    const before = await creditLedger.balance(userId);
    // A 4-day draft is exactly what planEngine's validatePlanDraft demands for
    // daysPerWeek 4, and exactly what plans/service's aiDraftIsValid refuses —
    // it requires all 7 calendar orders. So this reaches the second gate with
    // real model output and is thrown out there, which is the release path the
    // service comments describe and the one hardest to reach by accident.
    const base = sevenDayDraft();
    const fourDayDraft = { ...base, days: (base.days as unknown[]).slice(0, 4) };
    completeMock.mockResolvedValue(gatewayResult(fourDayDraft, false));

    const plan = await generatePlanForUser(userId, { daysPerWeek: 4, focus: 'general' }, '2026-08-03');

    expect(plan.generatedBy).toBeNull();
    expectReleased(userId, 'planGeneration');
    expect(await creditLedger.balance(userId)).toBe(before);
  });

  it('still returns a plan, and reserves nothing, for a user under the 5-credit cost', async () => {
    const userId = 'u-plan-broke';
    seedUser(userId);
    await creditLedger.grantDailyIfNeeded(userId);
    // Spend the day's grant down to 2 through an ordinary settled transaction,
    // so the balance is genuinely short rather than the grant being suppressed.
    // The grant is once-per-UTC-day, so the reserve below cannot top it back up.
    getStore().upsert<CreditTransaction & { id: string }>('ledger', {
      id: `ct-drain-${userId}`,
      userId,
      type: 'creditTransaction',
      kind: 'commit',
      amount: -(FREE_TIER_DAILY_CREDITS - 2),
      reservationId: `res-drain-${userId}`,
      reason: 'commit:chatTurn',
      createdAt: new Date().toISOString(),
    });
    expect(await creditLedger.balance(userId)).toBe(2);
    completeMock.mockResolvedValue(gatewayResult(sevenDayDraft(), false));

    const plan = await generatePlanForUser(userId, { daysPerWeek: 7, focus: 'general' }, '2026-08-03');

    // An empty balance costs the model's opinion, never the training plan.
    expect(plan.generatedBy).toBeNull();
    expect(plan.days).toHaveLength(7);
    // No hold was written at all — CREDITS_INSUFFICIENT is swallowed before the
    // ledger records anything, so there is nothing left dangling to release.
    expect(reserveRowFor(userId, 'planGeneration')).toBeUndefined();
    // And the lane was skipped rather than run for free.
    expect(completeMock).not.toHaveBeenCalled();
    expect(await creditLedger.balance(userId)).toBe(2);
  });
});

describe('exercise swap billing (exerciseSwap, 1 credit)', () => {
  function seedSession(userId: string, exerciseId: string): string {
    seedUser(userId);
    const localDate = '2026-08-03';
    const id = sessionId(userId, localDate);
    getStore().upsert<WorkoutSession>('plans', {
      id,
      userId,
      type: 'workoutSession',
      planId: `plan-${userId}`,
      planDayOrder: 1,
      focus: 'Full Body Strength',
      exercises: [
        {
          exerciseId,
          name: EXERCISES.find((ex) => ex.id === exerciseId)!.name,
          setsPlanned: 3,
          setsCompleted: 0,
          reps: 10,
          restSeconds: 60,
          skipped: false,
          targetWeightKg: null,
          targetReps: 10,
          targetRir: null,
        },
      ],
      status: 'pending',
      startedAt: null,
      completedAt: null,
      durationMinutes: null,
      kcalBurned: null,
      localDate,
    });
    return id;
  }

  it('charges nothing when a variationGroup sibling answers the swap', async () => {
    const userId = 'u-swap-free';
    const id = seedSession(userId, 'ex-pu-a');
    await creditLedger.grantDailyIfNeeded(userId);
    const before = await creditLedger.balance(userId);

    const { replacement } = await swapExercise(userId, id, 'ex-pu-a');

    expect(replacement.id).toBe('ex-pu-b'); // the interchangeable group variant
    // The model was never consulted, so the swap is free. Reserving on entry to
    // swapExercise — the obvious place — would have billed this path, which is
    // the most common swap there is.
    expect(completeMock).not.toHaveBeenCalled();
    expect(reserveRowFor(userId, 'exerciseSwap')).toBeUndefined();
    expect(await creditLedger.balance(userId)).toBe(before);
  });

  it("commits when the model's pick survived the deterministic constraints", async () => {
    const userId = 'u-swap-commit';
    const id = seedSession(userId, 'ex-sq');
    await creditLedger.grantDailyIfNeeded(userId);
    const before = await creditLedger.balance(userId);
    // ex-split, not ex-lunge: the deterministic same-primary-muscle fallback
    // takes the lowest id in the sorted pool, so picking the other quad
    // movement is what distinguishes "the model's suggestion was kept" from
    // "the fallback happened to agree" — and only the former may be charged.
    completeMock.mockResolvedValue(
      gatewayResult({ exerciseIds: ['ex-split'], rationale: 'Same quads, gentler on the knees.' }, false),
    );

    const { replacement, session } = await swapExercise(userId, id, 'ex-sq');

    expect(replacement.id).toBe('ex-split');
    expect(session.exercises[0]!.exerciseId).toBe('ex-split');
    expectCommitted(userId, 'exerciseSwap');
    expect(await creditLedger.balance(userId)).toBe(before - CREDIT_COSTS.exerciseSwap);
    expect(CREDIT_COSTS.exerciseSwap).toBe(1);
  });

  it('releases on degraded output while the swap itself still succeeds', async () => {
    const userId = 'u-swap-degraded';
    const id = seedSession(userId, 'ex-sq');
    await creditLedger.grantDailyIfNeeded(userId);
    const before = await creditLedger.balance(userId);
    completeMock.mockResolvedValue(
      gatewayResult({ exerciseIds: ['ex-split'], rationale: 'Same quads, gentler on the knees.' }, true),
    );

    const { replacement, session } = await swapExercise(userId, id, 'ex-sq');

    // The pick is usable and stands; it is the charge that is withdrawn.
    expect(replacement.id).toBe('ex-split');
    expect(session.exercises[0]!.exerciseId).toBe('ex-split');
    expectReleased(userId, 'exerciseSwap');
    expect(await creditLedger.balance(userId)).toBe(before);
  });

  it('releases, and still substitutes, when the model returns nothing usable', async () => {
    const userId = 'u-swap-refused';
    const id = seedSession(userId, 'ex-sq');
    await creditLedger.grantDailyIfNeeded(userId);
    const before = await creditLedger.balance(userId);
    // An out-of-pool id makes suggestExerciseSwap refuse the whole suggestion,
    // so the deterministic same-primary-muscle fallback answers instead.
    completeMock.mockResolvedValue(
      gatewayResult({ exerciseIds: ['ex-ghost'], rationale: 'Try this one.' }, false),
    );

    const { replacement } = await swapExercise(userId, id, 'ex-sq');

    expect(replacement.id).toBe('ex-lunge'); // the deterministic fallback
    expectReleased(userId, 'exerciseSwap');
    expect(await creditLedger.balance(userId)).toBe(before);
  });

  it('still swaps, and reserves nothing, for a user under the 1-credit cost', async () => {
    const userId = 'u-swap-broke';
    const id = seedSession(userId, 'ex-sq');
    await creditLedger.grantDailyIfNeeded(userId);
    getStore().upsert<CreditTransaction & { id: string }>('ledger', {
      id: `ct-drain-${userId}`,
      userId,
      type: 'creditTransaction',
      kind: 'commit',
      amount: -FREE_TIER_DAILY_CREDITS,
      reservationId: `res-drain-${userId}`,
      reason: 'commit:chatTurn',
      createdAt: new Date().toISOString(),
    });
    expect(await creditLedger.balance(userId)).toBe(0);

    const { replacement } = await swapExercise(userId, id, 'ex-sq');

    expect(replacement.id).toBe('ex-lunge');
    expect(completeMock).not.toHaveBeenCalled();
    expect(reserveRowFor(userId, 'exerciseSwap')).toBeUndefined();
    expect(await creditLedger.balance(userId)).toBe(0);
  });
});
