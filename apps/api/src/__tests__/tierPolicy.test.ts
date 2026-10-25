/**
 * Freemium lane split: meal photos and the weekly narrative are premium.
 * Coach chat and structured planning stay on the free credit meter.
 */
import { describe, expect, it } from 'vitest';
import type { ModelGroup } from '@aquazerofit/shared';
import { MODEL_GROUPS } from '@aquazerofit/shared';
import { AppError } from '../platform/errors';
import { assertLaneAllowed, isLaneAllowed, PREMIUM_LANES } from '../modules/ai/tierPolicy';

const FREE_LANES: ModelGroup[] = ['chatFast', 'planStructured', 'safetyCheap'];

describe('tier policy', () => {
  it('premium-gates meal photos and the weekly narrative, and nothing else', () => {
    expect([...PREMIUM_LANES].sort()).toEqual(['insightBatch', 'visionPrimary']);
    for (const lane of PREMIUM_LANES) {
      expect(isLaneAllowed('free', lane)).toBe(false);
      expect(isLaneAllowed('premium', lane)).toBe(true);
    }
    for (const lane of FREE_LANES) {
      expect(isLaneAllowed('free', lane)).toBe(true);
      expect(isLaneAllowed('premium', lane)).toBe(true);
    }
  });

  it('refuses a free meal photo with the existing premium message', () => {
    expect(() => assertLaneAllowed('free', 'visionPrimary')).toThrow(AppError);
    try {
      assertLaneAllowed('free', 'visionPrimary');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const error = err as AppError;
      expect(error.code).toBe('FORBIDDEN');
      expect(error.status).toBe(403);
      expect(error.message).toBe('This feature is part of AquaZeroFit Premium.');
      expect(error.details).toEqual({ task: 'visionPrimary', tier: 'free' });
    }
  });

  it('still admits a free coach turn', () => {
    expect(() => assertLaneAllowed('free', 'chatFast')).not.toThrow();
  });

  it('covers every model group, so a new lane cannot slip through unnamed', () => {
    const named = new Set<string>([...PREMIUM_LANES, ...FREE_LANES]);
    expect(named).toEqual(new Set(Object.keys(MODEL_GROUPS)));
  });
});
