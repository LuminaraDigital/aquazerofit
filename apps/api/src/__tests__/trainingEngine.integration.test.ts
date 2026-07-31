/**
 * Training-engine service tests (isolated AZF_DATA_DIR, no HTTP): today's
 * pre-computed payload with frozen targets, target+actual completion,
 * requires-gated progression across iterations, needLogsToAdvance stalling,
 * variation-aware swap, variations lookup and library query filters.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Exercise, PlanDay, TrainingPlan, WellnessProfile } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-training-'));
process.env.AZF_DATA_DIR = dataDir;

const { getStore } = await import('../platform/store');
const workouts = await import('../modules/workouts/service');

const START = '2026-07-06'; // plan start; day order 1, iteration 1
const WEEK2 = '2026-07-13'; // same day order, iteration 2

function exercise(overrides: Partial<Exercise> & Pick<Exercise, 'id' | 'name'>): Exercise {
  return {
    type: 'exercise',
    description: 'test exercise',
    category: 'strength',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
    equipment: ['barbell'],
    difficulty: 'intermediate',
    media: [],
    licence: 'CC-BY-SA 4.0',
    licenceAuthor: 'wger.de community contributors',
    sourceId: `test-${overrides.id}`,
    ...overrides,
  };
}

const BENCH = exercise({ id: 'ex-bench', name: 'Bench Press', variationGroup: 'vg-bench' });
const INCLINE = exercise({ id: 'ex-incline-bench', name: 'Incline Bench Press', variationGroup: 'vg-bench' });
const FLY = exercise({ id: 'ex-fly', name: 'Dumbbell Fly', equipment: ['dumbbells'] });

function profile(userId: string): WellnessProfile & { id: string; type: 'wellnessProfile' } {
  return {
    id: `profile-${userId}`,
    type: 'wellnessProfile',
    userId,
    weightKg: 80,
    heightCm: 180,
    age: 30,
    sex: 'male',
    goal: 'maintain',
    activityLevel: 'moderate',
    exerciseExperience: 'advanced',
    dietaryPreferences: [],
    allergies: [],
    equipment: ['barbell', 'none'],
    unitPreference: 'metric',
    updatedAt: new Date().toISOString(),
  };
}

function restDay(order: number): PlanDay {
  return { order, focus: 'Rest', isRest: true, slots: [] };
}

interface PlanOpts {
  needLogs?: boolean;
  progression?: TrainingPlan['progressionRules'];
}

function plan(userId: string, opts: PlanOpts = {}): TrainingPlan {
  return {
    id: `plan-${userId}`,
    userId,
    type: 'trainingPlan',
    name: 'Test Plan',
    startDate: START,
    endDate: null,
    currentIteration: 1,
    days: [
      {
        order: 1,
        focus: 'Upper Body Strength',
        isRest: false,
        needLogsToAdvance: opts.needLogs,
        slots: [
          {
            order: 1,
            entries: [{ id: 'se-1-1', exerciseId: 'ex-bench', sets: 3, reps: 10, restSeconds: 90, weightKg: 50, rir: 2 }],
          },
        ],
      },
      {
        order: 2,
        focus: 'Lower Body Strength',
        isRest: false,
        slots: [
          {
            order: 1,
            entries: [{ id: 'se-2-1', exerciseId: 'ex-bench', sets: 2, reps: 8, restSeconds: 60, weightKg: 52 }],
          },
        ],
      },
      restDay(3),
      restDay(4),
      restDay(5),
      restDay(6),
      restDay(7),
    ],
    progressionRules: opts.progression ?? [],
    generatedBy: null,
    createdAt: new Date().toISOString(),
  };
}

const GATED_RULE: TrainingPlan['progressionRules'] = [
  { slotEntryId: 'se-1-1', kind: 'weight', iteration: 2, op: 'add', step: 'abs', value: 2.5, requires: ['weight'] },
];

function seedUser(userId: string, opts: PlanOpts = {}): void {
  const store = getStore();
  store.upsert('profiles', profile(userId));
  store.upsert('plans', plan(userId, opts));
}

beforeAll(() => {
  const store = getStore();
  for (const ex of [BENCH, INCLINE, FLY]) store.upsert('content', ex);
  seedUser('u-tr1', { progression: GATED_RULE });
  seedUser('u-tr2', { progression: GATED_RULE });
  seedUser('u-tr3', { needLogs: true });
  seedUser('u-tr4'); // control: same plan without the flag
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('GET /workouts/today read model (mission 7 + target freezing, mission 5)', () => {
  it('creates the session with frozen targets and a folded, plate-rounded resolved payload', () => {
    const today = workouts.getTodayWorkout('u-tr1', START);
    expect(today.rest).toBe(false);
    expect(today.stalled).toBe(false);
    expect(today.localDate).toBe(START);
    expect(today.iteration).toBe(1);

    const se = today.session!.exercises[0]!;
    expect(se.targetWeightKg).toBe(50);
    expect(se.targetReps).toBe(10);
    expect(se.targetRir).toBe(2);
    // Legacy fields intact for the current UI.
    expect(se.setsPlanned).toBe(3);
    expect(se.reps).toBe(10);
    expect(se.restSeconds).toBe(90);

    const resolved = today.resolved!;
    expect(resolved.exercises).toHaveLength(1);
    const rex = resolved.exercises[0]!;
    expect(rex.sets).toHaveLength(3);
    expect(rex.sets[0]).toEqual({ set: 1, reps: 10, weightKg: 50, rir: 2, restSeconds: 90 });
  });

  it('rounds resolved weights to 2.5 kg plates while keeping the raw target', () => {
    const today = workouts.getTodayWorkout('u-tr1', '2026-07-07');
    const rex = today.resolved!.exercises[0]!;
    expect(rex.targetWeightKg).toBe(52);
    expect(rex.sets[0]!.weightKg).toBe(52.5); // plate-rounded
    expect(rex.sets).toHaveLength(2);
  });
});

describe('workout completion (mission 5)', () => {
  it('persists target + actual; targets survive plan edits', () => {
    const session = getStore().byId<import('@aquazerofit/shared').WorkoutSession>(
      'plans',
      workouts.sessionId('u-tr1', START),
    )!;
    const done = workouts.completeWorkout('u-tr1', session.id, {
      exercises: [
        {
          exerciseId: 'ex-bench',
          setsCompleted: 3,
          skipped: false,
          weightKg: 50,
          rir: 1.5,
          setLogs: [
            { set: 1, reps: 10, weightKg: 50, rir: 2, completed: true },
            { set: 2, reps: 10, weightKg: 50, rir: 1.5, completed: true },
            { set: 3, reps: 9, weightKg: 50, rir: 1, completed: true },
          ],
        },
      ],
      durationMinutes: 40,
      localDate: START,
    });
    expect(done.status).toBe('completed');
    expect(done.kcalBurned).toBeGreaterThan(0);
    const se = done.exercises[0]!;
    expect(se.weightKg).toBe(50);
    expect(se.rir).toBe(1.5);
    expect(se.setLogs).toHaveLength(3);

    // Plan edit after the fact: history is untouched.
    const store = getStore();
    const p = store.byId<TrainingPlan>('plans', 'plan-u-tr1')!;
    p.days[0]!.slots[0]!.entries[0]!.weightKg = 99;
    store.upsert('plans', p);
    const persisted = store.byId<TrainingPlan>('plans', 'plan-u-tr1')!;
    expect(persisted.days[0]!.slots[0]!.entries[0]!.weightKg).toBe(99);
    const historical = store.byId<import('@aquazerofit/shared').WorkoutSession>('plans', session.id)!;
    expect(historical.exercises[0]!.targetWeightKg).toBe(50);

    // Restore the plan so later progression tests see the original base.
    persisted.days[0]!.slots[0]!.entries[0]!.weightKg = 50;
    store.upsert('plans', persisted);
  });

  it('rejects completing the same workout twice', () => {
    expect(() =>
      workouts.completeWorkout('u-tr1', workouts.sessionId('u-tr1', START), {
        exercises: [{ exerciseId: 'ex-bench', setsCompleted: 3, skipped: false }],
        durationMinutes: 40,
        localDate: START,
      }),
    ).toThrowError(/already been completed/);
  });
});

describe('requires-gated progression (mission 4)', () => {
  it('applies the +2.5 kg rule at iteration 2 when iteration-1 logs met the weight target', () => {
    const today = workouts.getTodayWorkout('u-tr1', WEEK2);
    expect(today.iteration).toBe(2);
    expect(today.session!.exercises[0]!.targetWeightKg).toBe(52.5);
  });

  it('fails closed when the previous iteration did not meet the target', () => {
    // u-tr2 completes iteration 1 under the prescribed weight.
    const created = workouts.getTodayWorkout('u-tr2', START);
    workouts.completeWorkout('u-tr2', created.session!.id, {
      exercises: [{ exerciseId: 'ex-bench', setsCompleted: 3, skipped: false, weightKg: 45 }],
      durationMinutes: 40,
      localDate: START,
    });
    const week2 = workouts.getTodayWorkout('u-tr2', WEEK2);
    expect(week2.session!.exercises[0]!.targetWeightKg).toBe(50); // no progression
  });
});

describe('needLogsToAdvance (mission 6)', () => {
  it('stalls on the unlogged gated day instead of advancing', () => {
    const today = workouts.getTodayWorkout('u-tr3', '2026-07-07');
    expect(today.stalled).toBe(true);
    expect(today.localDate).toBe(START); // served: the day-1 session
    expect(today.focus).toBe('Upper Body Strength');
  });

  it('advances once the gated day is logged', () => {
    workouts.completeWorkout('u-tr3', workouts.sessionId('u-tr3', START), {
      exercises: [{ exerciseId: 'ex-bench', setsCompleted: 3, skipped: false, weightKg: 50 }],
      durationMinutes: 30,
      localDate: START,
    });
    const today = workouts.getTodayWorkout('u-tr3', '2026-07-07');
    expect(today.stalled).toBe(false);
    expect(today.localDate).toBe('2026-07-07');
    expect(today.focus).toBe('Lower Body Strength');
  });

  it('default off keeps the calendar behaviour (control user)', () => {
    const today = workouts.getTodayWorkout('u-tr4', '2026-07-07');
    expect(today.stalled).toBe(false);
    expect(today.localDate).toBe('2026-07-07');
  });
});

describe('variation-aware swap (mission 3)', () => {
  it('prefers another exercise from the same variationGroup', async () => {
    const sessionId = workouts.sessionId('u-tr1', '2026-07-07');
    const { session, replacement } = await workouts.swapExercise('u-tr1', sessionId, 'ex-bench');
    expect(replacement.id).toBe('ex-incline-bench');
    expect(session.exercises[0]!.exerciseId).toBe('ex-incline-bench');
    expect(session.exercises[0]!.name).toBe('Incline Bench Press');
    // Targets are preserved across the swap.
    expect(session.exercises[0]!.targetWeightKg).toBe(52);
  });

  it('refuses to swap on a completed workout', async () => {
    await expect(
      workouts.swapExercise('u-tr1', workouts.sessionId('u-tr1', START), 'ex-bench'),
    ).rejects.toThrowError(/completed workout/);
  });
});

describe('variations lookup (mission 2)', () => {
  it('returns variationGroup members first', () => {
    const { variations, basis } = workouts.getExerciseVariations('ex-bench');
    expect(basis).toBe('variationGroup');
    expect(variations.map((e) => e.id)).toEqual(['ex-incline-bench']);
  });

  it('falls back to same-primary-muscle matches when there is no group', () => {
    const { variations, basis } = workouts.getExerciseVariations('ex-fly');
    expect(basis).toBe('primaryMuscle');
    expect(variations.some((e) => e.id === 'ex-bench')).toBe(true);
    expect(variations.some((e) => e.id === 'ex-fly')).toBe(false); // excludes self
  });
});

describe('library query filters (mission 1)', () => {
  it('filters by muscle across primary and secondary muscles', () => {
    const { items, total } = workouts.queryExercises({ muscle: 'triceps' });
    expect(total).toBeGreaterThan(0);
    for (const ex of items) {
      expect([...ex.primaryMuscles, ...ex.secondaryMuscles]).toContain('triceps');
    }
  });

  it('filters by equipment', () => {
    const { items } = workouts.queryExercises({ equipment: 'barbell' });
    expect(items.length).toBeGreaterThan(0);
    for (const ex of items) expect(ex.equipment).toContain('barbell');
  });

  it('respectProfile limits results to equipment the user owns', () => {
    const { items } = workouts.queryExercises({ respectProfile: true, userId: 'u-tr1' });
    expect(items.some((e) => e.id === 'ex-fly')).toBe(false); // needs dumbbells
    expect(items.some((e) => e.id === 'ex-bench')).toBe(true);
  });

  it('paginates with limit/offset and reports the pre-pagination total', () => {
    const all = workouts.queryExercises({});
    const page1 = workouts.queryExercises({ limit: 5, offset: 0 });
    const page2 = workouts.queryExercises({ limit: 5, offset: 5 });
    expect(page1.total).toBe(all.total);
    expect(page1.items).toHaveLength(5);
    expect(page1.items[0]!.id).not.toBe(page2.items[0]?.id);
    expect([...page1.items, ...page2.items].map((e) => e.id)).toEqual(
      all.items.slice(0, 10).map((e) => e.id),
    );
  });
});
