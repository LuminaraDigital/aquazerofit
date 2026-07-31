/**
 * TierPolicy (AQF-09 §2.3): free-tier lane confinement.
 * The free tier is confined to non-premium lanes; the batch insight lane is
 * premium-only. Route by task, not by habit (AQF-10 §6).
 */
import { AppError } from '../../platform/errors';
import type { ModelGroup, UserTier } from '@aquazerofit/shared';

export const PREMIUM_LANES: readonly ModelGroup[] = ['insightBatch'] as const;

export function isLaneAllowed(tier: UserTier, task: ModelGroup): boolean {
  if (tier === 'premium') return true;
  return !PREMIUM_LANES.includes(task);
}

/** Throws FORBIDDEN when a free-tier user requests a premium lane. */
export function assertLaneAllowed(tier: UserTier, task: ModelGroup): void {
  if (!isLaneAllowed(tier, task)) {
    throw new AppError('FORBIDDEN', 'This feature is part of AquaZeroFit Premium.', {
      task,
      tier,
    });
  }
}
