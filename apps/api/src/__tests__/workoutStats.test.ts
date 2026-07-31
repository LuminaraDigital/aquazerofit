/**
 * WorkoutStats contract tests (wger-integration-plan.md Phase 2.4): Brzycki
 * e1RM pinned to 'brzycki-v1', ISO-week bucketing, volume (sets × reps ×
 * weight) from per-set logs with the legacy rollup fallback.
 */
import { describe, expect, it } from 'vitest';
import type { Exercise, WorkoutSession } from '@aquazerofit/shared';
import {
  brzyckiE1rm,
  computeWorkoutStats,
  E1RM_FORMULA_VERSION,
  weekStartOf,
} from '../modules/workouts/stats';

describe('brzyckiE1rm (brzycki-v1)', () => {
  it('e1RM = weight × 36 / (37 − reps)', () => {
    expect(brzyckiE1rm(100, 10)).toBe(133.33);
    expect(brzyckiE1rm(100, 1)).toBe(100);
    expect(brzyckiE1rm(50, 8)).toBe(62.07);
  });
  it('is undefined at 37+ reps and without a load', () => {
    expect(brzyckiE1rm(100, 37)).toBeNull();
    expect(brzyckiE1rm(0, 10)).toBeNull();
  });
  it('pins the formula version constant', () => {
    expect(E1RM_FORMULA_VERSION).toBe('brzycki-v1');
  });
});

describe('weekStartOf', () => {
  it('returns the Monday of the ISO week', () => {
    expect(weekStartOf('2026-07-06')).toBe('2026-07-06'); // Monday
    expect(weekStartOf('2026-07-12')).toBe('2026-07-06'); // Sunday
    expect(weekStartOf('2026-07-08')).toBe('2026-07-06'); // Wednesday
  });
});

const exercise: Exercise = {
  id: 'ex-bench',
  type: 'exercise',
  name: 'Bench Press',
  description: '',
  category: 'strength',
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps'],
  equipment: ['barbell'],
  difficulty: 'intermediate',
  media: [],
  licence: 'CC-BY-SA 4.0',
  licenceAuthor: 'wger.de community contributors',
  sourceId: 'wger-1',
};

function session(overrides: Partial<WorkoutSession>): WorkoutSession {
  return {
    id: 'ws-1',
    userId: 'u1',
    type: 'workoutSession',
    planId: 'plan-1',
    planDayOrder: 1,
    focus: 'Upper Body Strength',
    exercises: [],
    status: 'completed',
    startedAt: null,
    completedAt: '2026-07-08T10:00:00Z',
    durationMinutes: 40,
    kcalBurned: 300,
    localDate: '2026-07-08',
    ...overrides,
  };
}

const byId = (id: string): Exercise | undefined => (id === exercise.id ? exercise : undefined);

describe('computeWorkoutStats', () => {
  it('aggregates per-set logs: volume, set count, best e1RM per exercise and muscle', () => {
    const stats = computeWorkoutStats(
      [
        session({
          exercises: [
            {
              exerciseId: 'ex-bench',
              name: 'Bench Press',
              setsPlanned: 3,
              setsCompleted: 3,
              reps: 10,
              restSeconds: 90,
              skipped: false,
              setLogs: [
                { set: 1, reps: 10, weightKg: 50, completed: true },
                { set: 2, reps: 8, weightKg: 50, completed: true },
                { set: 3, reps: 6, weightKg: 50, completed: false },
              ],
            },
          ],
        }),
      ],
      byId,
      4,
      '2026-07-12',
    );
    expect(stats).toHaveLength(1);
    const week = stats[0]!;
    expect(week.weekStart).toBe('2026-07-06');
    expect(week.sets).toBe(2); // the uncompleted set is excluded
    expect(week.volumeKg).toBe(900); // 50×10 + 50×8
    expect(week.byExercise['ex-bench']!.bestE1rmKg).toBe(66.67); // best: 50 × 36/27
    expect(week.byMuscle['chest']).toEqual({ sets: 2, volumeKg: 900, bestE1rmKg: 66.67 });
    expect(week.byMuscle['triceps']).toBeUndefined(); // primary muscles only
  });

  it('falls back to the legacy rollup when no setLogs exist', () => {
    const stats = computeWorkoutStats(
      [
        session({
          exercises: [
            {
              exerciseId: 'ex-bench',
              name: 'Bench Press',
              setsPlanned: 3,
              setsCompleted: 3,
              reps: 10,
              restSeconds: 90,
              skipped: false,
              weightKg: 20,
            },
          ],
        }),
      ],
      byId,
      4,
      '2026-07-12',
    );
    expect(stats[0]!.sets).toBe(3);
    expect(stats[0]!.volumeKg).toBe(600); // 3 × 10 × 20
    expect(stats[0]!.byExercise['ex-bench']!.bestE1rmKg).toBe(26.67);
  });

  it('excludes skipped exercises and non-completed sessions', () => {
    const stats = computeWorkoutStats(
      [
        session({
          exercises: [
            {
              exerciseId: 'ex-bench',
              name: 'Bench Press',
              setsPlanned: 3,
              setsCompleted: 0,
              reps: 10,
              restSeconds: 90,
              skipped: true,
              weightKg: 50,
            },
          ],
        }),
        session({ id: 'ws-2', status: 'pending', exercises: [] }),
      ],
      byId,
      4,
      '2026-07-12',
    );
    expect(stats).toHaveLength(0);
  });

  it('buckets by ISO week and drops sessions older than the window', () => {
    const mk = (id: string, localDate: string) =>
      session({
        id,
        localDate,
        exercises: [
          {
            exerciseId: 'ex-bench',
            name: 'Bench Press',
            setsPlanned: 1,
            setsCompleted: 1,
            reps: 5,
            restSeconds: 90,
            skipped: false,
            weightKg: 100,
          },
        ],
      });
    const stats = computeWorkoutStats(
      [mk('ws-a', '2026-07-08'), mk('ws-b', '2026-06-29'), mk('ws-c', '2026-06-01')],
      byId,
      2,
      '2026-07-12',
    );
    // 2-week window: weeks starting 2026-06-29 and 2026-07-06.
    expect(stats.map((w) => w.weekStart)).toEqual(['2026-06-29', '2026-07-06']);
  });
});
