/**
 * Confirm-first trust helpers shared across web and API tests.
 * Keep in sync with apps/api/src/modules/chat/mealTrust.ts.
 */

export type MatchConfidenceBand = 'high' | 'moderate' | 'low';

export function confidenceBandFromScore(score: number): MatchConfidenceBand {
  if (score >= 80) return 'high';
  if (score >= 55) return 'moderate';
  return 'low';
}

export function confidenceBandLabel(band: MatchConfidenceBand): string {
  if (band === 'high') return 'High match';
  if (band === 'moderate') return 'Moderate match';
  return 'Low match';
}

export function shouldShowFatCaution(
  itemNames: readonly string[],
  totals: { kcal: number; fatG: number },
): boolean {
  const joined = itemNames.join(' ').toLowerCase();
  const cue =
    /\b(fried|deep.?fried|crispy|sauce|gravy|dressing|mayo|butter|oil|cheese|cream|bacon|sausage|curry|stir.?fry|tempura|saut[eé])\b/.test(
      joined,
    );
  const fatShare = totals.kcal > 0 ? (totals.fatG * 9) / totals.kcal : 0;
  return cue || fatShare >= 0.45;
}

export const FAT_CAUTION_NOTE =
  'Photo and AI estimates often miss cooking oil and sauces. Add fat if needed and confirm portions.';

export interface CookingFatPreset {
  id: string;
  label: string;
  grams: number;
  kcal: number;
  fatG: number;
}

export const COOKING_FAT_PRESETS: readonly CookingFatPreset[] = [
  { id: 'tsp-oil', label: '1 tsp oil', grams: 5, kcal: 45, fatG: 5 },
  { id: 'tbsp-oil', label: '1 tbsp oil', grams: 14, kcal: 126, fatG: 14 },
  { id: 'tbsp-sauce', label: '1 tbsp sauce', grams: 15, kcal: 30, fatG: 2 },
] as const;

export function portionCorrectionWorthRemembering(defaultGrams: number, confirmedGrams: number): boolean {
  if (defaultGrams <= 0 || confirmedGrams <= 0) return false;
  const ratio = confirmedGrams / defaultGrams;
  return ratio < 0.8 || ratio > 1.2;
}
