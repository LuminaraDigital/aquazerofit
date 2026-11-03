import { describe, expect, it } from 'vitest';
import {
  confidenceBandFromScore,
  confidenceBandLabel,
  COOKING_FAT_PRESETS,
  FAT_CAUTION_NOTE,
  portionCorrectionWorthRemembering,
  shouldShowFatCaution,
} from '@aquazerofit/shared';
import { buildDraftItems, scoreFood, tokensOf } from '../modules/chat/mealDraft';
import type { Food } from '@aquazerofit/shared';

describe('mealTrust helpers', () => {
  it('maps scores to confidence bands', () => {
    expect(confidenceBandFromScore(100)).toBe('high');
    expect(confidenceBandFromScore(80)).toBe('high');
    expect(confidenceBandFromScore(60)).toBe('moderate');
    expect(confidenceBandFromScore(40)).toBe('low');
    expect(confidenceBandLabel('high')).toBe('High match');
  });

  it('flags fat caution for fried cues and high fat share', () => {
    expect(shouldShowFatCaution(['grilled chicken'], { kcal: 400, fatG: 10 })).toBe(false);
    expect(shouldShowFatCaution(['fried chicken'], { kcal: 400, fatG: 10 })).toBe(true);
    expect(shouldShowFatCaution(['salad'], { kcal: 400, fatG: 25 })).toBe(true);
  });

  it('detects portion corrections worth remembering', () => {
    expect(portionCorrectionWorthRemembering(100, 100)).toBe(false);
    expect(portionCorrectionWorthRemembering(100, 130)).toBe(true);
    expect(portionCorrectionWorthRemembering(100, 70)).toBe(true);
  });

  it('exposes cooking fat presets', () => {
    expect(COOKING_FAT_PRESETS.length).toBeGreaterThanOrEqual(3);
  });

  it('ships the fat caution copy users see before confirming', () => {
    expect(FAT_CAUTION_NOTE).toContain('cooking oil');
    expect(FAT_CAUTION_NOTE.length).toBeGreaterThan(20);
  });
});

describe('meal draft match score', () => {
  const egg: Food = {
    id: 'food-egg',
    type: 'food',
    name: 'Egg (boiled)',
    category: 'dairy_eggs',
    per100g: { kcal: 155, proteinG: 13, carbsG: 1.1, fatG: 11 },
    allergens: ['eggs'],
    commonServings: [{ label: '1 large egg', grams: 50 }],
    source: 'test',
    licence: 'CC0',
  };

  it('includes score on each match', () => {
    const items = buildDraftItems(
      [{ foodName: 'egg', quantity: 2, unit: 'serving', phrase: 'two eggs' }],
      [egg],
      [],
    );
    expect(items[0]?.matches[0]?.score).toBe(scoreFood(tokensOf('egg'), egg));
    expect(items[0]?.matches[0]?.score).toBeGreaterThan(0);
  });
});
