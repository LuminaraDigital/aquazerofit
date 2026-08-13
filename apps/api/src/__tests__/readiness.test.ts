/**
 * Adaptive readiness (Protect / Maintain / Progress).
 *
 * Two things are pinned here beyond the arithmetic. First, that `maintain`
 * leaves plan generation byte-identical to the pre-readiness engine — the
 * multiplier must never leak into the default path. Second, that no headline
 * or signal the user can see reaches for a shaming vocabulary: `protect` is
 * the app taking load off, and that is a product requirement, so it gets a
 * test rather than a comment.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  READINESS_MAINTAIN_MAX_SCORE,
  READINESS_PROTECT_MAX_SCORE,
  READINESS_VOLUME_MULTIPLIER,
  type Exercise,
  type MealLog,
  type PlanDay,
  type ReadinessAssessment,
  type TrainingPlan,
  type WellnessProfile,
  type WorkoutSession,
} from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-readiness-'));
process.env.AZF_DATA_DIR = dataDir;

const { getStore } = await import('../platform/store');
const { assessReadiness, modeForScore } = await import('../modules/plans/readiness');
const { buildPlan, prescriptionFor, scaleWorkingSets } = await import('../modules/plans/service');

const TODAY = '2026-08-04'; // window: 2026-07-29 .. 2026-08-04
const KCAL_TARGET = 2200;

/**
 * Every user-visible string readiness can emit is checked against this. The
 * list is the vocabulary of blame: it frames a quiet week as the user's
 * shortfall, which is exactly the framing this feature exists to remove.
 */
const SHAMING =
  /\b(fail|fails|failed|failing|failure|miss|missed|missing|only|behind|slack|slacking|lazy|excuse|should have|shouldn't have|fell short|gave up|lapse|relapse)\b/i;

// ----- fixtures -----

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function workoutDay(order: number, rest: boolean): PlanDay {
  return rest
    ? { order, focus: 'Rest', isRest: true, slots: [] }
    : {
        order,
        focus: 'Full Body Strength',
        isRest: false,
        slots: [
          {
            order: 1,
            entries: [{ id: `se-${order}-1`, exerciseId: 'ex-r-chest', sets: 3, reps: 10, restSeconds: 60 }],
          },
        ],
      };
}

function seedPlan(userId: string, startDate: string, workoutOrders: number[]): void {
  const plan: TrainingPlan = {
    id: `plan-${userId}`,
    userId,
    type: 'trainingPlan',
    name: 'Readiness Fixture Plan',
    startDate,
    endDate: null,
    currentIteration: 1,
    days: [1, 2, 3, 4, 5, 6, 7].map((order) => workoutDay(order, !workoutOrders.includes(order))),
    progressionRules: [],
    generatedBy: null,
    createdAt: `${startDate}T08:00:00.000Z`,
  };
  getStore().upsert('plans', plan);
}

function seedMeal(userId: string, localDate: string, kcal: number): void {
  const log: MealLog = {
    id: `meal-${userId}-${localDate}`,
    userId,
    type: 'mealLog',
    mealType: 'lunch',
    items: [],
    totalKcal: kcal,
    totalProteinG: 100,
    totalCarbsG: 200,
    totalFatG: 70,
    source: 'manual',
    loggedAt: `${localDate}T12:00:00.000Z`,
    localDate,
  };
  getStore().upsert('logs', log);
}

function seedCompletedWorkout(userId: string, localDate: string): void {
  const session: WorkoutSession = {
    id: `ws-${userId}-${localDate}`,
    userId,
    type: 'workoutSession',
    planId: `plan-${userId}`,
    planDayOrder: 1,
    focus: 'Full Body Strength',
    exercises: [],
    status: 'completed',
    startedAt: `${localDate}T17:00:00.000Z`,
    completedAt: `${localDate}T17:45:00.000Z`,
    durationMinutes: 45,
    kcalBurned: 300,
    localDate,
  };
  getStore().upsert('plans', session);
}

function seedTargets(userId: string): void {
  getStore().upsert('profiles', {
    id: `targets-${userId}`,
    type: 'derivedTargets',
    userId,
    bmr: 1700,
    tdee: 2400,
    kcalTarget: KCAL_TARGET,
    proteinG: 140,
    carbsG: 240,
    fatG: 70,
    waterMl: 2500,
    clamped: false,
    clampReason: null,
    computedAt: '2026-07-01T00:00:00.000Z',
    formulaVersion: 'test',
  });
}

// Users, all scored against the same TODAY.
const NEW_USER = 'u-rdy-new'; // nothing at all
const DAY_ONE_USER = 'u-rdy-day1'; // signed up and generated a plan today
const DROPOUT = 'u-rdy-dropout'; // real history, then a full quiet week
const CONSISTENT = 'u-rdy-strong'; // logging and training all week
const STEADY = 'u-rdy-steady'; // an ordinary, partial week

beforeAll(() => {
  // Day one: a plan exists but there is no week to read yet.
  seedPlan(DAY_ONE_USER, TODAY, [1, 3, 5]);

  // Dropout: three weeks of history, then nothing inside the window.
  seedPlan(DROPOUT, '2026-07-10', [1, 3, 5]);
  seedTargets(DROPOUT);
  for (let i = 0; i < 6; i += 1) {
    const date = addDays('2026-07-10', i);
    seedMeal(DROPOUT, date, KCAL_TARGET);
    if (i % 2 === 0) seedCompletedWorkout(DROPOUT, date);
  }

  // Consistent: plan prescribes all seven days; six trained, all seven logged
  // (including today), intake sitting on target.
  seedPlan(CONSISTENT, '2026-07-20', [1, 2, 3, 4, 5, 6, 7]);
  seedTargets(CONSISTENT);
  for (let i = 6; i >= 0; i -= 1) {
    const date = addDays(TODAY, -i);
    seedMeal(CONSISTENT, date, KCAL_TARGET);
    if (i > 0) seedCompletedWorkout(CONSISTENT, date);
  }

  // Steady: two of three sessions, four logged days, last check-in yesterday.
  seedPlan(STEADY, '2026-07-10', [1, 3, 5]);
  seedTargets(STEADY);
  for (const date of ['2026-07-30', '2026-07-31', '2026-08-02', '2026-08-03']) {
    seedMeal(STEADY, date, 2800);
  }
  seedCompletedWorkout(STEADY, '2026-07-31');
  seedCompletedWorkout(STEADY, '2026-08-02');
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

// ----- scoring -----

describe('assessReadiness cold start', () => {
  it('never greets a brand-new user with protect', () => {
    const assessment = assessReadiness(NEW_USER, TODAY);
    expect(assessment.mode).toBe('maintain');
    expect(assessment.mode).not.toBe('protect');
    expect(assessment.volumeMultiplier).toBe(1);
    expect(assessment.score).toBeGreaterThan(READINESS_PROTECT_MAX_SCORE);
    expect(assessment.score).toBeLessThanOrEqual(READINESS_MAINTAIN_MAX_SCORE);
  });

  it('says outright that there is not enough history yet', () => {
    const assessment = assessReadiness(NEW_USER, TODAY);
    expect(assessment.signals.length).toBeGreaterThanOrEqual(2);
    expect(assessment.signals.some((s) => /not enough history/i.test(s.detail))).toBe(true);
  });

  it('still holds on day one, when a plan exists but the week does not', () => {
    const assessment = assessReadiness(DAY_ONE_USER, TODAY);
    expect(assessment.mode).toBe('maintain');
    expect(assessment.signals.some((s) => /not enough history/i.test(s.detail))).toBe(true);
  });
});

describe('assessReadiness scoring', () => {
  it('puts a genuine multi-day dropout into protect', () => {
    const assessment = assessReadiness(DROPOUT, TODAY);
    expect(assessment.mode).toBe('protect');
    expect(assessment.score).toBeLessThanOrEqual(READINESS_PROTECT_MAX_SCORE);
    expect(assessment.volumeMultiplier).toBe(READINESS_VOLUME_MULTIPLIER.protect);
  });

  it('frames protect as support rather than a downgrade', () => {
    const { headline } = assessReadiness(DROPOUT, TODAY);
    expect(headline).toMatch(/lighter|eased/i);
    expect(headline).not.toMatch(SHAMING);
  });

  it('puts high adherence into progress', () => {
    const assessment = assessReadiness(CONSISTENT, TODAY);
    expect(assessment.mode).toBe('progress');
    expect(assessment.score).toBeGreaterThan(READINESS_MAINTAIN_MAX_SCORE);
    expect(assessment.volumeMultiplier).toBe(READINESS_VOLUME_MULTIPLIER.progress);
  });

  it('leaves an ordinary partial week on maintain', () => {
    const assessment = assessReadiness(STEADY, TODAY);
    expect(assessment.mode).toBe('maintain');
    expect(assessment.volumeMultiplier).toBe(1);
  });

  it('weighs a trailing gap harder than the same days lost piecemeal', () => {
    const scattered = 'u-rdy-scattered';
    const trailing = 'u-rdy-trailing';
    for (const userId of [scattered, trailing]) seedPlan(userId, '2026-07-10', [1, 3, 5]);
    // Both users check in on three days of the window; only the placement differs.
    for (const date of ['2026-07-29', '2026-07-31', '2026-08-04']) seedMeal(scattered, date, KCAL_TARGET);
    for (const date of ['2026-07-29', '2026-07-30', '2026-07-31']) seedMeal(trailing, date, KCAL_TARGET);

    const spread = assessReadiness(scattered, TODAY);
    const stopped = assessReadiness(trailing, TODAY);
    expect(stopped.score).toBeLessThan(spread.score);
  });

  it('reports 2–4 signals that explain the number', () => {
    for (const userId of [DROPOUT, CONSISTENT, STEADY]) {
      const { signals } = assessReadiness(userId, TODAY);
      expect(signals.length).toBeGreaterThanOrEqual(2);
      expect(signals.length).toBeLessThanOrEqual(4);
      for (const signal of signals) {
        expect(signal.label.length).toBeGreaterThan(0);
        expect(signal.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it('penalises intake below target exactly as much as intake above it', () => {
    const under = 'u-rdy-under';
    const over = 'u-rdy-over';
    for (const userId of [under, over]) {
      seedPlan(userId, '2026-07-10', [1, 3, 5]);
      seedTargets(userId);
      for (let i = 6; i >= 0; i -= 1) seedCompletedWorkout(userId, addDays(TODAY, -i));
    }
    for (let i = 6; i >= 0; i -= 1) {
      seedMeal(under, addDays(TODAY, -i), KCAL_TARGET * 0.8);
      seedMeal(over, addDays(TODAY, -i), KCAL_TARGET * 1.2);
    }
    expect(assessReadiness(under, TODAY).score).toBe(assessReadiness(over, TODAY).score);
  });

  it('clamps every score to 0–100 and keeps the period on the assessment', () => {
    for (const userId of [NEW_USER, DAY_ONE_USER, DROPOUT, CONSISTENT, STEADY]) {
      const assessment = assessReadiness(userId, TODAY);
      expect(assessment.score).toBeGreaterThanOrEqual(0);
      expect(assessment.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(assessment.score)).toBe(true);
      expect(assessment.periodDays).toBe(7);
    }
    expect(assessReadiness(CONSISTENT, TODAY, 14).periodDays).toBe(14);
  });

  it('is deterministic for the same store and the same day', () => {
    expect(assessReadiness(STEADY, TODAY)).toEqual(assessReadiness(STEADY, TODAY));
  });
});

describe('mode → multiplier mapping', () => {
  it.each([
    [0, 'protect'],
    [READINESS_PROTECT_MAX_SCORE, 'protect'],
    [READINESS_PROTECT_MAX_SCORE + 1, 'maintain'],
    [READINESS_MAINTAIN_MAX_SCORE, 'maintain'],
    [READINESS_MAINTAIN_MAX_SCORE + 1, 'progress'],
    [100, 'progress'],
  ] as const)('score %i maps to %s', (score, mode) => {
    expect(modeForScore(score)).toBe(mode);
  });

  it('carries the multiplier the constant defines for the chosen mode', () => {
    for (const userId of [NEW_USER, DROPOUT, CONSISTENT, STEADY]) {
      const assessment = assessReadiness(userId, TODAY);
      expect(assessment.volumeMultiplier).toBe(READINESS_VOLUME_MULTIPLIER[assessment.mode]);
    }
    expect(READINESS_VOLUME_MULTIPLIER.protect).toBe(0.6);
    expect(READINESS_VOLUME_MULTIPLIER.maintain).toBe(1);
    expect(READINESS_VOLUME_MULTIPLIER.progress).toBe(1.1);
  });
});

// ----- applying the multiplier to prescribed volume -----

describe('scaleWorkingSets', () => {
  it('is the identity at maintain', () => {
    expect(scaleWorkingSets([3, 3, 3, 3, 3], 1)).toEqual([3, 3, 3, 3, 3]);
    expect(scaleWorkingSets([4, 3, 3, 4, 3], 1)).toEqual([4, 3, 3, 4, 3]);
  });

  it('eases the day total at protect without emptying an exercise', () => {
    const scaled = scaleWorkingSets([3, 3, 3, 3, 3], 0.6);
    expect(scaled.reduce((a, b) => a + b, 0)).toBe(9); // 15 × 0.6
    for (const sets of scaled) expect(sets).toBeGreaterThanOrEqual(1);
  });

  it('actually raises volume at progress rather than rounding the nudge away', () => {
    const base = [3, 3, 3, 3, 3];
    const scaled = scaleWorkingSets(base, 1.1);
    expect(scaled.reduce((a, b) => a + b, 0)).toBeGreaterThan(base.reduce((a, b) => a + b, 0));
  });

  it('never produces a zero, fractional or out-of-schema set count', () => {
    for (const multiplier of [0.05, 0.6, 1, 1.1, 5]) {
      for (const base of [[1], [1, 1, 1], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4], [20, 20]]) {
        for (const sets of scaleWorkingSets(base, multiplier)) {
          expect(Number.isInteger(sets)).toBe(true);
          expect(sets).toBeGreaterThanOrEqual(1);
          expect(sets).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it('keeps a single-exercise day at one working set minimum', () => {
    expect(scaleWorkingSets([1], 0.6)).toEqual([1]);
    expect(scaleWorkingSets([2], 0.05)).toEqual([1]);
  });
});

describe('buildPlan under readiness', () => {
  const POOL: Exercise[] = [
    ['ex-r-chest', 'strength', ['chest']],
    ['ex-r-back', 'strength', ['back']],
    ['ex-r-quads', 'strength', ['quadriceps']],
    ['ex-r-glutes', 'strength', ['glutes']],
    ['ex-r-shoulders', 'strength', ['shoulders']],
    ['ex-r-triceps', 'strength', ['triceps']],
    ['ex-r-biceps', 'strength', ['biceps']],
    ['ex-r-core-1', 'core', ['core']],
    ['ex-r-core-2', 'core', ['core']],
    ['ex-r-cardio-1', 'cardio', ['quadriceps']],
    ['ex-r-cardio-2', 'cardio', ['quadriceps']],
    ['ex-r-cardio-3', 'cardio', ['calves']],
  ].map(([id, category, muscles]) => ({
    type: 'exercise',
    id: id as string,
    name: id as string,
    description: 'readiness fixture',
    category: category as Exercise['category'],
    primaryMuscles: muscles as string[],
    secondaryMuscles: [],
    equipment: ['none'],
    difficulty: 'beginner',
    media: [],
    licence: 'CC-BY-SA 4.0',
    licenceAuthor: 'wger.de community contributors',
    sourceId: `test-${id as string}`,
  }));

  const PROFILE: WellnessProfile = {
    userId: 'u-rdy-plan',
    weightKg: 72,
    heightCm: 172,
    age: 31,
    sex: 'unspecified',
    goal: 'maintain',
    activityLevel: 'moderate',
    exerciseExperience: 'beginner',
    dietaryPreferences: [],
    allergies: [],
    equipment: ['none'],
    unitPreference: 'metric',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  const base = {
    userId: 'u-rdy-plan',
    profile: PROFILE,
    exercises: POOL,
    daysPerWeek: 3,
    focus: 'general' as const,
    startDate: TODAY,
    now: new Date('2026-08-04T09:00:00.000Z'),
  };

  const setsOf = (plan: TrainingPlan): number[] =>
    plan.days.flatMap((day) => day.slots.flatMap((slot) => slot.entries.map((e) => e.sets)));

  it('leaves prescribed volume identical on the maintain path', () => {
    const untouched = buildPlan(base);
    const explicit = buildPlan({ ...base, volumeMultiplier: 1 });
    expect(setsOf(explicit)).toEqual(setsOf(untouched));

    // Pins the pre-readiness prescription itself, so the default path cannot
    // drift silently: every beginner slot is 3 sets, whatever the category.
    for (const day of untouched.days) {
      for (const slot of day.slots) {
        for (const entry of slot.entries) {
          const exercise = POOL.find((ex) => ex.id === entry.exerciseId)!;
          const rx = prescriptionFor('beginner', exercise.category);
          expect(entry.sets).toBe(rx.sets);
          expect(entry.reps).toBe(rx.reps);
          expect(entry.restSeconds).toBe(rx.restSeconds);
        }
      }
    }
    const setsRules = untouched.progressionRules.filter((r) => r.kind === 'sets');
    expect(setsRules.length).toBeGreaterThan(0);
    for (const rule of setsRules) expect(rule.value).toBe(4); // 3 base + 1
  });

  it('reduces the week at protect and lifts it at progress', () => {
    const maintain = setsOf(buildPlan(base)).reduce((a, b) => a + b, 0);
    const protect = setsOf(
      buildPlan({ ...base, volumeMultiplier: READINESS_VOLUME_MULTIPLIER.protect }),
    ).reduce((a, b) => a + b, 0);
    const progress = setsOf(
      buildPlan({ ...base, volumeMultiplier: READINESS_VOLUME_MULTIPLIER.progress }),
    ).reduce((a, b) => a + b, 0);

    expect(protect).toBeLessThan(maintain);
    expect(progress).toBeGreaterThan(maintain);
  });

  it('keeps every workout day at one working set or more under protect', () => {
    const plan = buildPlan({ ...base, volumeMultiplier: READINESS_VOLUME_MULTIPLIER.protect });
    for (const day of plan.days) {
      if (day.isRest) continue;
      expect(day.slots.length).toBeGreaterThan(0);
      for (const slot of day.slots) {
        for (const entry of slot.entries) expect(entry.sets).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('progresses from the eased base rather than snapping back next iteration', () => {
    const plan = buildPlan({ ...base, volumeMultiplier: READINESS_VOLUME_MULTIPLIER.protect });
    for (const day of plan.days) {
      for (const slot of day.slots) {
        for (const entry of slot.entries) {
          const rule = plan.progressionRules.find(
            (r) => r.slotEntryId === entry.id && r.kind === 'sets',
          )!;
          expect(rule.value).toBe(entry.sets + 1);
        }
      }
    }
  });
});

// ----- product requirement: nothing readiness says may shame the user -----

describe('non-shaming copy', () => {
  it('keeps every headline and signal clear of blame vocabulary', () => {
    const assessments: ReadinessAssessment[] = [
      NEW_USER,
      DAY_ONE_USER,
      DROPOUT,
      CONSISTENT,
      STEADY,
    ].map((userId) => assessReadiness(userId, TODAY));

    expect(assessments.map((a) => a.mode)).toContain('protect');
    expect(assessments.map((a) => a.mode)).toContain('progress');

    for (const assessment of assessments) {
      expect(assessment.headline).not.toMatch(SHAMING);
      for (const signal of assessment.signals) {
        expect(signal.label).not.toMatch(SHAMING);
        expect(signal.detail).not.toMatch(SHAMING);
      }
    }
  });
});
