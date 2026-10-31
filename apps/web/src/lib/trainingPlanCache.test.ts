// @vitest-environment jsdom
/**
 * Generating a plan used to toast "ready" while the strip still said there
 * was no plan, until a later GET /plans/current came back. The generate
 * response is already the plan. The cache has to show it immediately.
 */
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { TrainingPlan } from '@aquazerofit/shared';
import { queryKeys } from './queries';
import { cacheGeneratedPlan, unwrapPlan } from './trainingPlanCache';

function plan(name: string): TrainingPlan {
  return {
    id: 'plan-1',
    userId: 'u1',
    type: 'trainingPlan',
    name,
    startDate: '2026-10-26',
    endDate: null,
    currentIteration: 1,
    days: [],
    progressionRules: [],
    generatedBy: null,
    createdAt: '2026-10-31T00:00:00.000Z',
  };
}

describe('cacheGeneratedPlan', () => {
  it('replaces a cached empty plan with the envelope the generate call returned', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.plan, null);

    const stored = cacheGeneratedPlan(client, { plan: plan('Full body') });

    expect(stored?.name).toBe('Full body');
    expect(client.getQueryData<TrainingPlan>(queryKeys.plan)?.name).toBe('Full body');
  });

  it('accepts a bare plan as well as the { plan } envelope', () => {
    const client = new QueryClient();
    expect(unwrapPlan(plan('Strength'))?.name).toBe('Strength');
    expect(cacheGeneratedPlan(client, plan('Strength'))?.id).toBe('plan-1');
  });

  it('leaves the cache alone when the body is not a plan', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.plan, null);
    expect(cacheGeneratedPlan(client, { ok: true })).toBeNull();
    expect(client.getQueryData(queryKeys.plan)).toBeNull();
  });
});
