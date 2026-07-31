import { describe, expect, it } from 'vitest';
import {
  excludeAllergens,
  itemContainsAllergen,
  ALLERGEN_NAME_KEYWORDS,
} from '../modules/recommendations/allergenFilter';
import { ALLERGENS } from '@aquazerofit/shared';

describe('allergenFilter (deterministic, zero false negatives)', () => {
  it('excludes on the declared allergens field', () => {
    const items = [
      { name: 'Peanut Butter Oats', allergens: ['peanuts' as const] },
      { name: 'Plain Oats', allergens: [] },
    ];
    const result = excludeAllergens(items, ['peanuts']);
    expect(result.map((r) => r.name)).toEqual(['Plain Oats']);
  });

  it('catches hidden allergens via name keywords — the "satay" case', () => {
    // Deliberately mistagged records: the keyword net must still catch them.
    const tricky = [
      { name: 'Chicken Satay Skewers', allergens: [] }, // peanuts
      { name: 'Groundnut Stew', allergens: [] }, // peanuts
      { name: 'Marzipan Slice', allergens: [] }, // treeNuts
      { name: 'Prawn Laksa', allergens: [] }, // shellfish
      { name: 'Tahini Dressed Salad', allergens: [] }, // sesame
      { name: 'Seitan Skewers', allergens: [] }, // wheat
      { name: 'Caesar Salad with Anchovy Dressing', allergens: [] }, // fish
      { name: 'Halloumi Wrap', allergens: [] }, // milk
      { name: 'Aioli Chicken Burger', allergens: [] }, // eggs
      { name: 'Miso Glazed Eggplant', allergens: [] }, // soy
    ];
    expect(itemContainsAllergen(tricky[0]!, 'peanuts')).toBe(true);
    expect(itemContainsAllergen(tricky[1]!, 'peanuts')).toBe(true);
    expect(itemContainsAllergen(tricky[2]!, 'treeNuts')).toBe(true);
    expect(itemContainsAllergen(tricky[3]!, 'shellfish')).toBe(true);
    expect(itemContainsAllergen(tricky[4]!, 'sesame')).toBe(true);
    expect(itemContainsAllergen(tricky[5]!, 'wheat')).toBe(true);
    expect(itemContainsAllergen(tricky[6]!, 'fish')).toBe(true);
    expect(itemContainsAllergen(tricky[7]!, 'milk')).toBe(true);
    expect(itemContainsAllergen(tricky[8]!, 'eggs')).toBe(true);
    expect(itemContainsAllergen(tricky[9]!, 'soy')).toBe(true);
  });

  it('inspects ingredient lists, not just names', () => {
    const dish = {
      name: 'Tom Yum Soup',
      allergens: [],
      ingredients: [{ name: 'prawns' }, { name: 'lemongrass' }],
    };
    expect(itemContainsAllergen(dish, 'shellfish')).toBe(true);
    expect(excludeAllergens([dish], ['shellfish'])).toHaveLength(0);
  });

  it('handles multiple simultaneous allergies with zero leakage', () => {
    const items = [
      { name: 'Trail Mix', allergens: [] },
      { name: 'Hummus Bowl', allergens: [] },
      { name: 'Grilled Steak with Potatoes', allergens: [] },
    ];
    const result = excludeAllergens(items, ['treeNuts', 'sesame']);
    expect(result.map((r) => r.name)).toEqual(['Grilled Steak with Potatoes']);
  });

  it('passes everything through when the user has no allergies', () => {
    const items = [
      { name: 'Peanut Butter Oats', allergens: ['peanuts' as const] },
      { name: 'Lemon Herb Salmon', allergens: ['fish' as const] },
    ];
    expect(excludeAllergens(items, [])).toHaveLength(2);
  });

  it('is case-insensitive on names', () => {
    expect(itemContainsAllergen({ name: 'CHICKEN SATAY', allergens: [] }, 'peanuts')).toBe(true);
    expect(itemContainsAllergen({ name: 'PrAwN cocktail', allergens: [] }, 'shellfish')).toBe(true);
  });

  it('does not false-positive on clean records for every allergen', () => {
    const clean = { name: 'Grilled Chicken with Rice and Green Beans', allergens: [] };
    for (const allergen of ALLERGENS) {
      expect(itemContainsAllergen(clean, allergen)).toBe(false);
    }
  });

  it('has a keyword net for every allergen in the shared vocabulary', () => {
    for (const allergen of ALLERGENS) {
      expect(ALLERGEN_NAME_KEYWORDS[allergen]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
