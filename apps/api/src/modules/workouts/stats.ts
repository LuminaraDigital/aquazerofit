/**
 * WorkoutStats — deterministic weekly training stats (Phase 2, wger computed
 * stats layer): volume (sets × reps × weight), set counts and Brzycki
 * estimated 1RM per exercise/muscle/week from completed sessions. Pure
 * computation over stored logs — no AI — so the insight lane (P-08) can trust
 * it. Formula pinned: e1RM = weight × 36 / (37 − reps) ('brzycki-v1').
 */
import type { Exercise, SessionExercise, WorkoutSession } from '@aquazerofit/shared';
import { getStore } from '../../platform/store';
import { addDays } from '../../platform/dates';

export const E1RM_FORMULA_VERSION = 'brzycki-v1';

/** Brzycki e1RM in kg; undefined outside 1–36 reps or without a load. */
export function brzyckiE1rm(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps < 1 || reps >= 37) return null;
  return Math.round(((weightKg * 36) / (37 - reps)) * 100) / 100;
}

/** Monday (ISO week start) of the week containing `localDate`. */
export function weekStartOf(localDate: string): string {
  const dow = (new Date(`${localDate}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(localDate, -dow);
}

interface PerformedSet {
  reps: number;
  weightKg: number | null;
}

/**
 * Actual per-set work. Per-set logs win; legacy sessions fall back to the
 * exercise-level rollup (setsCompleted × prescribed reps at logged weight).
 */
function performedSets(se: SessionExercise): PerformedSet[] {
  if (se.setLogs && se.setLogs.length > 0) {
    return se.setLogs
      .filter((s) => s.completed)
      .map((s) => ({ reps: s.reps, weightKg: s.weightKg ?? se.weightKg ?? null }));
  }
  if (se.setsCompleted <= 0) return [];
  return Array.from({ length: se.setsCompleted }, () => ({
    reps: se.reps,
    weightKg: se.weightKg ?? null,
  }));
}

export interface ExerciseWeekStats {
  name: string;
  sets: number;
  volumeKg: number;
  bestE1rmKg: number | null;
}

export interface MuscleWeekStats {
  sets: number;
  volumeKg: number;
  bestE1rmKg: number | null;
}

export interface WeekStats {
  weekStart: string;
  sets: number;
  volumeKg: number;
  byExercise: Record<string, ExerciseWeekStats>;
  byMuscle: Record<string, MuscleWeekStats>;
}

/**
 * Aggregate completed sessions into ISO-week buckets, covering the `weeks`
 * weeks ending with the week containing `today`. Only weeks with logged work
 * are returned, ascending by weekStart.
 */
export function computeWorkoutStats(
  sessions: WorkoutSession[],
  exerciseById: (id: string) => Exercise | undefined,
  weeks: number,
  today: string,
): WeekStats[] {
  const cutoff = addDays(weekStartOf(today), -7 * (weeks - 1));
  const buckets = new Map<string, WeekStats>();

  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    if (session.localDate < cutoff || session.localDate > today) continue;
    const weekStart = weekStartOf(session.localDate);
    let bucket = buckets.get(weekStart);
    if (!bucket) {
      bucket = { weekStart, sets: 0, volumeKg: 0, byExercise: {}, byMuscle: {} };
      buckets.set(weekStart, bucket);
    }

    for (const se of session.exercises) {
      if (se.skipped) continue;
      const sets = performedSets(se);
      if (sets.length === 0) continue;

      const volumeKg = sets.reduce((sum, s) => sum + (s.weightKg ?? 0) * s.reps, 0);
      const bestE1rm = sets.reduce<number | null>((best, s) => {
        if (s.weightKg === null) return best;
        const e1rm = brzyckiE1rm(s.weightKg, s.reps);
        return e1rm !== null && (best === null || e1rm > best) ? e1rm : best;
      }, null);

      bucket.sets += sets.length;
      bucket.volumeKg = Math.round((bucket.volumeKg + volumeKg) * 100) / 100;

      const exStats = (bucket.byExercise[se.exerciseId] ??= {
        name: se.name,
        sets: 0,
        volumeKg: 0,
        bestE1rmKg: null,
      });
      exStats.sets += sets.length;
      exStats.volumeKg = Math.round((exStats.volumeKg + volumeKg) * 100) / 100;
      if (bestE1rm !== null && (exStats.bestE1rmKg === null || bestE1rm > exStats.bestE1rmKg)) {
        exStats.bestE1rmKg = bestE1rm;
      }

      const exercise = exerciseById(se.exerciseId);
      for (const muscle of exercise?.primaryMuscles ?? []) {
        const mStats = (bucket.byMuscle[muscle] ??= { sets: 0, volumeKg: 0, bestE1rmKg: null });
        mStats.sets += sets.length;
        mStats.volumeKg = Math.round((mStats.volumeKg + volumeKg) * 100) / 100;
        if (bestE1rm !== null && (mStats.bestE1rmKg === null || bestE1rm > mStats.bestE1rmKg)) {
          mStats.bestE1rmKg = bestE1rm;
        }
      }
    }
  }

  // Weeks with no logged work (e.g. all-skipped sessions) are not emitted.
  return [...buckets.values()]
    .filter((week) => week.sets > 0)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export interface WorkoutStats {
  formulaVersion: typeof E1RM_FORMULA_VERSION;
  weeks: WeekStats[];
}

export function getWorkoutStats(userId: string, weeks: number, today: string): WorkoutStats {
  const store = getStore();
  const sessions = store.where<WorkoutSession>(
    'plans',
    (d) => d.type === 'workoutSession' && d.userId === userId && d.status === 'completed',
  );
  const exerciseById = (id: string): Exercise | undefined => {
    const exercise = store.byId<Exercise>('content', id);
    return exercise && exercise.type === 'exercise' ? exercise : undefined;
  };
  return {
    formulaVersion: E1RM_FORMULA_VERSION,
    weeks: computeWorkoutStats(sessions, exerciseById, weeks, today),
  };
}
