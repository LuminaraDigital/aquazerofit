/**
 * Catalog matching for meal photos. The model names a food. These tests lock
 * the names a breakfast photo actually produces, including plurals and
 * misspellings, and they lock the rule that a miss carries no macros.
 */
import { describe, expect, it } from 'vitest';
import { foodsSeed } from '../data/seeds/foods';
import { loadPrompt } from '../modules/ai/prompts';
import { groundRecognisedFoods, matchFoodName } from '../modules/vision/foodMatch';
import { parseVisionRecognition, predictionsForVisionResult } from '../modules/vision/recognition';

function idFor(name: string): string {
  const match = matchFoodName(name, foodsSeed);
  if (!match) throw new Error(`no match for ${name}`);
  return match.food.id;
}

describe('matchFoodName', () => {
  it('matches bacon, a fried egg, and white bread toast', () => {
    expect(idFor('bacon')).toBe('food-bacon-grilled');
    expect(idFor('fried egg')).toBe('food-egg-whole');
    expect(idFor('white bread toast')).toBe('food-bread-white');
  });

  it('matches plurals and misspellings without jumping to a lookalike', () => {
    expect(idFor('eggs')).toBe('food-egg-whole');
    expect(idFor('bacons')).toBe('food-bacon-grilled');
    expect(idFor('bacn')).toBe('food-bacon-grilled');
    expect(idFor('chiken breast')).toBe('food-chicken-breast');
    expect(idFor('strawberries')).toBe('food-strawberries');
    expect(idFor('strawberry')).toBe('food-strawberries');
    expect(idFor('fried eggs')).not.toBe('food-egg-white');
  });

  it('leaves a name that is not in the catalog unmatched', () => {
    expect(matchFoodName('unicorn tartare', foodsSeed)).toBeNull();
    expect(matchFoodName('   ', foodsSeed)).toBeNull();
  });
});

describe('groundRecognisedFoods', () => {
  it('uses catalog nutrition for a match and invents nothing for a miss', () => {
    const [bacon, unknown] = groundRecognisedFoods(
      [
        { name: 'bacon', portion: 'two rashers', estimatedGrams: 40, confidence: 0.9 },
        { name: 'unicorn tartare', portion: 'one plate', estimatedGrams: 120, confidence: 0.4 },
      ],
      foodsSeed,
    );

    expect(bacon?.foodId).toBe('food-bacon-grilled');
    expect(bacon?.kcal).toBeCloseTo(104, 5);
    expect(bacon?.proteinG).toBeCloseTo(12.2, 5);
    expect(bacon?.matched).toBe(true);

    expect(unknown?.matched).toBe(false);
    expect(unknown?.foodId).toBeUndefined();
    expect(unknown?.kcal).toBeUndefined();
    expect(unknown?.proteinG).toBeUndefined();
    expect(unknown?.carbsG).toBeUndefined();
    expect(unknown?.fatG).toBeUndefined();
    expect(unknown?.name).toBe('unicorn tartare');
    expect(unknown?.portion).toBe('one plate');
  });
});

describe('parseVisionRecognition', () => {
  it('accepts the strict item shape and a portionDescription alias', () => {
    const parsed = parseVisionRecognition({
      items: [
        { name: 'bacon', portionDescription: 'two rashers', estimatedGrams: '40', confidence: 0.9 },
      ],
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.items).toEqual([
      { name: 'bacon', portion: 'two rashers', estimatedGrams: 40, confidence: 0.9 },
    ]);
  });

  it('rejects a payload that is not a list of foods', () => {
    expect(parseVisionRecognition({ note: 'looks like lunch' }).ok).toBe(false);
    expect(parseVisionRecognition(null).ok).toBe(false);
  });
});

describe('predictionsForVisionResult', () => {
  it('drops mock foods when the gateway is degraded', () => {
    const rows = predictionsForVisionResult(
      true,
      {
        items: [{ name: 'chicken breast', portion: 'one fillet', estimatedGrams: 120, confidence: 0.8 }],
      },
      foodsSeed,
    );
    expect(rows).toEqual([]);
  });

  it('grounds a real model answer and throws when the JSON is unusable', () => {
    const rows = predictionsForVisionResult(
      false,
      { items: [{ name: 'fried egg', portion: 'one egg', estimatedGrams: 50, confidence: 0.8 }] },
      foodsSeed,
    );
    expect(rows[0]?.foodId).toBe('food-egg-whole');
    expect(rows[0]?.kcal).toBeCloseTo(77.5, 5);
    expect(() => predictionsForVisionResult(false, { nope: true }, foodsSeed)).toThrow(/schema/);
  });
});

describe('P-01 vision prompt', () => {
  it('names foods without embedding the catalog', () => {
    const content = loadPrompt('P-01').content;
    const tokens = Math.ceil(content.length / 4);
    expect(content.length).toBeLessThan(1_500);
    expect(tokens).toBeLessThan(1_500);
    expect(content).toContain('1.3.0');
    expect(content).not.toMatch(/food-[a-z0-9-]+/);
    expect(content.toLowerCase()).not.toContain('candidates');
    expect(content).not.toContain('Kangaroo');
    expect(content).not.toContain('Barramundi');
    for (const food of foodsSeed) {
      expect(content).not.toContain(food.id);
    }
  });
});
