/**
 * Client-side mirrors of the wger-integration backend contracts (Stage 2).
 * These shapes are frozen in the orchestration brief but are NOT exported from
 * packages/shared (frozen for Stage 2), so the web app keeps local copies.
 * Every consumer must tolerate the field being absent (backend rolling out in
 * parallel) and fall back to the legacy rendering path.
 */
import type { Exercise, Food } from '@aquazerofit/shared';

/** GET /exercises with any query param → paginated envelope; none → legacy array. */
export interface ExercisesPage {
  items: Exercise[];
  total: number;
  limit: number;
  offset: number;
}

/** GET /workouts/today optional `resolved` read model (pre-computed, display verbatim). */
export interface ResolvedTodayEntry {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  repsMax?: number | null;
  weightKg?: number | null;
  rir?: number | null;
  restSeconds: number;
  notes?: string;
}

export interface ResolvedToday {
  dayOrder: number;
  focus: string;
  entries: ResolvedTodayEntry[];
}

/** GET /workouts/stats — raw API envelope (week buckets). */
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

export interface WorkoutStatsResponse {
  formulaVersion: string;
  weeks: WeekStats[];
}

/** Normalised training stats for Progress charts and lists. */
export interface WorkoutStats {
  formulaVersion: string;
  weekly: { week: string; volumeKg: number; sets: number }[];
  perExercise: { exerciseId: string; name: string; e1rmKg: number; bestWeightKg: number }[];
  perMuscle: { muscle: string; volumeKg: number; sets: number }[];
}

/** Map API week buckets into the UI shapes Progress expects. */
export function normalizeWorkoutStats(raw: WorkoutStatsResponse): WorkoutStats {
  const weekly = raw.weeks.map((w) => ({
    week: w.weekStart,
    volumeKg: w.volumeKg,
    sets: w.sets,
  }));

  const exerciseAgg = new Map<
    string,
    { name: string; e1rmKg: number; volumeKg: number }
  >();
  for (const week of raw.weeks) {
    for (const [exerciseId, stats] of Object.entries(week.byExercise)) {
      const prev = exerciseAgg.get(exerciseId);
      const e1rmKg = stats.bestE1rmKg ?? 0;
      if (!prev) {
        exerciseAgg.set(exerciseId, { name: stats.name, e1rmKg, volumeKg: stats.volumeKg });
      } else {
        prev.e1rmKg = Math.max(prev.e1rmKg, e1rmKg);
        prev.volumeKg += stats.volumeKg;
      }
    }
  }
  const perExercise = [...exerciseAgg.entries()]
    .map(([exerciseId, stats]) => ({
      exerciseId,
      name: stats.name,
      e1rmKg: stats.e1rmKg,
      // API tracks best e1RM only; best working weight is unavailable from week stats.
      bestWeightKg: 0,
    }))
    .filter((ex) => ex.e1rmKg > 0 || exerciseAgg.get(ex.exerciseId)!.volumeKg > 0);

  const muscleAgg = new Map<string, { volumeKg: number; sets: number }>();
  for (const week of raw.weeks) {
    for (const [muscle, stats] of Object.entries(week.byMuscle)) {
      const prev = muscleAgg.get(muscle);
      if (!prev) {
        muscleAgg.set(muscle, { volumeKg: stats.volumeKg, sets: stats.sets });
      } else {
        prev.volumeKg += stats.volumeKg;
        prev.sets += stats.sets;
      }
    }
  }
  const perMuscle = [...muscleAgg.entries()].map(([muscle, stats]) => ({
    muscle,
    volumeKg: Math.round(stats.volumeKg * 100) / 100,
    sets: stats.sets,
  }));

  return { formulaVersion: raw.formulaVersion, weekly, perExercise, perMuscle };
}

/** GET /foods/barcode/:code (200). 404 = unknown barcode. */
export interface BarcodeLookup {
  food: Food;
  allergens: string[];
  /** Mapped may-contain traces (best-effort). */
  tracesAllergens?: string[];
  origin: 'local' | 'off-api';
}

/** POST /workouts/:id/complete per-exercise payload extension (Phase 2 actuals). */
export interface CompleteExerciseInput {
  exerciseId: string;
  setsCompleted: number;
  skipped: boolean;
  weightKg?: number | null;
  rir?: number | null;
  setLogs?: { set: number; reps: number; weightKg?: number | null; rir?: number | null; completed: boolean }[];
}

/** Tolerantly normalise /exercises responses: paginated envelope or legacy array. */
export function normalizeExercisesPage(data: unknown, offset: number): ExercisesPage {
  if (data && typeof data === 'object' && Array.isArray((data as ExercisesPage).items)) {
    const page = data as ExercisesPage;
    return {
      items: page.items,
      total: typeof page.total === 'number' ? page.total : page.items.length,
      limit: typeof page.limit === 'number' ? page.limit : page.items.length,
      offset: typeof page.offset === 'number' ? page.offset : offset,
    };
  }
  const items = Array.isArray(data) ? (data as Exercise[]) : [];
  return { items, total: items.length, limit: items.length, offset: 0 };
}

/** API ResolvedWorkout shape (Phase 2 pre-computed read model). */
interface ResolvedWorkoutApiExercise {
  exerciseId: string;
  name: string;
  setsPlanned: number;
  targetReps: number;
  targetWeightKg: number | null;
  targetRir: number | null;
  restSeconds: number;
  sets?: { set: number; reps: number; weightKg: number | null; rir: number | null; restSeconds: number }[];
}

interface ResolvedWorkoutApi {
  localDate?: string;
  iteration?: number;
  stalled?: boolean;
  exercises?: ResolvedWorkoutApiExercise[];
  entries?: ResolvedTodayEntry[];
  dayOrder?: number;
  focus?: string;
}

function mapResolvedExercise(ex: ResolvedWorkoutApiExercise): ResolvedTodayEntry {
  const firstSet = ex.sets?.[0];
  return {
    exerciseId: ex.exerciseId,
    name: ex.name,
    sets: ex.setsPlanned,
    reps: ex.targetReps,
    weightKg: ex.targetWeightKg ?? firstSet?.weightKg ?? null,
    rir: ex.targetRir ?? firstSet?.rir ?? null,
    restSeconds: ex.restSeconds,
  };
}

/** Extract the optional `resolved` read model from a /workouts/today payload. */
export function unwrapResolved(data: unknown): ResolvedToday | null {
  if (!data || typeof data !== 'object') return null;
  const maybe = (data as { resolved?: unknown }).resolved;
  if (!maybe || typeof maybe !== 'object') return null;

  const resolved = maybe as ResolvedWorkoutApi;

  if (Array.isArray(resolved.exercises) && resolved.exercises.length > 0) {
    return {
      dayOrder: resolved.dayOrder ?? 0,
      focus: resolved.focus ?? '',
      entries: resolved.exercises.map(mapResolvedExercise),
    };
  }

  if (Array.isArray(resolved.entries)) {
    return resolved as ResolvedToday;
  }

  return null;
}
