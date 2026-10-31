/**
 * TierPolicy (AQF-09 §2.3): free-tier lane confinement.
 *
 * Premium lanes are the ones a free account must not send to a real provider:
 * - insightBatch: coach-written weekly note. Free accounts still receive the
 *   deterministic summary; the progress route checks isLaneAllowed and falls
 *   back instead of throwing.
 *
 * chatFast (coach chat), planStructured (plans, meal recommendations,
 * meal-text drafts) and visionPrimary (meal-photo recognition) stay on the free
 * credit meter. A photograph costs 3 of the 10-credit daily grant, so a free
 * account can scan at most three a day. Plan generation caps at
 * 4096 output tokens and costs 5 of the 10-credit daily grant, so a free
 * account can run it at most twice a day, and an empty balance already falls
 * back to the deterministic planner. Exercise-swap ranking rides chatFast
 * (512 tokens) and only when no variation-group sibling exists.
 * safetyCheap is guardrails and memory extraction, not a product surface.
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
