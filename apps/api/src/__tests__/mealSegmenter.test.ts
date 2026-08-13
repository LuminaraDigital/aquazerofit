/**
 * segmentMealText — the deterministic floor under chat-native meal logging.
 *
 * It exists for two cases the gateway does not cover: an install with no
 * provider keys (AQF-10 principle 5 — the whole product works without them),
 * and a provider that returns 200 carrying JSON with no usable `items`, which
 * is not a failure and so is never retried or fallen back from. Both would
 * otherwise hand the user an empty card for a sentence the app can plainly
 * read.
 *
 * The invariant under test is the same one that governs the model path: this
 * function segments and counts, and emits NO nutrition figure. Grams, calories,
 * macros and allergens are the corpus's job downstream. A segmenter that
 * started guessing portions would move calculation out of code and into a
 * heuristic, which is exactly what AQF-09 §3 forbids.
 */
import { describe, expect, it } from 'vitest';
import { segmentMealText } from '../modules/chat/mealDraft';

describe('segmentMealText', () => {
  it('reads the flagship sentence into its separate foods', () => {
    const items = segmentMealText('two eggs and a flat white');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ foodName: 'eggs', quantity: 2, unit: 'serving' });
    expect(items[1]).toMatchObject({ foodName: 'flat white', quantity: 1, unit: 'serving' });
  });

  it('keeps a stated mass, because that is the one figure nobody inferred', () => {
    const items = segmentMealText('150 g chicken breast');
    expect(items[0]).toMatchObject({ foodName: 'chicken breast', quantity: 150, unit: 'g' });
  });

  it('handles the connectives people actually type', () => {
    const items = segmentMealText('porridge with blueberries, a banana and 250ml milk');
    expect(items.map((i) => i.foodName)).toEqual([
      'porridge',
      'blueberries',
      'banana',
      'milk',
    ]);
    expect(items[3]).toMatchObject({ quantity: 250, unit: 'ml' });
  });

  it('does not swallow the food when the food is the last word', () => {
    // "two slices" — `slices` is a unit word, but consuming it would leave no
    // food at all, so it has to stay the name.
    expect(segmentMealText('two slices')[0]).toMatchObject({
      foodName: 'slices',
      quantity: 2,
      unit: 'serving',
    });
    expect(segmentMealText('two slices of toast')[0]).toMatchObject({
      foodName: 'toast',
      quantity: 2,
      unit: 'slices',
    });
  });

  it('understands number words and leading narration', () => {
    const items = segmentMealText('I had three eggs');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ foodName: 'eggs', quantity: 3 });
  });

  it('returns nothing when there is no food in the sentence', () => {
    expect(segmentMealText('some of the')).toHaveLength(0);
    expect(segmentMealText('   ')).toHaveLength(0);
    expect(segmentMealText('')).toHaveLength(0);
  });

  it('emits no nutrition figure of any kind', () => {
    // The whole point: this may never become a second source of numbers.
    for (const item of segmentMealText('two eggs, 150 g chicken and a flat white')) {
      expect(Object.keys(item).sort()).toEqual(['foodName', 'phrase', 'quantity', 'unit']);
    }
  });

  it('bounds what a single sentence can produce', () => {
    const many = Array.from({ length: 40 }, (_, i) => `food${i}`).join(' and ');
    expect(segmentMealText(many).length).toBeLessThanOrEqual(12);
    const longName = `1 ${'x'.repeat(300)}`;
    expect(segmentMealText(longName)[0]!.foodName.length).toBeLessThanOrEqual(80);
  });

  it('echoes the user own words so the card can show what was read', () => {
    const items = segmentMealText('two eggs and a flat white');
    expect(items[0]!.phrase).toBe('two eggs');
    expect(items[1]!.phrase).toBe('a flat white');
  });
});
