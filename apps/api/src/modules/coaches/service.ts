/**
 * CoachService: selection, entitlement and bond accounting.
 *
 * The entitlement check here is the *only* authority on whether a user may
 * train under a coach. The client renders locks for feel; this decides. That
 * separation matters more than usual because one of the doors is a paid one —
 * a lock enforced only in the UI is a coach anyone can have for free by
 * editing a request, which would make the Stars price a donation.
 */
import {
  COACHES,
  DEFAULT_COACH_ID,
  bondLevelForXp,
  coachById,
  defaultCoach,
  requiredLevelOf,
  starsPriceOf,
  type CoachEntitlement,
  type CoachPersona,
  type CoachState,
  type ExperienceStatus,
} from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { getStore } from '../../platform/store';
import { localDateFor } from '../../platform/dates';
import { loadActivity } from '../progress/service';
import { experienceFor } from '../progress/experience';

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * The user's coach record, created on first read.
 *
 * Lazily rather than at registration because coach selection is optional: a
 * user who never opens the roster still has a coach (the default), and
 * materialising a row for every account to say so is storage spent on a
 * value the code already knows.
 */
export function getCoachState(userId: string): CoachState {
  const existing = getStore().byId<CoachState>('profiles', coachStateId(userId));
  if (existing) return existing;
  return {
    type: 'coachState',
    id: coachStateId(userId),
    userId,
    activeCoachId: DEFAULT_COACH_ID,
    baselineXp: 0,
    accrued: {},
    purchased: [],
    seenLevel: 1,
    seenRankId: 'rookie',
    seenAchievementIds: [],
    selectedAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function coachStateId(userId: string): string {
  return `coachState:${userId}`;
}

export function saveCoachState(state: CoachState): CoachState {
  state.updatedAt = nowIso();
  return getStore().upsert<CoachState>('profiles', state);
}

/** Total XP for a user, folded from their activity. */
export function experienceOf(userId: string, timezone?: string): ExperienceStatus {
  return experienceFor(loadActivity(userId), localDateFor(timezone));
}

/**
 * Bond with a specific coach: settled accruals plus, for the active coach, the
 * XP earned since selection. `baselineXp` can exceed `totalXp` only if history
 * were deleted underneath us, so the open amount is floored at zero rather
 * than allowed to run negative and silently erase a settled bond.
 */
export function bondXpFor(state: CoachState, coachId: string, totalXp: number): number {
  const settled = state.accrued[coachId] ?? 0;
  if (coachId !== state.activeCoachId) return settled;
  return settled + Math.max(0, totalXp - state.baselineXp);
}

export function isUnlocked(
  coach: CoachPersona,
  state: CoachState,
  level: number,
): { unlocked: boolean; reason: CoachEntitlement['reason'] } {
  if (coach.unlock.kind === 'free') return { unlocked: true, reason: 'free' };
  if (state.purchased.includes(coach.id)) return { unlocked: true, reason: 'purchased' };
  if (level >= coach.unlock.level) return { unlocked: true, reason: 'level' };
  return { unlocked: false, reason: 'locked' };
}

export function entitlementsFor(userId: string, timezone?: string): {
  state: CoachState;
  experience: ExperienceStatus;
  entitlements: CoachEntitlement[];
} {
  const state = getCoachState(userId);
  const experience = experienceOf(userId, timezone);

  const entitlements = COACHES.map<CoachEntitlement>((coach) => {
    const { unlocked, reason } = isUnlocked(coach, state, experience.level);
    const bondXp = bondXpFor(state, coach.id, experience.totalXp);
    return {
      coachId: coach.id,
      unlocked,
      reason,
      requiredLevel: unlocked ? 0 : requiredLevelOf(coach),
      // Price is reported only while the coach is actually locked: showing a
      // price beside something already owned is how a store sells a user the
      // same thing twice.
      starsPrice: unlocked ? null : (starsPriceOf(coach) || null),
      bondXp,
      bondLevel: bondLevelForXp(bondXp),
    };
  });

  return { state, experience, entitlements };
}

/**
 * Switch the active coach.
 *
 * Settling before switching is the whole correctness requirement: the open
 * bond only makes sense relative to `baselineXp`, so leaving it unsettled and
 * moving the baseline would attribute the previous coach's accrued XP to the
 * new one. Settle, then re-baseline, then swap.
 */
export function selectCoach(userId: string, coachId: string, timezone?: string): CoachState {
  const coach = coachById(coachId);
  if (!coach) throw new AppError('NOT_FOUND', 'Unknown coach.');

  const state = getCoachState(userId);
  const experience = experienceOf(userId, timezone);
  const { unlocked } = isUnlocked(coach, state, experience.level);
  if (!unlocked) {
    throw new AppError(
      'FORBIDDEN',
      `${coach.name} is not unlocked yet. ${coach.unlock.kind === 'earned' ? coach.unlock.label : ''}`.trim(),
    );
  }

  if (state.activeCoachId !== coachId) {
    state.accrued[state.activeCoachId] = bondXpFor(
      state,
      state.activeCoachId,
      experience.totalXp,
    );
    state.activeCoachId = coachId;
    state.baselineXp = experience.totalXp;
    state.selectedAt = nowIso();
  }
  return saveCoachState(state);
}

/**
 * Record a completed Stars purchase. Idempotent on the coach id: Telegram can
 * deliver `successful_payment` more than once, and the caller has already
 * de-duplicated on the charge id, so a repeat here must be a no-op rather than
 * a second entry in `purchased`.
 */
export function grantPurchasedCoach(userId: string, coachId: string): CoachState {
  const state = getCoachState(userId);
  if (!state.purchased.includes(coachId)) state.purchased.push(coachId);
  return saveCoachState(state);
}

/** The persona a user is actually training under, always resolvable. */
export function activeCoachFor(userId: string): CoachPersona {
  return coachById(getCoachState(userId).activeCoachId) ?? defaultCoach();
}
