/**
 * Early cheers (AZF-P1 US-D2): a new person should feel noticed in week one.
 *
 * An experiment with a holdout. Each person's arm is a stable hash, salted
 * with the experiment name so it does not line up with the Fight Record
 * rollout bucket, and is recorded the first time they are eligible, so the
 * analysis reads the arm they were really in even after the treatment
 * share (FC_EARLY_CHEERS_PERCENT) changes.
 *
 * Treatment: on each of the first three days in their first week on which
 * they show up, their own coach sends one cheer. Holdout: none. A coach
 * cheer is always labelled automated in every view of it (cheers.ts), and is
 * never presented as coming from a person.
 *
 * Synchronised on read like belts and grace: idempotent on the one coach
 * cheer per recipient per day the schema allows, so a retry writes nothing.
 */
import { createHash } from 'node:crypto';
import { COACHES, DEFAULT_COACH_ID, type CheerKind, type User } from '@aquazerofit/shared';
import { daysBetween, localDateFor } from '../../platform/dates';
import { fightCampConfig } from '../../platform/fightCampConfig';
import { getStore, newId } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { getCoachState } from '../coaches/service';
import { activeDatesOf, loadActivity } from '../progress/service';
import { engageRepo, type ExperimentArm } from './repo';

export const EARLY_CHEER_DAYS = 3;
const WEEK_ONE_DAYS = 7;
/** One per showing-up day, in this order. */
const COACH_CHEERS: readonly CheerKind[] = ['glove', 'fire', 'muscle'];

export function earlyCheersBucket(userId: string): number {
  const digest = createHash('sha256').update(`early-cheers:${userId}`).digest('hex');
  return parseInt(digest.slice(0, 8), 16) % 100;
}

export function earlyCheersArm(userId: string): ExperimentArm {
  return earlyCheersBucket(userId) < fightCampConfig.earlyCheersPercent ? 'treatment' : 'holdout';
}

/** The person's first local day, in the zone they told us, else UTC. */
function firstLocalDay(user: User): string {
  return localDateFor(user.timezone, new Date(user.createdAt));
}

function coachIdFor(userId: string): string {
  const id = getCoachState(userId).activeCoachId;
  return COACHES.some((c) => c.id === id) ? id : DEFAULT_COACH_ID;
}

/**
 * Bring a new person's coach cheers up to date. A no-op outside week one,
 * for the holdout, and once all three are sent.
 */
export async function syncEarlyCheers(userId: string, today: string, now: Date = new Date()): Promise<void> {
  const user = getStore().byId<User>('users', userId);
  if (!user) return;
  const first = firstLocalDay(user);
  if (daysBetween(first, today) >= WEEK_ONE_DAYS || daysBetween(first, today) < 0) return;

  const arm = earlyCheersArm(userId);
  if (await engageRepo().assignArm(userId, 'early_cheers', arm, now.toISOString())) {
    logEvent('early_cheers_arm', { arm });
  }
  if (arm !== 'treatment') return;

  const weekOneActive = [...activeDatesOf(loadActivity(userId))]
    .filter((date) => date <= today && daysBetween(first, date) >= 0 && daysBetween(first, date) < WEEK_ONE_DAYS)
    .sort()
    .slice(0, EARLY_CHEER_DAYS);
  if (weekOneActive.length === 0) return;

  const sent = new Set((await engageRepo().coachCheersTo(userId)).map((c) => c.localDate));
  const coachId = coachIdFor(userId);
  for (const [index, localDate] of weekOneActive.entries()) {
    if (sent.has(localDate)) continue;
    const inserted = await engageRepo().insertCheer({
      id: newId('cheer'),
      fromKind: 'coach',
      fromUserId: null,
      coachId,
      toUserId: userId,
      squadId: null,
      cheer: COACH_CHEERS[index] ?? 'glove',
      localDate,
      createdAt: now.toISOString(),
      seenAt: null,
    });
    if (inserted) logEvent('cheer_sent', { cheer: COACH_CHEERS[index] ?? 'glove', from_kind: 'coach', is_new_recipient: true });
  }
}
