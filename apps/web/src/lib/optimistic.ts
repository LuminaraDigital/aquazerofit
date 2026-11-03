/**
 * Pure cache transforms for the optimistic write paths.
 *
 * The `onMutate` → snapshot → roll back on error → invalidate on settle shape
 * already exists (useUpdateMemoryFact / useDeleteMemoryFact in queries.ts, and
 * WaterCard). What did not exist was anywhere to put the *transform*, so this
 * module holds the cache-shape knowledge and each mutation stays the six lines
 * of react-query wiring the pattern is supposed to be.
 *
 * The rule these functions are built around: **optimistically show what the
 * user just did, never a number the server derives.** A row appearing
 * instantly is a latency win; a calorie ring that guesses at a server total and
 * lands on the wrong figure is a correctness bug wearing a latency win's
 * clothes. So meal logging inserts a pending row and leaves every daily
 * aggregate alone, and workout completion carries the user's own set counts
 * across but never touches server-computed `kcalBurned`.
 */
import type { QueryClient } from '@tanstack/react-query';
import type {
  DailyNutrition,
  MealLog,
  MealLogItem,
  MealType,
  SessionExercise,
  WeightLog,
  WorkoutSession,
} from '@aquazerofit/shared';
import type { CompleteExerciseInput } from './contracts';

/**
 * Marks a row that exists only in the cache. Rendered in a pending state and
 * replaced wholesale by the server's row when the invalidation lands, so the
 * id never has to survive — it only has to not collide and to be recognisable.
 */
export const PENDING_ID_PREFIX = 'pending:';

export function isPendingId(id: string): boolean {
  return id.startsWith(PENDING_ID_PREFIX);
}

/**
 * A meal row for the cache, built from the items the user just confirmed.
 *
 * `total*` is a plain sum of numbers already in hand — the same arithmetic the
 * list header does on every render — and NOT an attempt to predict the day's
 * totals. Those (kcalConsumed, kcalRemaining, the macro rings) stay exactly as
 * the server last reported them; see insertPendingMealLog.
 */
export function pendingMealLog(input: {
  key: string;
  mealType: MealType;
  items: MealLogItem[];
  localDate: string;
}): MealLog {
  const sum = (pick: (item: MealLogItem) => number) =>
    input.items.reduce((acc, item) => acc + (Number.isFinite(pick(item)) ? pick(item) : 0), 0);

  return {
    id: `${PENDING_ID_PREFIX}${input.key}`,
    userId: '',
    type: 'mealLog',
    mealType: input.mealType,
    items: input.items,
    totalKcal: sum((i) => i.kcal),
    totalProteinG: sum((i) => i.proteinG),
    totalCarbsG: sum((i) => i.carbsG),
    totalFatG: sum((i) => i.fatG),
    source: 'manual',
    loggedAt: new Date().toISOString(),
    localDate: input.localDate,
  };
}

/**
 * Append a pending row to one meal of a cached day.
 *
 * Deliberately touches `meals` and nothing else. kcalConsumed / kcalNet /
 * kcalRemaining and the macro `.consumed` figures are server-derived: the API
 * folds the day's logs and applies the user's targets, and a client that
 * guessed at them would show a false calorie total for one round trip. The
 * per-meal kcal in the section header does move, because that number is summed
 * from `logs` in the component and is therefore true by construction.
 */
export function insertPendingMealLog(
  previous: DailyNutrition,
  log: MealLog,
): DailyNutrition {
  return {
    ...previous,
    meals: {
      ...previous.meals,
      [log.mealType]: [...(previous.meals[log.mealType] ?? []), log],
    },
  };
}

/**
 * Upsert a weigh-in into the cached range.
 *
 * Safe to show in full, unlike a meal total: the weight is the number the user
 * just typed, not one the server derives from it. One canonical entry per local
 * date (the API upserts), so an existing row for that date is replaced rather
 * than duplicated. The *targets* recomputed from this weight are server work
 * and are left to the invalidation.
 */
export function upsertWeightLog(previous: WeightLog[], log: WeightLog): WeightLog[] {
  const withoutSameDate = previous.filter((entry) => entry.localDate !== log.localDate);
  return [log, ...withoutSameDate].sort((a, b) => (a.localDate < b.localDate ? 1 : -1));
}

/** A weigh-in row for the cache, from the payload the user submitted. */
export function pendingWeightLog(input: {
  key: string;
  weightKg: number;
  note?: string;
  localDate: string;
}): WeightLog {
  return {
    id: `${PENDING_ID_PREFIX}${input.key}`,
    userId: '',
    type: 'weightLog',
    weightKg: input.weightKg,
    note: input.note,
    loggedAt: new Date().toISOString(),
    localDate: input.localDate,
  };
}

/**
 * Mark a session complete in the cache, carrying across the set counts the user
 * actually logged.
 *
 * `kcalBurned` is left untouched on purpose — the server computes it, and the
 * summary screen prints it. Everything written here (status, per-exercise
 * setsCompleted / skipped, the elapsed duration) is either the user's own input
 * or a clock reading the client already owns.
 */
export function applyCompletedSession(
  session: WorkoutSession,
  payload: { exercises: CompleteExerciseInput[]; durationMinutes: number; localDate: string },
): WorkoutSession {
  const byExerciseId = new Map(payload.exercises.map((entry) => [entry.exerciseId, entry]));

  return {
    ...session,
    status: 'completed',
    completedAt: new Date().toISOString(),
    durationMinutes: payload.durationMinutes,
    localDate: payload.localDate,
    exercises: session.exercises.map((exercise): SessionExercise => {
      const done = byExerciseId.get(exercise.exerciseId);
      if (!done) return exercise;
      return {
        ...exercise,
        setsCompleted: done.setsCompleted,
        skipped: done.skipped,
        ...(done.setLogs ? { setLogs: done.setLogs } : {}),
        ...(done.weightKg !== undefined ? { weightKg: done.weightKg } : {}),
        ...(done.rir !== undefined ? { rir: done.rir } : {}),
      };
    }),
  };
}

/**
 * Patch the session inside the ['workout','today'] cache **without changing the
 * envelope's shape**.
 *
 * That constraint is not cosmetic: the dashboard, the library and the detail
 * page all read this one key and each carves its own slice with `select`, so
 * caching a transformed value here hands the other two the wrong shape
 * depending on mount order (see the INVARIANT note on todayWorkoutQuery). An
 * envelope this does not recognise is returned untouched rather than rebuilt.
 */
export function patchTodaySession(
  envelope: unknown,
  patch: (session: WorkoutSession) => WorkoutSession,
): unknown {
  if (!envelope || typeof envelope !== 'object') return envelope;
  const record = envelope as { session?: unknown };
  if (record.session && typeof record.session === 'object') {
    return { ...record, session: patch(record.session as WorkoutSession) };
  }
  // Bare session (the endpoint has answered both shapes) — patch in place.
  if (Array.isArray((envelope as WorkoutSession).exercises)) {
    return patch(envelope as WorkoutSession);
  }
  return envelope;
}

// ------------------------------------------------------------- the wiring

/**
 * `{ onMutate, onError }` for one query key: cancel in flight, snapshot,
 * apply, restore on failure.
 *
 * This is the WaterCard sequence unchanged — it is factored out only so the
 * shipping object is the one the tests drive. A rollback that is copied into
 * three components and re-copied into a test is a rollback that can be deleted
 * from a component without a single test noticing, and the rollback is the
 * half of optimistic UI that never runs in development.
 *
 * `onSettled` deliberately stays at the call site: each mutation invalidates a
 * different set of neighbouring slices, and hiding that list in here would make
 * the blast radius of a write invisible where it is read.
 */
export function optimisticPatch<TCached, TVars>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  apply: (previous: TCached, variables: TVars) => TCached,
) {
  return {
    onMutate: async (variables: TVars): Promise<{ previous: TCached | undefined }> => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TCached>(queryKey);
      if (previous !== undefined) {
        queryClient.setQueryData<TCached>(queryKey, apply(previous, variables));
      }
      return { previous };
    },
    onError: (context: { previous: TCached | undefined } | undefined): void => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<TCached>(queryKey, context.previous);
      }
    },
  };
}
