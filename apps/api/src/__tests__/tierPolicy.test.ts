/**
 * Freemium lane split: the weekly narrative is premium. Coach chat, structured
 * planning and meal photos stay on the free credit meter.
 */
import { describe, expect, it } from 'vitest';
import type { ModelGroup } from '@aquazerofit/shared';
import { MODEL_GROUPS } from '@aquazerofit/shared';
import { AppError } from '../platform/errors';
import { assertLaneAllowed, isLaneAllowed, PREMIUM_LANES } from '../modules/ai/tierPolicy';

const FREE_LANES: ModelGroup[] = ['chatFast', 'planStructured', 'safetyCheap', 'visionPrimary'];

describe('tier policy', () => {
  it('premium-gates the weekly narrative, and nothing else', () => {
    expect([...PREMIUM_LANES]).toEqual(['insightBatch']);
    for (const lane of PREMIUM_LANES) {
      expect(isLaneAllowed('free', lane)).toBe(false);
      expect(isLaneAllowed('premium', lane)).toBe(true);
    }
    for (const lane of FREE_LANES) {
      expect(isLaneAllowed('free', lane)).toBe(true);
      expect(isLaneAllowed('premium', lane)).toBe(true);
    }
  });

  it('refuses a free premium lane with the existing premium message', () => {
    expect(() => assertLaneAllowed('free', 'insightBatch')).toThrow(AppError);
    try {
      assertLaneAllowed('free', 'insightBatch');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const error = err as AppError;
      expect(error.code).toBe('FORBIDDEN');
      expect(error.status).toBe(403);
      expect(error.message).toBe('This feature is part of AquaZeroFit Premium.');
      expect(error.details).toEqual({ task: 'insightBatch', tier: 'free' });
    }
  });

  it('still admits a free coach turn and a free meal photo', () => {
    expect(() => assertLaneAllowed('free', 'chatFast')).not.toThrow();
    expect(() => assertLaneAllowed('free', 'visionPrimary')).not.toThrow();
  });

  it('covers every model group, so a new lane cannot slip through unnamed', () => {
    const named = new Set<string>([...PREMIUM_LANES, ...FREE_LANES]);
    expect(named).toEqual(new Set(Object.keys(MODEL_GROUPS)));
  });
});
