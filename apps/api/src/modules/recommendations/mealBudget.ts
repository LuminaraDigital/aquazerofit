/**
 * Per-meal energy budget.
 *
 * The day's remainder is not a meal. Breakfast at a few hundred kilocalories
 * must not be described, or chosen, as if it could spend the whole day.
 * Code owns the figure: a share of the daily target, never more than what
 * is still left.
 */

export const MEAL_BUDGET_SHARE: Record<string, number> = {
  breakfast: 0.3,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.15,
};

export function mealBudgetKcal(remainingKcal: number, targetKcal: number, mealType: string): number {
  const share = MEAL_BUDGET_SHARE[mealType] ?? 0.3;
  const portion = Math.max(0, targetKcal) * share;
  const remaining = Math.max(0, remainingKcal);
  if (!Number.isFinite(portion) || !Number.isFinite(remaining)) return 0;
  return Math.round(Math.min(remaining, portion));
}

export function mealBudgetRationale(input: {
  mealType: string;
  mealBudgetKcal: number;
  remainingKcal: number;
  remainingProteinG: number;
  chosenProteinG: number;
  proteinFirst: boolean;
}): string {
  if (input.proteinFirst) {
    return `Prioritises protein for ${input.mealType}: about ${Math.round(input.chosenProteinG)} g toward your ${Math.round(input.remainingProteinG)} g remaining.`;
  }
  return `Fits a ${input.mealType} budget of about ${Math.round(input.mealBudgetKcal)} kcal, with ${Math.round(input.remainingKcal)} kcal left today, and supports your protein goal.`;
}

/**
 * True when a model rationale presents the whole-day remainder as the meal's
 * own budget. The deterministic sentence replaces it.
 */
export function rationaleQuotesDayAsMeal(rationale: string, remainingKcal: number, mealBudget: number): boolean {
  if (Math.round(remainingKcal) === Math.round(mealBudget)) return false;
  const day = String(Math.round(remainingKcal));
  return new RegExp(`remaining\\s*~?\\s*${day}\\s*kcal`, 'i').test(rationale);
}
