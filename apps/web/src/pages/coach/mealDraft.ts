/**
 * Client mirror of the chat meal-draft shapes.
 *
 * Defined here rather than in @aquazerofit/shared because the chat lane owns
 * this contract end to end and shared is not this lane's to change. If the
 * feature outlives its trial, these belong in shared alongside VisionPrediction.
 */
import type { MealType } from '@aquazerofit/shared';

export type ChatMealDraftStatus = 'proposed' | 'empty' | 'confirmed' | 'dismissed';
export type ChatMealItemStatus = 'resolved' | 'ambiguous' | 'unmatched';
export type GramsBasis = 'statedMass' | 'statedVolume' | 'namedServing' | 'defaultServing' | 'assumed';

export interface ChatMealMatch {
  foodId: string;
  name: string;
  grams: number;
  gramsBasis: GramsBasis;
  servingLabel: string | null;
  score: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  allergenConflicts: string[];
}

export interface ChatMealItem {
  id: string;
  phrase: string;
  spokenName: string;
  quantity: number;
  unit: string;
  status: ChatMealItemStatus;
  matches: ChatMealMatch[];
  suggestedFoodId: string | null;
}

export interface ChatMealDraft {
  id: string;
  sessionId: string | null;
  sourceText: string;
  mealType: MealType;
  localDate: string;
  status: ChatMealDraftStatus;
  items: ChatMealItem[];
  notes: string[];
  allergyCheck: 'applied' | 'skippedNoConsent';
  loggedMealId: string | null;
  createdAt: string;
}

export interface ConfirmSelection {
  itemId: string;
  foodId: string;
  grams?: number;
}

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Display-only projection of the server's own rule (per-100g × grams is linear,
 * so scaling a known figure by a gram ratio gives the same answer). The number
 * that lands in the log is always recomputed server-side from the food record —
 * this exists so the card can respond while the user drags a portion, not so
 * the client can author nutrition.
 */
export function projectKcal(match: ChatMealMatch, grams: number): number {
  if (match.grams <= 0) return 0;
  return Math.round((match.kcal * grams) / match.grams);
}

export function describePortion(match: ChatMealMatch): string {
  if (match.gramsBasis === 'statedMass' || match.gramsBasis === 'statedVolume') return 'as you said';
  if (match.servingLabel) return `standard serving: ${match.servingLabel}`;
  return 'assumed portion';
}
