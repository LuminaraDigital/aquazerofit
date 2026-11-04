import { describe, expect, it } from 'vitest';
import { hasLoggingHistory, homeNextStep, mealTypeForHour } from './lib';

describe('meal slot from the local hour', () => {
  it('does not call the small hours breakfast', () => {
    expect(mealTypeForHour(1)).toBe('snack');
    expect(mealTypeForHour(4)).toBe('snack');
    expect(mealTypeForHour(7)).toBe('breakfast');
    expect(mealTypeForHour(12)).toBe('lunch');
    expect(mealTypeForHour(16)).toBe('snack');
    expect(mealTypeForHour(19)).toBe('dinner');
    expect(mealTypeForHour(22)).toBe('snack');
  });
});

describe('home next step', () => {
  it('reserves the first-meal prompt for someone with no history', () => {
    expect(homeNextStep(true).title).toBe('Log your first meal');
    const returning = homeNextStep(false);
    expect(returning.title).toBe('Nothing logged today');
    expect(returning.title).not.toMatch(/first meal/i);
    expect(returning.body).toMatch(/today/i);
  });

  it('treats an earlier active day, a workout, or a weigh-in as history', () => {
    expect(hasLoggingHistory(null)).toBe(false);
    expect(hasLoggingHistory({ consistency: { lastActiveDate: null, activeDays: 0 } })).toBe(false);
    expect(hasLoggingHistory({ consistency: { lastActiveDate: '2026-11-02', activeDays: 4 } })).toBe(
      true,
    );
    expect(hasLoggingHistory({ workoutsCompleted: 2 })).toBe(true);
    expect(hasLoggingHistory({ currentWeightKg: 80 })).toBe(true);
  });
});
