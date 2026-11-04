import { describe, expect, it } from 'vitest';
import {
  mealBudgetKcal,
  mealBudgetRationale,
  rationaleQuotesDayAsMeal,
} from '../modules/recommendations/mealBudget';

describe('per-meal budget', () => {
  it('does not treat the whole-day remainder as the breakfast budget', () => {
    const budget = mealBudgetKcal(2464, 2870, 'breakfast');
    expect(budget).toBe(Math.round(2870 * 0.3));
    expect(budget).toBeLessThan(1000);

    const text = mealBudgetRationale({
      mealType: 'breakfast',
      mealBudgetKcal: budget,
      remainingKcal: 2464,
      remainingProteinG: 140,
      chosenProteinG: 30,
      proteinFirst: false,
    });
    expect(text).toContain(`${budget} kcal`);
    expect(text).toContain('2464 kcal left today');
    expect(text).not.toMatch(/remaining ~2464 kcal for breakfast/);
  });

  it('caps the meal at whatever is actually left', () => {
    expect(mealBudgetKcal(120, 2870, 'dinner')).toBe(120);
    expect(mealBudgetKcal(0, 2000, 'lunch')).toBe(0);
  });

  it('flags a rationale that quotes the day remainder as the meal budget', () => {
    expect(rationaleQuotesDayAsMeal('Fits your remaining ~2464 kcal for breakfast', 2464, 861)).toBe(
      true,
    );
    expect(rationaleQuotesDayAsMeal('Fits a breakfast budget of about 861 kcal', 2464, 861)).toBe(
      false,
    );
    expect(rationaleQuotesDayAsMeal('Fits your remaining ~400 kcal for a snack', 400, 400)).toBe(
      false,
    );
  });
});
