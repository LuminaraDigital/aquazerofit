import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '@aquazerofit/shared';
import {
  countLoggedMeals,
  freshenCoachText,
  reconcileToolSummaries,
  type CoachLiveSnapshot,
} from './snapshot';

const LIVE: CoachLiveSnapshot = {
  kcalConsumed: 420,
  kcalTarget: 2000,
  meals: 1,
  waterMl: 250,
  planName: 'Full body',
};

const EMPTY_TOOLS: ChatToolCall[] = [
  { tool: 'getTodayNutrition', args: {}, resultSummary: '0/2000 kcal, 0 meals, 0 ml water' },
  { tool: 'getCurrentPlan', args: {}, resultSummary: 'no active plan' },
  { tool: 'getTodayWorkout', args: {}, resultSummary: 'no plan and no session today' },
];

describe('coach snapshot', () => {
  it('counts meals across the day buckets the nutrition screen already has', () => {
    expect(countLoggedMeals({ breakfast: [{ id: 'a' }], lunch: [], dinner: [{ id: 'b' }] })).toBe(2);
    expect(countLoggedMeals(undefined)).toBe(0);
  });

  it('replaces an empty grounding card when a meal and a plan are already cached', () => {
    const next = reconcileToolSummaries(EMPTY_TOOLS, LIVE);
    expect(next?.map((call) => call.resultSummary)).toEqual([
      '420/2000 kcal, 1 meal, 250 ml water',
      'active plan "Full body"',
      'active plan "Full body"',
    ]);
  });

  it('does not rewrite a card that already matches or exceeds the cache', () => {
    const ahead: ChatToolCall[] = [
      { tool: 'getTodayNutrition', args: {}, resultSummary: '800/2000 kcal, 2 meals, 500 ml water' },
    ];
    expect(reconcileToolSummaries(ahead, LIVE)).toEqual(ahead);
  });

  it('does not paint logs onto a turn where personalisation is off', () => {
    const denied: ChatToolCall[] = [
      { tool: 'getTodayNutrition', args: {}, resultSummary: 'not available, personalisation off' },
    ];
    expect(reconcileToolSummaries(denied, LIVE)).toEqual(denied);
  });

  it('rewrites the offline empty-day sentences and leaves other prose alone', () => {
    const text =
      "Food: 0 / 2,000 kcal logged (2,000 kcal left). You don\u2019t have a training plan yet. Generate one from the Workouts tab and I can walk you through it.";
    const next = freshenCoachText(text, LIVE);
    expect(next).toContain('Food: 420 / 2000 kcal logged (1 meal).');
    expect(next).toContain('Your training plan is "Full body".');
    expect(next).not.toMatch(/0 \/ 2,000/);
    expect(next).not.toMatch(/don.t have a training plan/);

    expect(freshenCoachText('Ask me about dinner.', LIVE)).toBe('Ask me about dinner.');
    expect(freshenCoachText(text, null)).toBe(text);
  });
});
