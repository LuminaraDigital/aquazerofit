/**
 * Premium is a daily cap. These numbers are the product decision: free stays
 * at ten credits (three meal photographs, at three credits each), and premium
 * stays at sixty (twenty photographs). Raising premium without rewriting this
 * test is how the allowance becomes an open meter again.
 */
import { describe, expect, it } from 'vitest';
import {
  CREDIT_COSTS,
  FREE_TIER_DAILY_CREDITS,
  PREMIUM_TIER_DAILY_CREDITS,
  maxBankedCreditsFor,
} from '@aquazerofit/shared';

describe('premium fair use', () => {
  it('keeps the free day at ten credits, which is three meal photographs', () => {
    expect(FREE_TIER_DAILY_CREDITS).toBe(10);
    expect(CREDIT_COSTS.mealPhoto).toBe(3);
    expect(Math.floor(FREE_TIER_DAILY_CREDITS / CREDIT_COSTS.mealPhoto)).toBe(3);
  });

  it('caps premium at sixty credits a day, banked at most two days', () => {
    expect(PREMIUM_TIER_DAILY_CREDITS).toBe(60);
    expect(Math.floor(PREMIUM_TIER_DAILY_CREDITS / CREDIT_COSTS.mealPhoto)).toBe(20);
    expect(Math.floor(PREMIUM_TIER_DAILY_CREDITS / CREDIT_COSTS.chatTurn)).toBe(60);
    expect(maxBankedCreditsFor('premium')).toBe(120);
    expect(maxBankedCreditsFor('free')).toBe(20);
  });
});
