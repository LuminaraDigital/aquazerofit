/**
 * The workouts screen reads GET /plans/current. Generation answers with the
 * plan it just wrote. Putting that body in the cache is what makes the strip
 * replace "No training plan yet" in the same turn as the toast. Waiting on a
 * follow-up GET leaves the empty state up for as long as that request takes,
 * and an in-flight 404 from before generation can land afterwards and wipe a
 * successful write.
 */
import type { QueryClient } from '@tanstack/react-query';
import type { TrainingPlan } from '@aquazerofit/shared';
import { api } from './api';
import { orNull } from './envelopes';
import { queryKeys } from './queries';

export function unwrapPlan(data: unknown): TrainingPlan | null {
  if (!data || typeof data !== 'object') return null;
  const maybe = (data as { plan?: unknown }).plan ?? data;
  return maybe && typeof maybe === 'object' && Array.isArray((maybe as TrainingPlan).days)
    ? (maybe as TrainingPlan)
    : null;
}

export const currentPlanQuery = {
  queryKey: queryKeys.plan,
  queryFn: async (): Promise<TrainingPlan | null> =>
    unwrapPlan(await orNull(() => api<unknown>('/plans/current'))),
} as const;

/** Write the generate response into the current-plan cache. Returns null when the body has no plan. */
export function cacheGeneratedPlan(queryClient: QueryClient, payload: unknown): TrainingPlan | null {
  const plan = unwrapPlan(payload);
  if (!plan) return null;
  queryClient.setQueryData(queryKeys.plan, plan);
  return plan;
}
