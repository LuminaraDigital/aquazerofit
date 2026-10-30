import { describe, expect, it } from 'vitest';
import { parseCoachAction } from '../modules/chat/actions';

describe('parseCoachAction', () => {
  it.each([
    ['I drank 500ml of water', { kind: 'logWater', amountMl: 500 }],
    ["I've had 1.5 litres of water", { kind: 'logWater', amountMl: 1500 }],
    ['just had a glass of water', { kind: 'logWater', amountMl: 250 }],
    ['log 750 ml water', { kind: 'logWater', amountMl: 750 }],
    ['I weigh 82.5kg', { kind: 'logWeight', weightKg: 82.5 }],
    ['weighed in at 80 kg this morning', { kind: 'logWeight', weightKg: 80 }],
    ['log my weight 180 lbs', { kind: 'logWeight', weightKg: 81.6 }],
  ])('reads a report: %s', (text, action) => {
    expect(parseCoachAction(text)).toEqual(action);
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
  ])('leaves it as chat: %s', (text) => {
    expect(parseCoachAction(text)).toBeNull();
  });
});
