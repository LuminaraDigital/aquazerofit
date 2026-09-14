/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

// ---------- Enums / controlled vocabularies ----------

export type Sex = 'male' | 'female' | 'unspecified';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
export type ExerciseExperience = 'beginner' | 'intermediate' | 'advanced';
export type UnitPreference = 'metric' | 'imperial';
export type NutritionEmphasis = 'standard' | 'protein_first';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type UserRole = 'user' | 'admin';
export type UserTier = 'free' | 'premium';

export const DIETARY_PREFERENCES = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'halal',
  'kosher',
  'glutenFree',
  'dairyFree',
  'lowCarb',
  'highProtein',
] as const;
export type DietaryPreference = (typeof DIETARY_PREFERENCES)[number];

export const ALLERGENS = [
  'peanuts',
  'treeNuts',
  'milk',
  'eggs',
  'fish',
  'shellfish',
  'soy',
  'wheat',
  'sesame',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const EQUIPMENT = [
  'none',
  'dumbbells',
  'resistanceBands',
  'kettlebell',
  'pullUpBar',
  'bench',
  'yogaMat',
  'jumpRope',
  // wger integration (Phase 1): values appended only — never reorder or rename
  // the entries above; persisted profiles reference them.
  'barbell',
  'ezBar',
  'cableMachine',
  'smithMachine',
  'swissBall',
  'inclineBench',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];
