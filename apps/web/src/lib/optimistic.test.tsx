// @vitest-environment jsdom
/**
 * The optimistic write paths, and above all the rollback.
 *
 * Optimistic UI is easy to get right on the happy path and easy to get wrong
 * on the failing one, because the failing one is invisible in development —
 * the request succeeds every time on localhost. What breaks in production is
 * the rollback: the request fails, the snapshot is never restored, and the
 * cache is left holding a row the server has never heard of. Every mutation
 * here is therefore driven twice, once against a resolving mutationFn and once
 * against a rejecting one, and the rejecting case asserts the cache is
 * byte-for-byte the snapshot again.
 *
 * The second thing under test is the *restraint* in the transforms: that
 * logging a meal does not move a server-derived calorie total, and that
 * completing a session does not invent `kcalBurned`. A test that only checked
 * "the row appeared" would pass just as happily against a version that guessed
 * at the day's numbers, which is the failure this design exists to avoid.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type {
  DailyNutrition,
  MealLogItem,
  WeightLog,
  WorkoutSession,
} from '@aquazerofit/shared';
import {
  applyCompletedSession,
  insertPendingMealLog,
  isPendingId,
  optimisticPatch,
  patchTodaySession,
  pendingMealLog,
  pendingWeightLog,
  PENDING_ID_PREFIX,
  upsertWeightLog,
} from './optimistic';
import type { CompleteExerciseInput } from './contracts';

afterEach(cleanup);

/**
 * Retry off and a zero staleTime so a failure is a failure on the first
 * attempt. This is a harness for the mutation lifecycle, not an assertion
 * about main.tsx's defaults — those (staleTime 30_000, retry 1) are deliberate
 * and are not touched.
 */
function harness() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

/** Drive one mutation to completion, swallowing the rejection the test wants. */
async function run<TData, TVars, TCtx>(
  wrapper: ({ children }: { children: ReactNode }) => JSX.Element,
  options: UseMutationOptions<TData, Error, TVars, TCtx>,
  variables: TVars,
) {
  const { result } = renderHook(() => useMutation(options), { wrapper });
  await act(async () => {
    result.current.mutate(variables);
  });
  await waitFor(() => expect(result.current.isPending).toBe(false));
  return result;
}

// ---------------------------------------------------------------- fixtures

const ITEM: MealLogItem = {
  name: 'Grilled salmon',
  grams: 180,
  kcal: 367,
  proteinG: 39,
  carbsG: 0,
  fatG: 22,
};

const DAY: DailyNutrition = {
  date: '2026-08-28',
  kcalTarget: 2200,
  kcalConsumed: 900,
  kcalBurned: 300,
  kcalNet: 600,
  kcalRemaining: 1300,
  proteinG: { consumed: 60, target: 150 },
  carbsG: { consumed: 90, target: 220 },
  fatG: { consumed: 30, target: 70 },
  waterMl: { consumed: 1000, target: 2500 },
  meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
};

const WEIGH_INS: WeightLog[] = [
  {
    id: 'w-2',
    userId: 'u1',
    type: 'weightLog',
    weightKg: 81,
    loggedAt: '2026-08-27T07:00:00.000Z',
    localDate: '2026-08-27',
  },
  {
    id: 'w-1',
    userId: 'u1',
    type: 'weightLog',
    weightKg: 82,
    loggedAt: '2026-08-26T07:00:00.000Z',
    localDate: '2026-08-26',
  },
];

const SESSION: WorkoutSession = {
  id: 's-1',
  userId: 'u1',
  type: 'workoutSession',
  planId: 'p-1',
  planDayOrder: 1,
  focus: 'Upper',
  exercises: [
    {
      exerciseId: 'e-1',
      name: 'Push-up',
      setsPlanned: 3,
      setsCompleted: 0,
      reps: 10,
      restSeconds: 60,
      skipped: false,
    },
    {
      exerciseId: 'e-2',
      name: 'Row',
      setsPlanned: 3,
      setsCompleted: 0,
      reps: 10,
      restSeconds: 60,
      skipped: false,
    },
  ],
  status: 'pending',
  startedAt: null,
  completedAt: null,
  durationMinutes: null,
  kcalBurned: null,
  localDate: '2026-08-28',
};

/** The raw ['workout','today'] envelope the three consumers share. */
const TODAY_ENVELOPE = {
  rest: false,
  focus: 'Upper',
  session: SESSION,
  exercises: { 'e-1': { id: 'e-1' }, 'e-2': { id: 'e-2' } },
};

const COMPLETION: {
  exercises: CompleteExerciseInput[];
  durationMinutes: number;
  localDate: string;
} = {
  exercises: [
    { exerciseId: 'e-1', setsCompleted: 3, skipped: false },
    { exerciseId: 'e-2', setsCompleted: 1, skipped: true },
  ],
  durationMinutes: 27,
  localDate: '2026-08-28',
};

const DAILY_KEY = ['nutrition', 'daily', DAY.date] as const;
const WEIGHT_KEY = ['weight', '30d'] as const;
const TODAY_KEY = ['workout', 'today'] as const;

// ---------------------------------------------------------------- transforms

describe('optimistic transforms', () => {
  it('inserts a meal row that is flagged pending and totals only its own items', () => {
    const log = pendingMealLog({
      key: 'idem-1',
      mealType: 'lunch',
      items: [ITEM, { ...ITEM, name: 'Rice', kcal: 200, proteinG: 4, carbsG: 45, fatG: 1 }],
    localDate: DAY.date,
    });

    expect(isPendingId(log.id)).toBe(true);
    expect(log.id.startsWith(PENDING_ID_PREFIX)).toBe(true);
    expect(log.totalKcal).toBe(567);
    expect(log.totalProteinG).toBe(43);
    expect(log.totalCarbsG).toBe(45);
    expect(log.totalFatG).toBe(23);
  });

  it('leaves every server-derived daily total untouched when a meal is added', () => {
    const next = insertPendingMealLog(
      DAY,
      pendingMealLog({ key: 'idem-1', mealType: 'lunch', items: [ITEM], localDate: DAY.date }),
    );

    // The row is there...
    expect(next.meals.lunch).toHaveLength(1);
    expect(next.meals.lunch[0]?.totalKcal).toBe(367);

    // ...and not one aggregate the server owns has moved. This is the whole
    // point: a wrong calorie ring is worse than a late one.
    expect(next.kcalConsumed).toBe(DAY.kcalConsumed);
    expect(next.kcalRemaining).toBe(DAY.kcalRemaining);
    expect(next.kcalNet).toBe(DAY.kcalNet);
    expect(next.proteinG).toEqual(DAY.proteinG);
    expect(next.carbsG).toEqual(DAY.carbsG);
    expect(next.fatG).toEqual(DAY.fatG);
    expect(next.waterMl).toEqual(DAY.waterMl);
  });

  it('does not mutate the snapshot it was handed', () => {
    const before = structuredClone(DAY);
    insertPendingMealLog(
      DAY,
      pendingMealLog({ key: 'idem-1', mealType: 'lunch', items: [ITEM], localDate: DAY.date }),
    );
    expect(DAY).toEqual(before);
  });

  it('replaces rather than duplicates a weigh-in for a date already logged', () => {
    const next = upsertWeightLog(
      WEIGH_INS,
      pendingWeightLog({ key: 'idem-2', weightKg: 80.5, localDate: '2026-08-27' }),
    );

    expect(next).toHaveLength(2);
    expect(next.filter((l) => l.localDate === '2026-08-27')).toHaveLength(1);
    expect(next[0]?.weightKg).toBe(80.5);
  });

  it('keeps weigh-ins newest-first when a new date arrives', () => {
    const next = upsertWeightLog(
      WEIGH_INS,
      pendingWeightLog({ key: 'idem-2', weightKg: 80, localDate: '2026-08-28' }),
    );
    expect(next.map((l) => l.localDate)).toEqual(['2026-08-28', '2026-08-27', '2026-08-26']);
  });

  it('carries the user set counts into the session but never invents kcalBurned', () => {
    const next = applyCompletedSession(SESSION, COMPLETION);

    expect(next.status).toBe('completed');
    expect(next.durationMinutes).toBe(27);
    expect(next.completedAt).not.toBeNull();
    expect(next.exercises[0]?.setsCompleted).toBe(3);
    expect(next.exercises[1]?.setsCompleted).toBe(1);
    expect(next.exercises[1]?.skipped).toBe(true);

    // Server-computed, so still null rather than a plausible-looking guess.
    expect(next.kcalBurned).toBeNull();
  });

  it('patches the session inside the today envelope without reshaping it', () => {
    const next = patchTodaySession(TODAY_ENVELOPE, (s) =>
      applyCompletedSession(s, COMPLETION),
    ) as typeof TODAY_ENVELOPE;

    // The envelope's other keys are what the dashboard and library select on.
    expect(Object.keys(next).sort()).toEqual(Object.keys(TODAY_ENVELOPE).sort());
    expect(next.exercises).toEqual(TODAY_ENVELOPE.exercises);
    expect(next.focus).toBe('Upper');
    expect(next.session.status).toBe('completed');
  });

  it('returns an unrecognised envelope untouched rather than rebuilding it', () => {
    const rest = { rest: true, session: null };
    expect(patchTodaySession(rest, (s) => applyCompletedSession(s, COMPLETION))).toBe(rest);
    expect(patchTodaySession(null, (s) => s)).toBeNull();
  });
});

// ------------------------------------------------------- mutation lifecycles

/**
 * Each of these builds its options with the SAME `optimisticPatch` the page
 * components spread into `useMutation`, so deleting the rollback from
 * optimistic.ts fails these tests. Only `mutationFn` — the part a test must
 * fake to choose success or failure — differs from what ships.
 */
function mealOptions(client: QueryClient) {
  return optimisticPatch<DailyNutrition, { mealType: 'lunch'; item: MealLogItem }>(
    client,
    DAILY_KEY,
    (previous, { mealType, item }) =>
      insertPendingMealLog(
        previous,
        pendingMealLog({ key: 'idem-1', mealType, items: [item], localDate: DAY.date }),
      ),
  );
}

function weightOptions(client: QueryClient) {
  return optimisticPatch<WeightLog[], { weightKg: number; localDate: string }>(
    client,
    WEIGHT_KEY,
    (previous, payload) =>
      upsertWeightLog(previous, pendingWeightLog({ key: 'idem-2', ...payload })),
  );
}

function workoutOptions(client: QueryClient) {
  return optimisticPatch<unknown, typeof COMPLETION>(client, TODAY_KEY, (previous, payload) =>
    patchTodaySession(previous, (s) => applyCompletedSession(s, payload)),
  );
}

describe('meal logging', () => {
  it('shows the row before the request resolves', async () => {
    const { client, wrapper } = harness();
    client.setQueryData(DAILY_KEY, DAY);
    const patch = mealOptions(client);

    await run(
      wrapper,
      {
        mutationFn: async () => ({ ok: true }),
        ...patch,
        onError: (_e, _v, ctx) => patch.onError(ctx),
      },
      { mealType: 'lunch' as const, item: ITEM },
    );

    const after = client.getQueryData<DailyNutrition>(DAILY_KEY);
    expect(after?.meals.lunch).toHaveLength(1);
    expect(isPendingId(after!.meals.lunch[0]!.id)).toBe(true);
    // Still the server's numbers while the row is pending.
    expect(after?.kcalConsumed).toBe(DAY.kcalConsumed);
  });

  it('ROLLBACK: a failed meal log restores the snapshot exactly', async () => {
    const { client, wrapper } = harness();
    client.setQueryData(DAILY_KEY, DAY);
    const snapshot = structuredClone(DAY);
    const patch = mealOptions(client);

    await run(
      wrapper,
      {
        mutationFn: async () => {
          // The optimistic row really was applied first — otherwise this test
          // would pass with nothing for the rollback to undo.
          expect(client.getQueryData<DailyNutrition>(DAILY_KEY)?.meals.lunch).toHaveLength(1);
          throw new Error('offline');
        },
        ...patch,
        onError: (_e, _v, ctx) => patch.onError(ctx),
      },
      { mealType: 'lunch' as const, item: ITEM },
    );

    expect(client.getQueryData<DailyNutrition>(DAILY_KEY)).toEqual(snapshot);
    expect(client.getQueryData<DailyNutrition>(DAILY_KEY)?.meals.lunch).toHaveLength(0);
  });
});

describe('weight logging', () => {
  it('inserts the weigh-in immediately', async () => {
    const { client, wrapper } = harness();
    client.setQueryData(WEIGHT_KEY, WEIGH_INS);
    const patch = weightOptions(client);

    await run(
      wrapper,
      {
        mutationFn: async () => ({ ok: true }),
        ...patch,
        onError: (_e, _v, ctx) => patch.onError(ctx),
      },
      { weightKg: 80, localDate: '2026-08-28' },
    );

    const after = client.getQueryData<WeightLog[]>(WEIGHT_KEY);
    expect(after).toHaveLength(3);
    expect(after?.[0]?.weightKg).toBe(80);
  });

  it('ROLLBACK: a failed weigh-in restores the snapshot exactly', async () => {
    const { client, wrapper } = harness();
    client.setQueryData(WEIGHT_KEY, WEIGH_INS);
    const snapshot = structuredClone(WEIGH_INS);
    const patch = weightOptions(client);

    await run(
      wrapper,
      {
        mutationFn: async () => {
          expect(client.getQueryData<WeightLog[]>(WEIGHT_KEY)).toHaveLength(3);
          throw new Error('422');
        },
        ...patch,
        onError: (_e, _v, ctx) => patch.onError(ctx),
      },
      { weightKg: 80, localDate: '2026-08-28' },
    );

    expect(client.getQueryData<WeightLog[]>(WEIGHT_KEY)).toEqual(snapshot);
    expect(client.getQueryData<WeightLog[]>(WEIGHT_KEY)).toHaveLength(2);
  });
});

describe('workout completion', () => {
  it('marks the session complete inside the shared envelope', async () => {
    const { client, wrapper } = harness();
    client.setQueryData(TODAY_KEY, TODAY_ENVELOPE);
    const patch = workoutOptions(client);

    await run(
      wrapper,
      {
        mutationFn: async () => ({ ok: true }),
        ...patch,
        onError: (_e, _v, ctx) => patch.onError(ctx),
      },
      COMPLETION,
    );

    const after = client.getQueryData<typeof TODAY_ENVELOPE>(TODAY_KEY);
    expect(after?.session.status).toBe('completed');
    expect(after?.session.exercises[0]?.setsCompleted).toBe(3);
    // Still the envelope, not a bare session — the other two consumers of this
    // key depend on that, and it is the regression that white-screened
    // /workouts once already.
    expect(after?.exercises).toEqual(TODAY_ENVELOPE.exercises);
  });

  it('ROLLBACK: a failed completion restores the whole envelope', async () => {
    const { client, wrapper } = harness();
    client.setQueryData(TODAY_KEY, TODAY_ENVELOPE);
    const snapshot = structuredClone(TODAY_ENVELOPE);
    const patch = workoutOptions(client);

    await run(
      wrapper,
      {
        mutationFn: async () => {
          expect(client.getQueryData<typeof TODAY_ENVELOPE>(TODAY_KEY)?.session.status).toBe(
            'completed',
          );
          throw new Error('500');
        },
        ...patch,
        onError: (_e, _v, ctx) => patch.onError(ctx),
      },
      COMPLETION,
    );

    expect(client.getQueryData(TODAY_KEY)).toEqual(snapshot);
    expect(client.getQueryData<typeof TODAY_ENVELOPE>(TODAY_KEY)?.session.status).toBe('pending');
  });
});
