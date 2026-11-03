/**
 * Chat-native meal logging — the deterministic half (AQF-09 §3, FR-013).
 *
 * This file is separate from the router because everything in it is pure, and
 * because it is precisely the half of the feature that must never be delegated
 * to a model. P-12's entire contribution is turning a sentence into
 * `{ foodName, quantity, unit }` triples. Grounding those triples in the food
 * corpus, converting quantities to grams, multiplying per-100g values and
 * checking declared allergies all happen here, in code. A model-authored kcal
 * figure reaching a user's log is the one failure this product cannot absorb,
 * so the model is never given a field to put one in (see parseExtraction).
 *
 * Ambiguity is preserved rather than resolved. When "a coffee" matches several
 * corpus records, this module returns all of them and marks the item
 * `ambiguous`; the router refuses to accept a confirmation for an ambiguous
 * item unless the user picked one of the offered ids. Silently choosing the
 * first match would be indistinguishable, from the log's point of view, from
 * the user having chosen it — which is the thing FR-013 exists to prevent.
 */
import type { AiMetadata, Allergen, Food, MealType } from '@aquazerofit/shared';
import { itemContainsAllergen } from '../recommendations/allergenFilter';
import { round1 } from '../ai/util';

// ---------------------------------------------------------------------------
// Stored shapes. Defined locally rather than in packages/shared because this
// lane owns them end to end; the web client mirrors them in pages/coach.
// ---------------------------------------------------------------------------

export const CHAT_MEAL_DRAFT_TYPE = 'chatMealDraft';

/** `empty` is a real, persisted outcome: it is the evaluation signal for P-12. */
export type ChatMealDraftStatus = 'proposed' | 'empty' | 'confirmed' | 'dismissed';

export type ChatMealItemStatus = 'resolved' | 'ambiguous' | 'unmatched';

/**
 * Where a match's gram figure came from. Surfaced to the user because "150 g
 * because you said 150 g" and "220 g because that is what the corpus calls one
 * regular flat white" deserve different amounts of scrutiny.
 */
export type GramsBasis = 'statedMass' | 'statedVolume' | 'namedServing' | 'defaultServing' | 'assumed';

export interface ChatMealMatch {
  foodId: string;
  name: string;
  grams: number;
  gramsBasis: GramsBasis;
  /** The `commonServings` label the grams came from, when one was used. */
  servingLabel: string | null;
  /** Corpus match score 0-100 from `scoreFood`; surfaced for trust UI. */
  score: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Declared allergies this record trips. Surfaced, never silently dropped. */
  allergenConflicts: Allergen[];
}

export interface ChatMealItem {
  id: string;
  /** The span of the user's own text this item was read from. */
  phrase: string;
  /** The food as the user named it — not a corpus name. */
  spokenName: string;
  quantity: number;
  unit: string;
  status: ChatMealItemStatus;
  matches: ChatMealMatch[];
  /** Non-null only when exactly one corpus record matched. */
  suggestedFoodId: string | null;
}

export interface ChatMealDraft {
  id: string;
  userId: string;
  type: typeof CHAT_MEAL_DRAFT_TYPE;
  sessionId: string | null;
  sourceText: string;
  mealType: MealType;
  localDate: string;
  status: ChatMealDraftStatus;
  items: ChatMealItem[];
  /** Plain-language caveats shown under the confirmation card. */
  notes: string[];
  /** Whether the deterministic allergen check could run at all. */
  allergyCheck: 'applied' | 'skippedNoConsent';
  ai: AiMetadata | null;
  loggedMealId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Matches the vision lane's clamp so both logging paths agree on plausibility. */
export const MIN_ITEM_GRAMS = 1;
export const MAX_ITEM_GRAMS = 2000;
/** An ambiguous item offers alternatives, not a catalogue — more is a scroll. */
export const MAX_MATCH_OPTIONS = 5;
/** Beyond this the parse is not a meal description any more, so we stop trusting it. */
export const MAX_DRAFT_ITEMS = 12;
export const MAX_SOURCE_TEXT_LENGTH = 500;
/** Used only when neither the phrase nor the corpus record says how big a serving is. */
const FALLBACK_SERVING_GRAMS = 100;

// ---------------------------------------------------------------------------
// Model output → sanitised candidates
// ---------------------------------------------------------------------------

export interface ExtractionCandidate {
  foodName: string;
  quantity: number;
  unit: string;
  phrase: string;
}

/** The largest count that still reads as a portion rather than a typo. */
const MAX_QUANTITY = 100;

function asTrimmedString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

/**
 * Read P-12's output defensively.
 *
 * Fields outside the schema are dropped rather than mapped, which is what makes
 * "the model must not produce calories" enforceable rather than aspirational: a
 * `kcal` key in the model's JSON has nowhere to land, so it cannot reach a log
 * even if a future provider starts emitting one.
 */
export function parseExtraction(json: unknown): { items: ExtractionCandidate[]; mealType: MealType | null } {
  if (typeof json !== 'object' || json === null) return { items: [], mealType: null };
  const raw = json as { items?: unknown; mealType?: unknown };
  const rows = Array.isArray(raw.items) ? raw.items : [];
  const items: ExtractionCandidate[] = [];

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const entry = row as { foodName?: unknown; quantity?: unknown; unit?: unknown; phrase?: unknown };
    const foodName = asTrimmedString(entry.foodName, 80);
    if (foodName.length === 0) continue;
    const rawQuantity = typeof entry.quantity === 'number' && Number.isFinite(entry.quantity) ? entry.quantity : 1;
    const quantity = rawQuantity > 0 ? Math.min(rawQuantity, MAX_QUANTITY) : 1;
    items.push({
      foodName,
      quantity,
      unit: asTrimmedString(entry.unit, 24).toLowerCase() || 'serving',
      phrase: asTrimmedString(entry.phrase, 120) || foodName,
    });
    if (items.length >= MAX_DRAFT_ITEMS) break;
  }

  return { items, mealType: asMealType(raw.mealType) };
}

export function asMealType(value: unknown): MealType | null {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack' ? value : null;
}

// ---------------------------------------------------------------------------
// Deterministic fallback segmentation
// ---------------------------------------------------------------------------

/**
 * Read a meal sentence into candidates without a model.
 *
 * Two situations need this, and the gateway's own fallback covers neither:
 *
 *  1. No provider keys. AQF-10 principle 5 says the whole product works with
 *     zero keys, and the offline engine has no branch for P-12 — it answers
 *     `{}`, so the feature would be the one dead button in a keyless install.
 *  2. A provider that *succeeds* with unusable output. The gateway falls back
 *     to the offline engine when a call FAILS; a 200 carrying JSON that has no
 *     `items` array is not a failure, so nothing catches it and the user gets
 *     an empty card for a sentence the app can plainly read. Observed against a
 *     live provider on "two eggs and a flat white".
 *
 * This is a floor, not a replacement: it segments and counts, and like the
 * model it emits no nutrition figure of any kind. Grams, calories, macros and
 * allergens still come from the corpus downstream, so the central invariant —
 * models identify, code calculates — holds on this path exactly as on the
 * model path.
 */

/** Number words worth knowing; beyond a dozen people type digits. */
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, couple: 2,
};

/**
 * Units of measure. Kept separate from countable units because they are capped
 * differently: 150 is absurd as a number of eggs and ordinary as a number of
 * grams, and clamping a stated mass to the count ceiling would quietly log
 * 100 g of chicken for someone who typed 150 g.
 */
const MEASURED_UNITS = new Set([
  'g', 'gram', 'grams', 'kg', 'kilo', 'kilos', 'kilogram', 'kilograms',
  'ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'l', 'litre', 'litres', 'liter', 'liters',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
]);

/**
 * Countable portions the segmenter recognises — "two slices", "a bowl".
 *
 * Deliberately not the `COUNT_UNITS` further down: that set answers "does this
 * unit mean one of whatever the food comes as" for gram conversion, and
 * widening it to cover parsing would change how portions are costed.
 */
const SEGMENT_COUNT_UNITS = new Set([
  'slice', 'slices', 'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons',
  'tsp', 'teaspoon', 'teaspoons', 'piece', 'pieces', 'serving', 'servings',
  'bowl', 'bowls', 'glass', 'glasses', 'can', 'cans', 'bottle', 'bottles', 'scoop', 'scoops',
]);

/** Units the corpus can act on; anything else stays part of the food name. */
const UNIT_WORDS = new Set([...MEASURED_UNITS, ...SEGMENT_COUNT_UNITS]);

/**
 * Upper bound for a measured quantity. Generous on purpose — this is only a
 * typo guard, and `gramsFor` clamps the real figure to MAX_ITEM_GRAMS once the
 * unit is converted. Guessing harder here would be guessing on the user's
 * behalf about a number they actually typed.
 */
const MAX_MEASURED_QUANTITY = 5000;

/** "250ml", "150g", "1.5kg" — a number written flush against its unit. */
const GLUED_QUANTITY = /^(\d+(?:\.\d+)?)([a-z]+)$/;

/** Leading filler that survives splitting and would pollute the food name. */
const LEADING_FILLER = new Set(['of', 'some', 'the', 'my', 'i', 'had', 'ate', 'drank', 'just', 'also', 'then']);

/** Splits on the connectives people actually use between foods. */
const SEGMENT_SPLIT = /\s*(?:,|;|\band\b|\bwith\b|\bplus\b|&|\+)\s*/i;

export function segmentMealText(text: string): ExtractionCandidate[] {
  const items: ExtractionCandidate[] = [];

  for (const rawSegment of text.split(SEGMENT_SPLIT)) {
    const phrase = rawSegment.trim().replace(/[.!?]+$/, '');
    if (phrase.length === 0) continue;

    const words = normalise(phrase).split(' ').filter(Boolean);
    let cursor = 0;
    while (cursor < words.length && LEADING_FILLER.has(words[cursor]!)) cursor += 1;

    // Quantity: a digit ("2", "1.5", "150"), a number word ("two", "a"), or a
    // number written flush against its unit ("250ml").
    let quantity = 1;
    let gluedUnit: string | null = null;
    const head = words[cursor];
    if (head !== undefined) {
      const numeric = Number(head);
      const glued = GLUED_QUANTITY.exec(head);
      if (Number.isFinite(numeric) && numeric > 0) {
        quantity = numeric;
        cursor += 1;
      } else if (glued && UNIT_WORDS.has(glued[2]!)) {
        quantity = Number(glued[1]);
        gluedUnit = glued[2]!;
        cursor += 1;
      } else if (NUMBER_WORDS[head] !== undefined) {
        quantity = NUMBER_WORDS[head]!;
        cursor += 1;
      }
    }

    // A separate unit only counts when something still follows it: in "two
    // eggs" the food is the last word, and consuming it would leave no food.
    let unit = 'serving';
    const unitWord = words[cursor];
    if (gluedUnit !== null) {
      unit = gluedUnit;
    } else if (unitWord !== undefined && UNIT_WORDS.has(unitWord) && cursor + 1 < words.length) {
      unit = unitWord;
      cursor += 1;
    }

    // Counts and measures get different ceilings — see MEASURED_UNITS.
    const ceiling = MEASURED_UNITS.has(unit) ? MAX_MEASURED_QUANTITY : MAX_QUANTITY;
    quantity = Math.min(quantity, ceiling);

    while (cursor < words.length && LEADING_FILLER.has(words[cursor]!)) cursor += 1;

    const foodName = words.slice(cursor).join(' ').slice(0, 80);
    if (foodName.length === 0) continue;

    items.push({ foodName, quantity, unit, phrase: phrase.slice(0, 120) });
    if (items.length >= MAX_DRAFT_ITEMS) break;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Corpus name matching
// ---------------------------------------------------------------------------

/** Words that carry no identifying signal and only dilute token coverage. */
const STOP_TOKENS = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'some', 'my', 'plain', 'fresh']);

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The corpus is singular ("Egg (boiled)"); users type plurals ("two eggs"). */
function singular(token: string): string {
  if (token.length > 3 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && /(sh|ch|s|x|z)es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function tokensOf(text: string): string[] {
  return normalise(text)
    .split(' ')
    .filter((t) => t.length > 0 && !STOP_TOKENS.has(t))
    .map(singular);
}

/**
 * 0–100. Full token coverage is the bar for a serious match; partial overlap
 * scores low so "chicken" cannot outrank "chicken breast" for the phrase
 * "chicken breast" but still surfaces when nothing better exists.
 */
export function scoreFood(queryTokens: readonly string[], food: Food): number {
  const foodTokens = tokensOf(food.name);
  if (queryTokens.length === 0 || foodTokens.length === 0) return 0;
  if (queryTokens.join(' ') === foodTokens.join(' ')) return 100;

  const covered = queryTokens.filter((t) => foodTokens.includes(t));
  if (covered.length === queryTokens.length) {
    // Every word the user said appears in the record. Words in the record the
    // user did NOT say are unexplained, so each one costs a little confidence.
    const unexplained = Math.max(0, foodTokens.length - queryTokens.length);
    return 80 - Math.min(unexplained * 5, 25);
  }
  if (covered.length === 0) return 0;
  return Math.round(40 * (covered.length / queryTokens.length));
}

/**
 * Anything scoring within this of the best match is a real alternative the user
 * could have meant, so it is offered rather than discarded.
 */
const AMBIGUITY_BAND = 10;

/** Ranked corpus records for a spoken food name; empty when nothing matched. */
export function matchCorpus(spokenName: string, foods: readonly Food[]): Food[] {
  const queryTokens = tokensOf(spokenName);
  const scored = foods
    .map((food) => ({ food, score: scoreFood(queryTokens, food) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name));

  const best = scored[0];
  if (!best) return [];
  return scored
    .filter((entry) => best.score - entry.score < AMBIGUITY_BAND)
    .slice(0, MAX_MATCH_OPTIONS)
    .map((entry) => entry.food);
}

// ---------------------------------------------------------------------------
// Quantity + unit → grams
// ---------------------------------------------------------------------------

const MASS_UNIT_GRAMS: Record<string, number> = {
  g: 1,
  gm: 1,
  gram: 1,
  gramme: 1,
  kg: 1000,
  kilo: 1000,
  kilogram: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  lb: 453.592,
  pound: 453.592,
};

/**
 * Volumes are converted at 1 g per ml. That is exact for water and close enough
 * for the drinks users log in a sentence; the draft carries a note saying so,
 * because an unexplained conversion is how a user stops trusting the numbers.
 */
const VOLUME_UNIT_ML: Record<string, number> = {
  ml: 1,
  millilitre: 1,
  milliliter: 1,
  cc: 1,
  l: 1000,
  litre: 1000,
  liter: 1000,
};

/** Units that mean "one of whatever this food comes as" rather than a measure. */
const COUNT_UNITS = new Set([
  '',
  'serving',
  'serve',
  'portion',
  'piece',
  'item',
  'unit',
  'each',
  'whole',
  'small',
  'medium',
  'large',
  'regular',
]);

export interface GramsResult {
  grams: number;
  basis: GramsBasis;
  servingLabel: string | null;
}

function clampGrams(grams: number): number {
  return Math.min(MAX_ITEM_GRAMS, Math.max(MIN_ITEM_GRAMS, Math.round(grams)));
}

/**
 * Convert `quantity` + `unit` into grams for one corpus record.
 *
 * Order matters: a mass or volume the user actually stated always wins, because
 * it is the one figure in the sentence we did not have to infer. Only when the
 * user counted things ("two eggs", "a cup") do we reach for the record's own
 * `commonServings`, and only when that is empty do we assume.
 */
export function gramsFor(food: Food, quantity: number, unit: string): GramsResult {
  const key = singular(normalise(unit));

  const massFactor = MASS_UNIT_GRAMS[key];
  if (massFactor !== undefined) {
    return { grams: clampGrams(quantity * massFactor), basis: 'statedMass', servingLabel: null };
  }
  const volumeFactor = VOLUME_UNIT_ML[key];
  if (volumeFactor !== undefined) {
    return { grams: clampGrams(quantity * volumeFactor), basis: 'statedVolume', servingLabel: null };
  }

  const servings = food.commonServings ?? [];
  if (!COUNT_UNITS.has(key)) {
    // "1 slice", "1 cup cooked", "1 large egg" — the unit the user said is a
    // word inside a serving label this food already defines.
    const named = servings.find((serving) => tokensOf(serving.label).includes(key));
    if (named) {
      return { grams: clampGrams(quantity * named.grams), basis: 'namedServing', servingLabel: named.label };
    }
  }

  const fallback = servings[0];
  if (fallback) {
    return { grams: clampGrams(quantity * fallback.grams), basis: 'defaultServing', servingLabel: fallback.label };
  }
  return { grams: clampGrams(quantity * FALLBACK_SERVING_GRAMS), basis: 'assumed', servingLabel: null };
}

// ---------------------------------------------------------------------------
// Nutrition + allergens (CODE, always)
// ---------------------------------------------------------------------------

export interface Nutrition {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Deterministic per-100g lookup × grams — the same rule the vision lane uses. */
export function nutritionFor(food: Food, grams: number): Nutrition {
  const factor = grams / 100;
  return {
    kcal: round1(food.per100g.kcal * factor),
    proteinG: round1(food.per100g.proteinG * factor),
    carbsG: round1(food.per100g.carbsG * factor),
    fatG: round1(food.per100g.fatG * factor),
  };
}

/**
 * Declared allergies this record trips, via the same two-net filter the
 * recommendation lane uses. Note that this REPORTS rather than excludes: the
 * user is telling us what they already ate, and a logger that refuses to record
 * it teaches them to log somewhere else. The conflict is surfaced on the
 * confirmation card and must be acknowledged before the row is written.
 */
export function allergenConflictsFor(food: Food, allergies: readonly Allergen[]): Allergen[] {
  if (allergies.length === 0) return [];
  return allergies.filter((allergen) =>
    itemContainsAllergen({ name: food.name, allergens: food.allergens }, allergen),
  );
}

// ---------------------------------------------------------------------------
// Candidate → draft item
// ---------------------------------------------------------------------------

export function buildMatch(
  food: Food,
  quantity: number,
  unit: string,
  allergies: readonly Allergen[],
  matchScore: number,
): ChatMealMatch {
  const { grams, basis, servingLabel } = gramsFor(food, quantity, unit);
  return {
    foodId: food.id,
    name: food.name,
    grams,
    gramsBasis: basis,
    servingLabel,
    score: matchScore,
    ...nutritionFor(food, grams),
    allergenConflicts: allergenConflictsFor(food, allergies),
  };
}

export function buildDraftItems(
  candidates: readonly ExtractionCandidate[],
  foods: readonly Food[],
  allergies: readonly Allergen[],
): ChatMealItem[] {
  return candidates.slice(0, MAX_DRAFT_ITEMS).map((candidate, index) => {
    const queryTokens = tokensOf(candidate.foodName);
    const matched = matchCorpus(candidate.foodName, foods);
    const matches = matched.map((food) =>
      buildMatch(food, candidate.quantity, candidate.unit, allergies, scoreFood(queryTokens, food)),
    );
    const status: ChatMealItemStatus =
      matches.length === 0 ? 'unmatched' : matches.length === 1 ? 'resolved' : 'ambiguous';
    return {
      id: `it-${index + 1}`,
      phrase: candidate.phrase,
      spokenName: candidate.foodName,
      quantity: candidate.quantity,
      unit: candidate.unit,
      status,
      matches,
      suggestedFoodId: status === 'resolved' ? (matches[0] as ChatMealMatch).foodId : null,
    };
  });
}

/**
 * Prefer a remembered portion when the user corrected this food before.
 * Nutrition is recomputed from the corpus; allergens are unchanged.
 */
export function applyRememberedPortions(
  items: readonly ChatMealItem[],
  foods: readonly Food[],
  rememberedGrams: (foodId: string) => number | null | undefined,
): ChatMealItem[] {
  const foodById = new Map(foods.map((f) => [f.id, f]));
  return items.map((item) => {
    const matches = item.matches.map((match) => {
      const remembered = rememberedGrams(match.foodId);
      if (remembered == null) return match;
      const food = foodById.get(match.foodId);
      if (!food) return match;
      const grams = Math.round(remembered);
      return {
        ...match,
        grams,
        gramsBasis: 'assumed' as GramsBasis,
        servingLabel: null,
        ...nutritionFor(food, grams),
      };
    });
    const suggestedFoodId =
      item.status === 'resolved' && matches[0] ? matches[0].foodId : item.suggestedFoodId;
    return { ...item, matches, suggestedFoodId };
  });
}

/**
 * Caveats worth reading before tapping "Log meal". Kept as data rather than
 * baked into copy so the client can render them consistently and tests can
 * assert on them.
 */
export function draftNotes(items: readonly ChatMealItem[], allergyCheck: ChatMealDraft['allergyCheck']): string[] {
  const notes: string[] = [];
  if (items.some((item) => item.status === 'ambiguous')) {
    notes.push('Some items matched more than one food — pick the right one before logging.');
  }
  if (items.some((item) => item.status === 'unmatched')) {
    notes.push('Some items aren’t in the food database yet. Search for them on the food log instead.');
  }
  const assumed = items.some((item) =>
    item.matches.some((m) => m.gramsBasis === 'defaultServing' || m.gramsBasis === 'assumed'),
  );
  if (assumed) {
    notes.push('Portion sizes you didn’t state come from the standard serving — adjust the grams if that’s off.');
  }
  if (items.some((item) => item.matches.some((m) => m.gramsBasis === 'statedVolume'))) {
    notes.push('Millilitres were converted to grams at 1 ml = 1 g.');
  }
  if (allergyCheck === 'skippedNoConsent') {
    notes.push('Allergy checks are off — turn on wellness data processing in Settings to have them applied.');
  }
  return notes;
}
