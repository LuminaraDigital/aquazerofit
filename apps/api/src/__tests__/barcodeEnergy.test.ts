/**
 * Barcode validation + EU energy-factor cross-check tests
 * (wger-integration-plan.md Phase 4.2/4.3). Deterministic helpers — no I/O.
 */
import { describe, expect, it } from 'vitest';
import { crossCheckEnergy, isValidBarcode } from '../modules/foods/service';

describe('isValidBarcode', () => {
  it('accepts a valid EAN-13 (check digit verified)', () => {
    expect(isValidBarcode('4006381333931')).toBe(true); // Storck — classic valid sample
    expect(isValidBarcode('3017620422003')).toBe(true); // Nutella
  });

  it('accepts a valid EAN-8 (check digit verified)', () => {
    expect(isValidBarcode('96385074')).toBe(true);
  });

  it('rejects a corrupted check digit', () => {
    expect(isValidBarcode('4006381333932')).toBe(false);
    expect(isValidBarcode('96385075')).toBe(false);
  });

  it('rejects wrong lengths and non-digit input', () => {
    expect(isValidBarcode('')).toBe(false);
    expect(isValidBarcode('1234567')).toBe(false); // 7 digits
    expect(isValidBarcode('123456789')).toBe(false); // 9 digits
    expect(isValidBarcode('123456789012')).toBe(false); // 12 digits
    expect(isValidBarcode('40063813339312')).toBe(false); // 14 digits
    expect(isValidBarcode('40063813339a1')).toBe(false);
    expect(isValidBarcode(' 4006381333931')).toBe(false);
  });
});

describe('crossCheckEnergy', () => {
  it('computes kcal from macros with the EU 4/4/9/2 factors', () => {
    const result = crossCheckEnergy({ kcal: 130, proteinG: 5, carbsG: 10, fatG: 7, fiberG: 5 });
    // 5*4 + 10*4 + 7*9 + 5*2 = 133
    expect(result.computedKcal).toBe(133);
    expect(result.deltaKcal).toBe(3);
    expect(result.withinTolerance).toBe(true);
  });

  it('treats fibre as optional (factor 2 applied only when present)', () => {
    const result = crossCheckEnergy({ kcal: 123, proteinG: 5, carbsG: 10, fatG: 7 });
    expect(result.computedKcal).toBe(123);
    expect(result.withinTolerance).toBe(true);
  });

  it('passes within the wger-style tolerance of 30% + 5 kcal', () => {
    // computed 100 → tolerance 35 kcal
    const result = crossCheckEnergy({ kcal: 134, proteinG: 10, carbsG: 10, fatG: 2.2 });
    expect(result.computedKcal).toBeCloseTo(99.8, 1);
    expect(result.withinTolerance).toBe(true);
  });

  it('flags energy values outside tolerance (e.g. AI-parsed nonsense)', () => {
    const result = crossCheckEnergy({ kcal: 900, proteinG: 1, carbsG: 2, fatG: 1 });
    expect(result.computedKcal).toBe(21);
    expect(result.withinTolerance).toBe(false);
  });

  it('flags understated energy as well', () => {
    const result = crossCheckEnergy({ kcal: 50, proteinG: 20, carbsG: 40, fatG: 20 });
    // computed 420; delta 370 > 131
    expect(result.withinTolerance).toBe(false);
  });
});
