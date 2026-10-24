/**
 * Deterministic match from a vision model's free-text food name to the
 * catalog. The model identifies. This module decides whether a name is the
 * same food as a catalog row. Nutrition is never invented here: a miss returns
 * null and the caller keeps the item without macros.
 */
import type { Food, VisionPrediction } from '@aquazerofit/shared';

/** One food the vision model named. Macros are not part of this shape. */
export interface RecognisedFood {
  name: string;
  portion: string;
  estimatedGrams: number;
  confidence: number;
}

/** Minimum combined score that counts as the same food. */
export const FOOD_MATCH_MIN_SCORE = 0.72;

const STOPWORDS = new Set([
  'grilled',
  'fried',
  'boiled',
  'baked',
  'roasted',
  'steamed',
  'cooked',
  'raw',
  'trimmed',
  'drained',
  'natural',
  'lean',
  'sliced',
  'chopped',
  'diced',
  'whole',
  'large',
  'small',
  'medium',
  'fresh',
  'plain',
  'toasted',
  'poached',
  'scrambled',
  'skinless',
  'boneless',
  'dried',
  'canned',
  'and',
  'with',
  'the',
  'in',
  'of',
  'a',
  'on',
]);

/** Words that already end in s and must not be singularised. */
const UNCOUNTABLE = new Set(['asparagus', 'couscous', 'hummus']);

/**
 * Groups of words that name the same food. Matching expands in both
 * directions, so "toast" can hit a catalog row called bread.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['toast', 'bread'],
  ['yogurt', 'yoghurt'],
  ['rasher', 'bacon'],
  ['prawn', 'shrimp'],
  ['capsicum', 'pepper'],
  ['courgette', 'zucchini'],
  ['aubergine', 'eggplant'],
  ['cilantro', 'coriander'],
  ['chickpea', 'garbanzo'],
  ['mince', 'ground'],
  ['scallion', 'springonion'],
  ['springonion', 'greenonion'],
];

const synonymIndex = new Map<string, number>();
for (const [index, group] of SYNONYM_GROUPS.entries()) {
  for (const word of group) synonymIndex.set(word, index);
}

export interface FoodMatch {
  food: Food;
  score: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function normaliseFoodName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singular(token: string): string {
  if (UNCOUNTABLE.has(token) || token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes|oes)$/.test(token) && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokensOf(value: string): string[] {
  return normaliseFoodName(value)
    .split(' ')
    .map(singular)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

function sameSynonym(a: string, b: string): boolean {
  const left = synonymIndex.get(a);
  return left !== undefined && left === synonymIndex.get(b);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) row[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(current + 1, row[j - 1]! + 1, prev + cost);
      prev = current;
    }
  }
  return row[b.length]!;
}

function tokensClose(a: string, b: string): boolean {
  if (a === b || sameSynonym(a, b)) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return false;
  const dist = levenshtein(a, b);
  if (minLen >= 7 && dist <= 2) return true;
  return dist <= 1;
}

function trigrams(value: string): string[] {
  if (value.length < 3) return value ? [value] : [];
  const grams: string[] = [];
  for (let i = 0; i <= value.length - 3; i += 1) grams.push(value.slice(i, i + 3));
  return grams;
}

function trigramDice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return 0;
  const left = trigrams(a);
  const right = new Map<string, number>();
  for (const gram of trigrams(b)) right.set(gram, (right.get(gram) ?? 0) + 1);
  let overlap = 0;
  for (const gram of left) {
    const count = right.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      right.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (left.length + trigrams(b).length);
}

function coverageAndPrecision(
  query: string[],
  food: string[],
): { coverage: number; precision: number } {
  if (query.length === 0 || food.length === 0) return { coverage: 0, precision: 0 };
  let covered = 0;
  for (const token of query) {
    if (food.some((candidate) => tokensClose(token, candidate))) covered += 1;
  }
  let hits = 0;
  for (const token of food) {
    if (query.some((candidate) => tokensClose(candidate, token))) hits += 1;
  }
  return { coverage: covered / query.length, precision: hits / food.length };
}

interface ScoredFood {
  food: Food;
  score: number;
  precision: number;
  coverage: number;
  tokenCount: number;
}

function scoreFood(queryTokens: string[], queryCore: string, food: Food): ScoredFood | null {
  const foodTokens = tokensOf(food.name);
  if (foodTokens.length === 0 || queryTokens.length === 0) return null;
  const { coverage, precision } = coverageAndPrecision(queryTokens, foodTokens);
  if (coverage < 0.5) return null;
  const foodCore = foodTokens.join(' ');
  const similarity = Math.max(
    trigramDice(queryCore, foodCore),
    1 - levenshtein(queryCore, foodCore) / Math.max(queryCore.length, foodCore.length, 1),
  );
  const score = 0.65 * coverage + 0.25 * precision + 0.1 * similarity;
  return { food, score, precision, coverage, tokenCount: foodTokens.length };
}

/**
 * Best catalog row for a model name, or null when nothing clears the
 * threshold. Ties break toward the tighter name, then a stable id, so the
 * same input always lands on the same food.
 */
export function matchFoodName(name: string, foods: readonly Food[]): FoodMatch | null {
  const queryTokens = tokensOf(name);
  if (queryTokens.length === 0) return null;
  const queryCore = queryTokens.join(' ');
  const ranked: ScoredFood[] = [];
  for (const food of foods) {
    const scored = scoreFood(queryTokens, queryCore, food);
    if (scored) ranked.push(scored);
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.precision - a.precision ||
      a.tokenCount - b.tokenCount ||
      a.food.id.localeCompare(b.food.id),
  );
  const best = ranked[0];
  if (!best || best.score < FOOD_MATCH_MIN_SCORE) return null;
  return { food: best.food, score: best.score };
}

function macrosFor(food: Food, grams: number): Pick<VisionPrediction, 'kcal' | 'proteinG' | 'carbsG' | 'fatG'> {
  const factor = grams / 100;
  return {
    kcal: round1(food.per100g.kcal * factor),
    proteinG: round1(food.per100g.proteinG * factor),
    carbsG: round1(food.per100g.carbsG * factor),
    fatG: round1(food.per100g.fatG * factor),
  };
}

/**
 * Attach catalog nutrition to names that match. Unmatched rows keep the
 * model's name, portion, grams, and confidence, and they carry no macro
 * fields at all.
 */
export function groundRecognisedFoods(items: readonly RecognisedFood[], foods: readonly Food[]): VisionPrediction[] {
  return items.map((item) => {
    const match = matchFoodName(item.name, foods);
    if (!match) {
      return {
        name: item.name,
        portion: item.portion,
        estimatedGrams: item.estimatedGrams,
        confidence: item.confidence,
        matched: false,
      };
    }
    return {
      name: match.food.name,
      foodId: match.food.id,
      portion: item.portion,
      estimatedGrams: item.estimatedGrams,
      confidence: item.confidence,
      ...macrosFor(match.food, item.estimatedGrams),
      matched: true,
    };
  });
}
