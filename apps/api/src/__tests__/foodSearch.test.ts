import { describe, expect, it } from 'vitest';
import type { Food } from '@aquazerofit/shared';
import { rankFoodSearch } from '../modules/foods/search';

function food(id: string, name: string, category = 'Prepared Meals', brand?: string): Food {
  return {
    id,
    type: 'food',
    name,
    brand,
    category,
    per100g: { kcal: 100, proteinG: 10, carbsG: 10, fatG: 2 },
    commonServings: [{ label: '1 serve', grams: 100 }],
    allergens: [],
    source: 'test',
    licence: 'test',
  };
}

const CATALOG = [
  food('breast', 'Chicken Breast (grilled)', 'Protein'),
  food('caesar', 'Chicken Caesar Salad'),
  food('soup', 'Chicken and Vegetable Soup'),
  food('garden', 'Garden Salad'),
  food('oats', 'Rolled Oats', 'Grains'),
];

describe('food search tokens', () => {
  it('finds a multi-word query when the tokens are not adjacent', () => {
    const names = rankFoodSearch(CATALOG, 'chicken salad', 20).map((item) => item.name);
    expect(names).toContain('Chicken Caesar Salad');
    expect(names).not.toContain('Chicken Breast (grilled)');
    expect(names).not.toContain('Garden Salad');
  });

  it('still returns chicken dishes for a single token', () => {
    const names = rankFoodSearch(CATALOG, 'chicken', 20).map((item) => item.name);
    expect(names).toContain('Chicken Caesar Salad');
    expect(names).toContain('Chicken Breast (grilled)');
    expect(names).not.toContain('Garden Salad');
  });

  it('matches a brand token and ignores empty queries by name', () => {
    const branded = [...CATALOG, food('bar', 'Protein Bar', 'Snacks', 'Acme Foods')];
    expect(rankFoodSearch(branded, 'acme', 5).map((item) => item.id)).toEqual(['bar']);
    expect(rankFoodSearch(CATALOG, '   ', 2).map((item) => item.name)).toEqual([
      'Chicken and Vegetable Soup',
      'Chicken Breast (grilled)',
    ]);
  });
});
