/**
 * /foods service layer (wger-integration-plan.md Phase 4.2/4.3).
 *
 * - Barcode validation (EAN-8/EAN-13 with GS1 checksum) — deterministic.
 * - Barcode lookup: segregated foodsOff mirror first, Open Food Facts product
 *   API fallback (custom User-Agent, timeout, result cached into foodsOff).
 * - crossCheckEnergy: EU 1169/2011 energy-factor check (4/4/9/2 kcal per g of
 *   protein/carbohydrate/fat/fibre) with the wger-style tolerance of 30% + 5
 *   kcal, for the recommendations pipeline to sanity-check stated kcal.
 */
import type { Allergen } from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { getStore } from '../../platform/store';
import { fetchOffProduct, mapOffProduct, type OffFoodDoc } from './offImporter';

// ---------- barcode validation ----------

/**
 * EAN-8 / EAN-13 validation including the GS1 check digit.
 * Accepts only all-digit strings of length 8 or 13.
 */
export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  // From the rightmost data digit, weights alternate 3,1,3,1...
  const sum = digits.reduce((acc, d, i) => {
    const fromRight = digits.length - 1 - i;
    return acc + d * (fromRight % 2 === 0 ? 3 : 1);
  }, 0);
  return (10 - (sum % 10)) % 10 === check;
}

// ---------- energy cross-check (EU 1169/2011 conversion factors) ----------

export interface EnergyCrossCheckInput {
  kcal: number; // stated energy per 100 g
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
}

export interface EnergyCrossCheckResult {
  statedKcal: number;
  computedKcal: number;
  deltaKcal: number;
  /** |stated − computed| ≤ 30% of computed + 5 kcal (wger tolerance rule). */
  withinTolerance: boolean;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Recompute kcal per 100 g from macros with the EU factors (protein 4,
 * carbohydrates 4, fat 9, fibre 2 kcal/g) and compare against the stated
 * value. Deterministic — code judges, AI only proposes (AQF invariant).
 */
export function crossCheckEnergy(per100g: EnergyCrossCheckInput): EnergyCrossCheckResult {
  const computed =
    per100g.proteinG * 4 + per100g.carbsG * 4 + per100g.fatG * 9 + (per100g.fiberG ?? 0) * 2;
  const delta = Math.abs(per100g.kcal - computed);
  return {
    statedKcal: per100g.kcal,
    computedKcal: round1(computed),
    deltaKcal: round1(delta),
    withinTolerance: delta <= computed * 0.3 + 5,
  };
}

// ---------- barcode lookup ----------

export interface BarcodeLookupResult {
  food: OffFoodDoc;
  allergens: Allergen[];
  /** Mapped may-contain traces — best-effort, never treated as ground truth. */
  tracesAllergens: Allergen[];
  origin: 'local' | 'off-api';
}

/**
 * Local mirror first; on a miss, fall back to the OFF product API and cache
 * the result into the segregated foodsOff container. Throws NOT_FOUND when
 * OFF has no such product; a network/upstream failure surfaces as 503.
 */
export async function findFoodByBarcode(code: string): Promise<BarcodeLookupResult> {
  const store = getStore();
  const local = store.findOne<OffFoodDoc>(
    'foodsOff',
    (d) => d.type === 'food' && d.barcode === code,
  );
  if (local) {
    return {
      food: local,
      allergens: local.allergens,
      tracesAllergens: local.tracesAllergens ?? [],
      origin: 'local',
    };
  }

  let product;
  try {
    product = await fetchOffProduct(code);
  } catch {
    throw new AppError('AI_UNAVAILABLE', 'Open Food Facts lookup is temporarily unavailable');
  }
  if (!product) throw new AppError('NOT_FOUND', 'No product found for this barcode');

  const doc = mapOffProduct({ ...product, code });
  if (!doc) {
    throw new AppError('NOT_FOUND', 'Product has insufficient nutrition data to import');
  }
  store.upsert('foodsOff', doc); // cache the fallback hit in the segregated mirror
  return {
    food: doc,
    allergens: doc.allergens,
    tracesAllergens: doc.tracesAllergens ?? [],
    origin: 'off-api',
  };
}
