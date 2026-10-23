// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackGrowth = vi.fn(() => Promise.resolve());

vi.mock('./growth', () => ({ trackGrowth }));

describe('retention telemetry', () => {
  beforeEach(() => {
    localStorage.clear();
    trackGrowth.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('fires first-value meal only once per browser', async () => {
    const { trackFirstValueMeal } = await import('./retention');
    trackFirstValueMeal('nutrition');
    trackFirstValueMeal('nutrition');
    expect(trackGrowth).toHaveBeenCalledTimes(1);
    expect(trackGrowth).toHaveBeenCalledWith('first_value_meal', { source: 'nutrition' });
  });

  it('always forwards friction events', async () => {
    const { trackFriction } = await import('./retention');
    trackFriction('error_encountered', { message: 'x'.repeat(200), surface: 'dashboard' });
    expect(trackGrowth).toHaveBeenCalledTimes(1);
    expect(trackGrowth).toHaveBeenCalledWith(
      'error_encountered',
      expect.objectContaining({
        surface: 'dashboard',
        message: 'x'.repeat(120),
      }),
    );
  });
});
