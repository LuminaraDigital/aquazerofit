/**
 * Open Food Facts ingestion (wger-integration-plan.md Phase 4.1).
 *
 * Bounded crawl of the OFF search API (sorted by popularity) into the
 * SEGREGATED `foodsOff` container — OFF-derived records never commingle with
 * the curated `content` container (ODbL collective-database posture).
 *
 * CRITICAL: allergens are ingested directly from OFF `allergens_tags` /
 * `traces_tags` and mapped best-effort onto the AQF ALLERGENS enum. wger's own
 * ingredient mirror discards these fields — we do not (plan §2.3). OFF
 * allergen data is crowdsourced and always treated as best-effort; the
 * deterministic allergen filter remains authoritative.
 *
 * OFF usage policy: a descriptive custom User-Agent is mandatory; search is
 * paced at ≤10 requests/minute.
 */
import { ALLERGENS, type Allergen, type Food } from '@aquazerofit/shared';
import { getStore, type JsonStore } from '../../platform/store';

const OFF_API_BASE = 'https://world.openfoodfacts.org';
/** OFF policy: User-Agent must identify the app and provide a contact. */
export const OFF_USER_AGENT = 'AquaZeroFit/1.0 (https://aquazero.fit; dev@aquazero.fit)';
const OFF_PAGE_SIZE = 100;
/** 10 requests/minute ceiling → 6.5 s spacing leaves headroom. */
const SEARCH_MIN_INTERVAL_MS = 6_500;
const PRODUCT_MIN_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 6;

const OFF_FIELDS = [
  'code',
  'product_name',
  'brands',
  'nutriments',
  'nutriscore_grade',
  'allergens_tags',
  'traces_tags',
  'ingredients_analysis_tags',
  'pnns_groups_1',
  'serving_size',
  'serving_quantity',
].join(',');

// ---------- OFF allergen → AQF ALLERGENS (best-effort) ----------
// OFF tags not listed here (celery, mustard, lupin, sulphites, ...) have no
// AQF counterpart and are dropped — the curated allergen table stays authoritative.

export const OFF_ALLERGEN_MAP: Readonly<Record<string, Allergen>> = {
  'en:gluten': 'wheat',
  'en:wheat': 'wheat',
  'en:milk': 'milk',
  'en:eggs': 'eggs',
  'en:nuts': 'treeNuts',
  'en:peanuts': 'peanuts',
  'en:soybeans': 'soy',
  'en:fish': 'fish',
  'en:crustaceans': 'shellfish',
  'en:molluscs': 'shellfish',
  'en:sesame-seeds': 'sesame',
} as const;

export function mapOffAllergenTags(tags: string[] | undefined): Allergen[] {
  if (!Array.isArray(tags)) return [];
  const mapped = new Set<Allergen>();
  for (const tag of tags) {
    const allergen = OFF_ALLERGEN_MAP[tag];
    if (allergen && (ALLERGENS as readonly string[]).includes(allergen)) mapped.add(allergen);
  }
  return [...mapped];
}

// ---------- OFF product shape (subset requested via `fields`) ----------

export interface OffNutriments {
  'energy-kcal_100g'?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  'saturated-fat_100g'?: number;
  sodium_100g?: number;
  salt_100g?: number;
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nutriments?: OffNutriments;
  nutriscore_grade?: string;
  allergens_tags?: string[];
  traces_tags?: string[];
  ingredients_analysis_tags?: string[];
  pnns_groups_1?: string;
  serving_size?: string;
  serving_quantity?: number | string;
}

/**
 * Food document stored in the segregated foodsOff container. Extends the
 * shared Food contract with per-100 g extras kept for the energy cross-check
 * and future nutrient display, plus the mapped traces (may-contain) flags.
 */
export interface OffFoodDoc extends Food {
  source: 'openfoodfacts';
  fiberG?: number;
  sugarsG?: number;
  saturatedFatG?: number;
  sodiumG?: number;
  saltG?: number;
  tracesAllergens?: Allergen[];
}

// ---------- mapping ----------

const round1 = (n: number): number => Math.round(n * 10) / 10;

function num(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? round1(value) : undefined;
}

function analysisFlag(tags: string[] | undefined, positive: string, negative: string): boolean | undefined {
  if (!Array.isArray(tags)) return undefined;
  if (tags.includes(positive)) return true;
  if (tags.includes(negative)) return false;
  return undefined;
}

function parseServingGrams(product: OffProduct): number | undefined {
  const qty = Number(product.serving_quantity);
  if (Number.isFinite(qty) && qty > 0) return round1(qty);
  const match = /([\d.]+)\s*g/i.exec(product.serving_size ?? '');
  if (match) {
    const grams = Number(match[1]);
    if (Number.isFinite(grams) && grams > 0) return round1(grams);
  }
  return undefined;
}

/**
 * Map an OFF product payload to an OffFoodDoc. Returns null when the record
 * lacks a barcode, a name, or an energy value — Food.per100g.kcal is a
 * required contract field and calorie math must stay deterministic.
 */
export function mapOffProduct(product: OffProduct): OffFoodDoc | null {
  const code = typeof product.code === 'string' ? product.code.trim() : '';
  const name = (product.product_name ?? '').trim();
  const kcal = num(product.nutriments?.['energy-kcal_100g']);
  if (!/^\d{8,14}$/.test(code) || !name || kcal === undefined) return null;

  const nutriments = product.nutriments ?? {};
  const nutriscore = (product.nutriscore_grade ?? '').toLowerCase();
  const servingGrams = parseServingGrams(product);

  const doc: OffFoodDoc = {
    id: `food-off-${code}`,
    type: 'food',
    name: name.slice(0, 200),
    brand: (product.brands ?? '').trim() || undefined,
    category: (product.pnns_groups_1 ?? 'Packaged foods').trim() || 'Packaged foods',
    per100g: {
      kcal,
      proteinG: num(nutriments.proteins_100g) ?? 0,
      carbsG: num(nutriments.carbohydrates_100g) ?? 0,
      fatG: num(nutriments.fat_100g) ?? 0,
    },
    commonServings: servingGrams ? [{ label: '1 serving', grams: servingGrams }] : [],
    allergens: mapOffAllergenTags(product.allergens_tags),
    tracesAllergens: mapOffAllergenTags(product.traces_tags),
    source: 'openfoodfacts',
    licence: 'ODbL-1.0', // attribution: © Open Food Facts contributors
    barcode: code,
    nutriscore: (['a', 'b', 'c', 'd', 'e'] as const).find((g) => g === nutriscore),
    isVegan: analysisFlag(product.ingredients_analysis_tags, 'en:vegan', 'en:non-vegan'),
    isVegetarian: analysisFlag(
      product.ingredients_analysis_tags,
      'en:vegetarian',
      'en:non-vegetarian',
    ),
    sourceUrl: `${OFF_API_BASE}/product/${code}`,
  };
  doc.fiberG = num(nutriments.fiber_100g);
  doc.sugarsG = num(nutriments.sugars_100g);
  doc.saturatedFatG = num(nutriments['saturated-fat_100g']);
  doc.sodiumG = num(nutriments.sodium_100g);
  doc.saltG = num(nutriments.salt_100g);
  return doc;
}

// ---------- HTTP (paced, OFF-policy UA) ----------

let lastRequestAt = 0;

async function pace(minIntervalMs: number): Promise<void> {
  const wait = minIntervalMs - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function offFetchJson(url: string, minIntervalMs: number): Promise<unknown> {
  let attempt = 0;
  for (;;) {
    await pace(minIntervalMs);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_RETRIES) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      attempt += 1;
      if (attempt > MAX_RETRIES) {
        throw new Error(`OFF request failed after retries: ${res.status} ${url}`);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * 2 ** attempt;
      await res.body?.cancel().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (!res.ok) throw new Error(`OFF request failed: ${res.status} ${url}`);
    return res.json();
  }
}

/** Single-product lookup used by the barcode endpoint fallback. */
export async function fetchOffProduct(code: string): Promise<OffProduct | null> {
  const url = `${OFF_API_BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;
  const payload = (await offFetchJson(url, PRODUCT_MIN_INTERVAL_MS)) as {
    status?: number;
    product?: OffProduct;
  };
  if (payload.status !== 1 || !payload.product) return null;
  return payload.product;
}

// ---------- bounded import ----------

export interface OffImportStats {
  state: 'running' | 'completed' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  maxRecords: number;
  pages: number;
  fetched: number;
  upserted: number;
  skippedUnusable: number;
  withAllergens: number;
  withTraces: number;
  errors: string[];
}

export interface RunOffImportOptions {
  /** Hard bound on imported products (plan: 1,500–2,500). */
  maxRecords?: number;
}

export async function runOffImport(
  store: JsonStore,
  options: RunOffImportOptions = {},
): Promise<OffImportStats> {
  const maxRecords = Math.min(Math.max(options.maxRecords ?? 1_500, 1), 2_500);
  const stats: OffImportStats = {
    state: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    maxRecords,
    pages: 0,
    fetched: 0,
    upserted: 0,
    skippedUnusable: 0,
    withAllergens: 0,
    withTraces: 0,
    errors: [],
  };
  const startedMs = Date.now();

  try {
    let page = 1;
    while (stats.fetched < maxRecords) {
      const url =
        `${OFF_API_BASE}/api/v2/search?page_size=${OFF_PAGE_SIZE}&page=${page}` +
        `&sort_by=popularity_key&fields=${OFF_FIELDS}`;
      const payload = (await offFetchJson(url, SEARCH_MIN_INTERVAL_MS)) as {
        products?: OffProduct[];
      };
      stats.pages += 1;
      const products = Array.isArray(payload.products) ? payload.products : [];
      if (products.length === 0) break;

      for (const product of products) {
        if (stats.upserted >= maxRecords) break;
        stats.fetched += 1;
        const doc = mapOffProduct(product);
        if (!doc) {
          stats.skippedUnusable += 1;
          continue;
        }
        if (doc.allergens.length > 0) stats.withAllergens += 1;
        if ((doc.tracesAllergens ?? []).length > 0) stats.withTraces += 1;
        store.upsert('foodsOff', doc);
        stats.upserted += 1;
      }
      await store.flush();
      page += 1;
    }
    stats.state = 'completed';
  } catch (err) {
    stats.state = 'failed';
    stats.errors.push((err as Error).message);
  } finally {
    stats.finishedAt = new Date().toISOString();
    stats.durationMs = Date.now() - startedMs;
  }
  return stats;
}

/** Convenience used by the CLI wrapper. */
export async function runOffImportDefaultStore(
  options: RunOffImportOptions = {},
): Promise<OffImportStats> {
  return runOffImport(getStore(), options);
}
