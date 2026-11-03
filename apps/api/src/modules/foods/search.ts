/**
 * Token search over the food catalog.
 *
 * A multi-word query is not a single substring: "chicken salad" must hit
 * "Chicken Caesar Salad", where the words are not adjacent. Every token has
 * to land for a two-word query, and at least two thirds of them for a longer
 * one, so a stray shared word does not flood the list. Ranking prefers a
 * tighter name once the tokens are covered.
 */
import type { Food } from '@aquazerofit/shared';

const STOPWORDS = new Set(['a', 'an', 'the', 'and', 'with', 'of', 'or', 'in', 'on', 'for']);

function singular(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function foodSearchTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(singular)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function tokenHits(token: string, tokens: readonly string[], haystack: string): boolean {
  if (tokens.some((candidate) => candidate === token || candidate.startsWith(token))) return true;
  return haystack.includes(token);
}

interface ScoredFood {
  food: Food;
  coverage: number;
  nameHits: number;
  phrase: boolean;
  prefix: boolean;
}

function scoreFood(food: Food, query: string): ScoredFood | null {
  const needles = foodSearchTokens(query);
  const effective = needles.length > 0 ? needles : [query];
  const name = food.name.toLowerCase();
  const brand = (food.brand ?? '').toLowerCase();
  const category = food.category.toLowerCase();
  const haystack = `${name} ${brand} ${category}`;
  const nameTokens = foodSearchTokens(food.name);
  const allTokens = [...nameTokens, ...foodSearchTokens(brand), ...foodSearchTokens(category)];

  let matched = 0;
  let nameHits = 0;
  for (const token of effective) {
    const inName = tokenHits(token, nameTokens, name);
    const inAny = inName || tokenHits(token, allTokens, haystack);
    if (inAny) matched += 1;
    if (inName) nameHits += 1;
  }

  const coverage = matched / effective.length;
  // A pair must match in full. Longer queries may drop one token ("most").
  const threshold = effective.length <= 2 ? 1 : 2 / 3;
  if (coverage + 1e-9 < threshold) return null;

  return {
    food,
    coverage,
    nameHits,
    phrase: name.includes(query) || haystack.includes(query),
    prefix: name.startsWith(query) || nameTokens[0] === effective[0],
  };
}

/** Ranked catalog matches for `search`. An empty query is alphabetical. */
export function rankFoodSearch(foods: readonly Food[], search: string, limit: number): Food[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return [...foods].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  }

  return foods
    .map((food) => scoreFood(food, query))
    .filter((hit): hit is ScoredFood => hit !== null)
    .sort((a, b) => {
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      if (Number(b.phrase) !== Number(a.phrase)) return Number(b.phrase) - Number(a.phrase);
      if (Number(b.prefix) !== Number(a.prefix)) return Number(b.prefix) - Number(a.prefix);
      if (b.nameHits !== a.nameHits) return b.nameHits - a.nameHits;
      const lengthDelta = foodSearchTokens(a.food.name).length - foodSearchTokens(b.food.name).length;
      return lengthDelta || a.food.name.localeCompare(b.food.name);
    })
    .slice(0, limit)
    .map((hit) => hit.food);
}
