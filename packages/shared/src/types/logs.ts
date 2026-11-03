/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

import type { MealType } from './enums';

// ---------- logs container ----------

export interface MealLogItem {
  foodId?: string;
  name: string;
  grams: number;
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

export interface MealLog {
  id: string;
  userId: string;
  type: 'mealLog';
  mealType: MealType;
  items: MealLogItem[];
  totalKcal: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  /**
   * How the row got here. `chat` is a distinct provenance from `manual`:
   * both end in a person confirming every line, but one of them had a model
   * read the sentence first, and folding it into `manual` would make the
   * extraction lane's real-world accuracy unmeasurable — the evaluation signal
   * would be indistinguishable from hand typing.
   */
  source: 'manual' | 'photo' | 'recommendation' | 'chat';
  visionJobId?: string;
  loggedAt: string; // ISO UTC
  localDate: string; // YYYY-MM-DD in the user's timezone
}

export interface WaterLog {
  id: string;
  userId: string;
  type: 'waterLog';
  amountMl: number;
  loggedAt: string;
  localDate: string;
}

export interface WeightLog {
  id: string;
  userId: string;
  type: 'weightLog';
  weightKg: number;
  note?: string;
  loggedAt: string;
  localDate: string; // one canonical entry per user per local date (upsert)
}
