import { describe, expect, it } from 'vitest';
import { mealTextOf, mealTypeIn, parseCoachIntent } from '../modules/chat/actions';

describe('parseCoachIntent', () => {
  it.each([
    ['I drank 500ml of water', { kind: 'logWater', amountMl: 500 }],
    ["I've had 1.5 litres of water", { kind: 'logWater', amountMl: 1500 }],
    ['just had a glass of water', { kind: 'logWater', amountMl: 250 }],
    ['log 750 ml water', { kind: 'logWater', amountMl: 750 }],
    ['I weigh 82.5kg', { kind: 'logWeight', weightKg: 82.5 }],
    ['weighed in at 80 kg this morning', { kind: 'logWeight', weightKg: 80 }],
    ['log my weight 180 lbs', { kind: 'logWeight', weightKg: 81.6 }],
  ])('reads a report: %s', (text, action) => {
    expect(parseCoachIntent(text)).toEqual(action);
  });

  // A wrong proposal is worse than a missed one, so everything that is not a
  // plain report of today has to fall through to ordinary chat.
  it.each([
    'How much water should I drink, 2 litres?',
    'how do I log 500ml of water',
    "don't log 500ml of water",
    "I didn't drink 500ml of water",
    'I had 2 litres of water yesterday',
    'I wish I weighed 70kg',
    'I want to weigh 70kg',
    'I used to weigh 90kg',
    'if I weigh 70kg what should I eat',
    'I weigh 80kg, how much protein do I need?',
    'I drank 9 litres of water',
    'I weigh 5kg',
    'I weigh 900kg',
    'I drank 1,500ml of water',
    'What should I eat tonight?',
    'I weighed 95kg last year',
    'I weighed 82kg on Monday',
    'I weighed 70kg before the surgery',
    'My doctor says I weigh 85 kg',
    'my weight is 70 kg, is that ok',
    'I had 2 litres of water on Monday',
    'I had pizza last month',
    'I weigh 45kg and I feel disgusting',
    'I had a cracker today and feel guilty',
    'I ate too much pasta',
  ])('leaves it as chat: %s', (text) => {
    expect(parseCoachIntent(text)).toBeNull();
  });

  it.each([
    ['I had chicken and rice for lunch', 'logMeal'],
    ['just ate two eggs', 'logMeal'],
    ["I've eaten a banana", 'logMeal'],
  ])('reads a meal: %s', (text, kind) => {
    expect(parseCoachIntent(text)?.kind).toBe(kind);
  });

  it.each([
    'Should I have had more protein at lunch?',
    'I had chicken yesterday',
    'I did not eat breakfast',
    'I want to have had a better day',
  ])('does not read a meal: %s', (text) => {
    expect(parseCoachIntent(text)).toBeNull();
  });

  it.each([
    ['can you swap the squats for something else?', 'squats'],
    ['Replace bench press please', 'bench press'],
    ["switch out today's lunges", 'lunges'],
    ['swap my plank because my back is sore', 'plank'],
  ])('reads a swap: %s', (text, exerciseName) => {
    expect(parseCoachIntent(text)).toEqual({ kind: 'swapExercise', exerciseName });
  });

  it.each([
    ['Rebuild my plan', 'general'],
    ['can you make me a new training plan?', 'general'],
    ['give me a new strength plan', 'strength'],
    ['regenerate my weight loss plan', 'weightLoss'],
  ])('reads a rebuild: %s', (text, focus) => {
    expect(parseCoachIntent(text)).toEqual({ kind: 'rebuildPlan', focus });
  });

  it.each([
    "don't rebuild my plan",
    'do not swap the squats',
    'rebuild my meal plan',
    'should I redo my plan?',
    "I'll swap squats for lunges myself",
    'What is a good plan for rebuilding muscle?',
  ])('does not act on: %s', (text) => {
    expect(['rebuildPlan', 'swapExercise']).not.toContain(parseCoachIntent(text)?.kind);
  });

  it('takes the meal time out of the food text', () => {
    expect(mealTextOf('I had rice for lunch').trim()).toBe('I had rice');
    expect(mealTypeIn('I had rice for lunch')).toBe('lunch');
    expect(mealTypeIn('I had rice')).toBeNull();
  });
});
