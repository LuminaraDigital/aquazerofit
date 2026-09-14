/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

import type { Allergen, DietaryPreference, Equipment, ExerciseExperience } from './enums';

// ---------- content container ----------

export interface FoodNutrients {
  kcal: number; // per 100 g
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  potassiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
}

export interface NutritionSummary {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  potassiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
}

export interface Food {
  id: string;
  type: 'food';
  name: string;
  brand?: string;
  category: string;
  per100g: FoodNutrients;
  commonServings: { label: string; grams: number }[];
  allergens: Allergen[];
  source: string; // dataset identifier per AQF-12
  licence: string;
  // wger/OFF ingestion (Phase 4): optional enrichment fields.
  barcode?: string; // OFF `code` / EAN-13 when known
  nutriscore?: 'a' | 'b' | 'c' | 'd' | 'e';
  isVegan?: boolean;
  isVegetarian?: boolean;
  sourceUrl?: string; // provenance link (e.g. OFF product page)
}

export interface RecipeIngredient {
  foodId?: string;
  name: string;
  quantity: string;
  grams: number;
}

export interface Recipe {
  id: string;
  type: 'recipe';
  name: string;
  description: string;
  imageUrl?: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  perServing: FoodNutrients;
  ingredients: RecipeIngredient[];
  method: string[];
  tags: string[];
  suitableFor: DietaryPreference[];
  allergens: Allergen[];
  source: string;
  licence: string;
}

export interface ExerciseMedia {
  kind: 'image' | 'video';
  url: string;
  caption?: string;
  /** Pixel-level provenance. Optional so existing wger/API consumers remain compatible. */
  source?: 'wger' | 'aquazerofit';
  licence?: string;
  licenceAuthor?: string;
  licenceUrl?: string;
  attributionText?: string;
  isAiGenerated?: boolean;
}

export interface Exercise {
  id: string;
  type: 'exercise';
  name: string;
  description: string;
  category: 'strength' | 'cardio' | 'mobility' | 'core';
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: Equipment[];
  difficulty: ExerciseExperience;
  media: ExerciseMedia[];
  // Attribution fields are never stripped (AQF-12 obligation).
  licence: string;
  licenceAuthor: string;
  sourceId: string;
  // wger integration (Phase 1): provenance + variation metadata.
  wgerUuid?: string; // wger exercise base UUID — the stable upsert key (never the integer id)
  variationGroup?: string | null; // wger variation_group UUID; exercises sharing it are interchangeable
  licenceUrl?: string; // deed URL of the record's own CC licence
  isAiGeneratedMedia?: boolean; // wger image.is_ai_generated flag
}

/** wger licence reference (https://wger.de/api/v2/license/) — kept for attribution rendering. */
export interface WgerLicence {
  id: number;
  shortName: string; // e.g. 'CC-BY-SA 3'
  fullName: string;
  url: string;
}

export interface AchievementDefinition {
  id: string;
  type: 'achievementDefinition';
  name: string;
  description: string;
  icon: string;
  rule:
    | { kind: 'streak'; days: number }
    | { kind: 'weightLoss'; kg: number }
    | { kind: 'workoutsCompleted'; count: number }
    | { kind: 'mealsLogged'; count: number }
    | { kind: 'firstAction'; action: 'mealLog' | 'weightLog' | 'workout' | 'profile' };
}
