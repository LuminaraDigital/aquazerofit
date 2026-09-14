import type { Food, MealLogItem } from '@aquazerofit/shared';
import { round1 } from '../dashboard/lib';

/** Deterministic client-side kcal/macros from per-100g values (never model-estimated). */
export function itemFromFood(food: Food, grams: number): MealLogItem {
  const factor = grams / 100;
  return {
    foodId: food.id,
    name: food.name,
    grams,
    kcal: Math.round(food.per100g.kcal * factor),
    proteinG: round1(food.per100g.proteinG * factor),
    carbsG: round1(food.per100g.carbsG * factor),
    fatG: round1(food.per100g.fatG * factor),
  };
}

/** Per-item scale factors from originally logged values (deterministic rescale). */
export function rescaleItem(original: MealLogItem, grams: number): MealLogItem {
  const factor = original.grams > 0 ? grams / original.grams : 0;
  return {
    ...original,
    grams,
    kcal: Math.round(original.kcal * factor),
    proteinG: round1(original.proteinG * factor),
    carbsG: round1(original.carbsG * factor),
    fatG: round1(original.fatG * factor),
  };
}
