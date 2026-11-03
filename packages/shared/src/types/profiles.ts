/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

import type {
  ActivityLevel,
  Allergen,
  DietaryPreference,
  Equipment,
  ExerciseExperience,
  Goal,
  NutritionEmphasis,
  Sex,
  UnitPreference,
} from './enums';

// ---------- profiles container ----------

export interface WellnessProfile {
  userId: string;
  weightKg: number; // 30–300, canonical kg
  heightCm: number; // 100–250, canonical cm
  age: number; // 16–100
  sex: Sex;
  goal: Goal;
  activityLevel: ActivityLevel;
  exerciseExperience: ExerciseExperience;
  dietaryPreferences: DietaryPreference[];
  allergies: Allergen[];
  equipment: Equipment[];
  unitPreference: UnitPreference;
  /** When `protein_first`, meal suggestions and the dashboard ring prioritise protein. */
  nutritionEmphasis?: NutritionEmphasis;
  targetWeightKg?: number;
  updatedAt: string;
}

export interface DerivedTargets {
  userId: string;
  bmr: number;
  tdee: number;
  kcalTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  clamped: boolean;
  clampReason: string | null;
  computedAt: string;
  formulaVersion: string;
  /** Present when adaptive expenditure was applied server-side. */
  adaptiveTdee?: number;
  adaptationKcal?: number;
  adaptiveConfidence?: 'high' | 'moderate' | 'low';
  adaptiveReasoning?: string;
  adaptiveEnabled?: boolean;
}
