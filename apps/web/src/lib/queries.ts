/**
 * react-query hooks over api() — the single data layer for the web app.
 * Query keys are namespaced (see `queryKeys`); every mutation invalidates
 * exactly the slices listed in the engineering brief.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  AuthResponse,
  ConsentState,
  CreateMealLogInput,
  DailyNutrition,
  DerivedTargets,
  Food,
  MealLog,
  MemoryFact,
  MemoryFactCategory,
  MemoryFactStatus,
  ProfileInput,
  ProgressSummary,
  PublicUser,
  TrainingPlan,
  TrendPoint,
  UserMemory,
  WaterLog,
  WeightLog,
  WellnessProfile,
  WorkoutSession,
} from '@aquazerofit/shared';
import { api, ApiError, tokenStore } from './api';

export type TrendRange = '7d' | '30d' | '90d';

export interface NutritionTrends {
  kcal: TrendPoint[];
  weight: TrendPoint[];
  macros: {
    proteinG: TrendPoint[];
    carbsG: TrendPoint[];
    fatG: TrendPoint[];
  };
}

export const queryKeys = {
  me: ['me'] as const,
  profile: ['profile'] as const,
  targets: ['targets'] as const,
  consents: ['consents'] as const,
  memory: ['memory'] as const,
  nutritionDaily: (date: string) => ['nutrition', 'daily', date] as const,
  nutritionTrends: (range: TrendRange) => ['nutrition', 'trends', range] as const,
  progress: ['progress'] as const,
  plan: ['plan'] as const,
  workoutToday: ['workout', 'today'] as const,
  foods: (term: string) => ['foods', term] as const,
  weight: (range: TrendRange) => ['weight', range] as const,
};

/** Treat 404 as "absent" rather than an error (profile / plan / session). */
async function orNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Single resources come back in a named envelope ({ profile }, { targets },
 * { consents }, …). Accept both wrapped and bare shapes so hooks stay stable
 * if the envelope ever changes.
 */
function unwrap<T>(data: unknown, key: string): T | null {
  if (!data || typeof data !== 'object') return (data as T) ?? null;
  const record = data as Record<string, unknown>;
  if (key in record) return (record[key] as T) ?? null;
  return data as T;
}

// ---------- profile & targets ----------

export function useProfile(enabled = true): UseQueryResult<WellnessProfile | null> {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: async () =>
      unwrap<WellnessProfile>(await orNull(() => api<unknown>('/me/profile')), 'profile'),
    enabled: enabled && tokenStore.isAuthenticated,
  });
}

export function useTargets(enabled = true): UseQueryResult<DerivedTargets | null> {
  return useQuery({
    queryKey: queryKeys.targets,
    queryFn: async () =>
      unwrap<DerivedTargets>(await orNull(() => api<unknown>('/me/targets')), 'targets'),
    enabled: enabled && tokenStore.isAuthenticated,
  });
}

/**
 * Account identity from GET /me. The localStorage snapshot written at login
 * seeds `placeholderData` so the identity paints instantly on boot; the
 * server response then refreshes both the cache and the snapshot.
 */
export function useMe(): UseQueryResult<PublicUser | null> {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const user = unwrap<PublicUser>(await orNull(() => api<unknown>('/me')), 'user');
      storeUser(user ?? undefined);
      return user;
    },
    placeholderData: () => getStoredUser(),
    enabled: tokenStore.isAuthenticated,
  });
}

/** PATCH /me — display name / timezone. Invalidates the `me` query. */
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { displayName?: string; timezone?: string }) =>
      api<{ user: PublicUser }>('/me', { method: 'PATCH', body: input }),
    onSuccess: (res) => {
      const user = unwrap<PublicUser>(res, 'user');
      if (user) {
        storeUser(user);
        qc.setQueryData(queryKeys.me, user);
      }
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) =>
      api<{ profile: WellnessProfile; targets: DerivedTargets }>('/me/profile', {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['targets'] });
    },
  });
}

// ---------- consents ----------

export function useConsents(): UseQueryResult<ConsentState | null> {
  return useQuery({
    queryKey: queryKeys.consents,
    queryFn: async () =>
      unwrap<ConsentState>(await orNull(() => api<unknown>('/me/consents')), 'consents'),
    enabled: tokenStore.isAuthenticated,
  });
}

export function useUpdateConsents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      wellnessDataProcessing: boolean;
      aiPersonalisation: boolean;
      anonymisedAnalytics: boolean;
      reminders: boolean;
    }) => api<ConsentState>('/me/consents', { method: 'PUT', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['consents'] }),
  });
}

// ---------- nutrition ----------

export function useDailyNutrition(date: string): UseQueryResult<DailyNutrition> {
  return useQuery({
    queryKey: queryKeys.nutritionDaily(date),
    queryFn: () => api<DailyNutrition>('/analytics/nutrition/daily', { query: { date } }),
    enabled: Boolean(date) && tokenStore.isAuthenticated,
  });
}

export function useNutritionTrends(range: TrendRange): UseQueryResult<NutritionTrends> {
  return useQuery({
    queryKey: queryKeys.nutritionTrends(range),
    queryFn: () => api<NutritionTrends>('/analytics/nutrition/trends', { query: { range } }),
    enabled: tokenStore.isAuthenticated,
  });
}

// ---------- progress / plans / workouts ----------

export function useProgressSummary(): UseQueryResult<ProgressSummary> {
  return useQuery({
    queryKey: queryKeys.progress,
    queryFn: () => api<ProgressSummary>('/progress/summary'),
    enabled: tokenStore.isAuthenticated,
  });
}

export function useCurrentPlan(): UseQueryResult<TrainingPlan | null> {
  return useQuery({
    queryKey: queryKeys.plan,
    queryFn: () => orNull(() => api<TrainingPlan>('/plans/current')),
    enabled: tokenStore.isAuthenticated,
  });
}

export function useTodayWorkout(): UseQueryResult<WorkoutSession | null> {
  return useQuery({
    queryKey: queryKeys.workoutToday,
    queryFn: () => orNull(() => api<WorkoutSession>('/workouts/today')),
    enabled: tokenStore.isAuthenticated,
  });
}

// ---------- food search ----------

export function useFoodSearch(term: string): UseQueryResult<Food[]> {
  return useQuery({
    queryKey: queryKeys.foods(term),
    queryFn: async () => {
      const res = await api<Food[] | { items: Food[] }>('/foods', { query: { search: term } });
      return Array.isArray(res) ? res : res.items;
    },
    enabled: term.trim().length >= 2 && tokenStore.isAuthenticated,
    staleTime: 5 * 60_000,
  });
}

// ---------- mutations ----------

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Logging a meal invalidates ['nutrition'] + ['progress']. */
export function useLogMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMealLogInput) =>
      api<MealLog>('/meal-logs', {
        method: 'POST',
        body: input,
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

/** Logging water invalidates ['nutrition'] + ['progress']. */
export function useLogWater() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amountMl: number; localDate: string }) =>
      api<WaterLog>('/water-logs', {
        method: 'POST',
        body: input,
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

/** Logging weight invalidates ['weight'] + ['progress'] + ['targets']. */
export function useLogWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { weightKg: number; note?: string; localDate: string }) =>
      api<WeightLog>('/weight-logs', {
        method: 'POST',
        body: input,
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['weight'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
      void qc.invalidateQueries({ queryKey: ['targets'] });
    },
  });
}

/** Generating a plan invalidates ['plan'] + ['workout']. */
export function useGeneratePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { daysPerWeek?: number; focus?: 'weightLoss' | 'strength' | 'general' }) =>
      api<TrainingPlan>('/plans/generate', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plan'] });
      void qc.invalidateQueries({ queryKey: ['workout'] });
    },
  });
}

/** Completing a workout invalidates ['workout'] + ['plan'] + ['progress']. */
export function useCompleteWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      exercises: { exerciseId: string; setsCompleted: number; skipped?: boolean }[];
      durationMinutes: number;
      localDate: string;
    }) =>
      api<WorkoutSession>(`/workouts/${input.id}/complete`, {
        method: 'POST',
        body: {
          exercises: input.exercises,
          durationMinutes: input.durationMinutes,
          localDate: input.localDate,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workout'] });
      void qc.invalidateQueries({ queryKey: ['plan'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

// ---------- auth actions ----------

const USER_KEY = 'azf.user';

/**
 * Last authenticated user snapshot — instant-boot fallback only.
 * GET /me (useMe) is the source of truth; this just avoids a blank identity
 * while the first request is in flight.
 */
export function getStoredUser(): PublicUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

function storeUser(user: PublicUser | undefined): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // storage full / unavailable — non-fatal
  }
}

/**
 * AuthContext-free auth actions wrapping api() + tokenStore.
 * Each action manages tokens and the react-query cache; navigation is up
 * to the caller.
 */
export function useAuthActions() {
  const qc = useQueryClient();

  async function login(email: string, password: string): Promise<AuthResponse> {
    const res = await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    tokenStore.set(res);
    storeUser(res.user);
    qc.clear();
    return res;
  }

  async function register(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResponse> {
    const res = await api<Partial<AuthResponse>>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    });
    if (res && res.accessToken && res.refreshToken && res.user) {
      const full = res as AuthResponse;
      tokenStore.set(full);
      storeUser(full.user);
      qc.clear();
      return full;
    }
    // Register endpoints that only dispatch verification: fall through to login.
    return login(input.email, input.password);
  }

  async function telegramLogin(initData: string): Promise<AuthResponse> {
    const res = await api<AuthResponse>('/auth/telegram', {
      method: 'POST',
      body: { initData },
      auth: false,
    });
    tokenStore.set(res);
    storeUser(res.user);
    qc.clear();
    return res;
  }

  async function logout(): Promise<void> {
    // Send the stored refresh token so the server can revoke the whole
    // refresh-token family — without it the session stays revocable-only
    // client-side. Revocation is still best-effort (offline-safe).
    const refreshToken = tokenStore.refresh;
    try {
      await api<void>('/auth/logout', {
        method: 'POST',
        body: refreshToken ? { refreshToken } : {},
        retryOn401: false,
      });
    } catch {
      // Revocation is best-effort; local sign-out always proceeds.
    }
    tokenStore.clear();
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
    qc.clear();
  }

  return { login, register, telegramLogin, logout };
}

export type { MemoryFact, MemoryFactCategory, MemoryFactStatus, UserMemory };

// ---------- coach memory ----------

/**
 * GET /me/memory. 404 → null ("no memory yet"); 403 CONSENT_REQUIRED is
 * surfaced to the caller (the Memory page renders a calm consent explainer,
 * not an error). Client errors are never retried.
 */
export function useMemory(): UseQueryResult<UserMemory | null> {
  return useQuery({
    queryKey: queryKeys.memory,
    queryFn: async () =>
      unwrap<UserMemory>(await orNull(() => api<unknown>('/me/memory')), 'memory'),
    enabled: tokenStore.isAuthenticated,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
      failureCount < 1,
  });
}

/** Every memory mutation returns the fresh { memory } envelope — write it straight into the cache. */
function writeMemory(qc: ReturnType<typeof useQueryClient>, data: { memory: UserMemory }): void {
  const memory = unwrap<UserMemory>(data, 'memory');
  if (memory) qc.setQueryData(queryKeys.memory, memory);
  else void qc.invalidateQueries({ queryKey: queryKeys.memory });
}

export function useAddMemoryFact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string; category: MemoryFactCategory }) =>
      api<{ memory: UserMemory }>('/me/memory/facts', { method: 'POST', body: input }),
    onSuccess: (res) => writeMemory(qc, res),
  });
}

/** PATCH one fact (status confirm/reject or text edit) — optimistic, rolls back on error. */
export function useUpdateMemoryFact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      factId,
      ...patch
    }: {
      factId: string;
      status?: MemoryFactStatus;
      text?: string;
    }) =>
      api<{ memory: UserMemory }>(`/me/memory/facts/${factId}`, {
        method: 'PATCH',
        body: patch,
      }),
    onMutate: async ({ factId, ...patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.memory });
      const prev = qc.getQueryData<UserMemory | null>(queryKeys.memory);
      if (prev) {
        qc.setQueryData<UserMemory>(queryKeys.memory, {
          ...prev,
          facts: prev.facts.map((f) => (f.id === factId ? { ...f, ...patch } : f)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) qc.setQueryData(queryKeys.memory, ctx.prev);
    },
    onSuccess: (res) => writeMemory(qc, res),
  });
}

/** DELETE one fact — optimistic removal, rolls back on error. */
export function useDeleteMemoryFact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (factId: string) =>
      api<{ memory: UserMemory }>(`/me/memory/facts/${factId}`, { method: 'DELETE' }),
    onMutate: async (factId) => {
      await qc.cancelQueries({ queryKey: queryKeys.memory });
      const prev = qc.getQueryData<UserMemory | null>(queryKeys.memory);
      if (prev) {
        qc.setQueryData<UserMemory>(queryKeys.memory, {
          ...prev,
          facts: prev.facts.filter((f) => f.id !== factId),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) qc.setQueryData(queryKeys.memory, ctx.prev);
    },
    onSuccess: (res) => writeMemory(qc, res),
  });
}

/** DELETE /me/memory ("forget everything") → 204. */
export function useClearMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/me/memory', { method: 'DELETE' }),
    onSuccess: () => {
      qc.setQueryData(queryKeys.memory, null);
      void qc.invalidateQueries({ queryKey: queryKeys.memory });
    },
  });
}
