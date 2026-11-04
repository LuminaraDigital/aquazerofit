/**
 * Early cheers (AZF-P1 US-D2): a new person should feel noticed in week one.
 *
 * An experiment with a holdout. Each person's arm is a stable hash, salted
 * with the experiment name so it does not line up with the Fight Record
 * rollout bucket. It is recorded the first time they are eligible and the
 * recorded arm is the one used from then on, so a later change to the
 * treatment share (FC_EARLY_CHEERS_PERCENT) moves nobody between arms. A
 * share of 0 means the experiment is not running: no arm is recorded and no
 * coach cheer is sent, which is also how coach cheers are switched off.
 *
 * Treatment: on each of the first three days in their first week on which
 * they show up, their own coach sends one cheer, on that day or the next
 * read after it (a cheer is for showing up, so a late first visit does not
 * backfill a week of them). Holdout: none. A coach cheer is always labelled
 * automated in every view of it (cheers.ts), and is never presented as
 * coming from a person.
 *
 * Synchronised on read like belts and grace: idempotent on the one coach
 * cheer per recipient per day the schema allows, so a retry writes nothing.
 */
import { createHash } from 'node:crypto';
import { COACHES, DEFAULT_COACH_ID, type CheerKind, type User } from '@aquazerofit/shared';
import { addDays, daysBetween, localDateFor } from '../../platform/dates';
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

function coachIdFor(userId: string): string {
  const id = getCoachState(userId).activeCoachId;
  return COACHES.some((c) => c.id === id) ? id : DEFAULT_COACH_ID;
}

/**
 * Bring a new person's coach cheers up to date. A no-op while the experiment
 * is not running, outside week one, for the holdout, and once all three are
 * sent. `timezone` is the zone `today` was read in, so the first day is
 * counted in the same calendar as today.
 */
export async function syncEarlyCheers(
  userId: string,
  today: string,
  timezone: string | undefined,
  now: Date = new Date(),
): Promise<void> {
  if (fightCampConfig.earlyCheersPercent === 0) return;
  const user = getStore().byId<User>('users', userId);
  if (!user) return;
  const first = localDateFor(timezone ?? user.timezone, new Date(user.createdAt));
  const day = daysBetween(first, today);
  if (day < 0 || day >= WEEK_ONE_DAYS) return;

  const repo = engageRepo();
  const { arm, recorded } = await repo.assignArm(userId, 'early_cheers', earlyCheersArm(userId), now.toISOString());
  if (recorded) logEvent('early_cheers_arm', { arm });
  if (arm !== 'treatment') return;

  const sent = new Set((await repo.coachCheersTo(userId)).map((c) => c.localDate));
  if (sent.size >= EARLY_CHEER_DAYS) return;
  const yesterday = addDays(today, -1);
  const due = [...activeDatesOf(loadActivity(userId))]
    .filter((date) => date <= today && date >= first)
    .sort()
    .slice(0, EARLY_CHEER_DAYS)
    .filter((date) => date >= yesterday && !sent.has(date))
    .slice(0, EARLY_CHEER_DAYS - sent.size);

  const coachId = coachIdFor(userId);
  for (const localDate of due) {
    const cheer = COACH_CHEERS[sent.size] ?? 'glove';
    const inserted = await repo.insertCheer({
      id: newId('cheer'),
      fromKind: 'coach',
      fromUserId: null,
      coachId,
      toUserId: userId,
      squadId: null,
      cheer,
      localDate,
      createdAt: now.toISOString(),
      seenAt: null,
    });
    if (!inserted) continue;
    sent.add(localDate);
    logEvent('cheer_sent', { cheer, from_kind: 'coach', is_new_recipient: true });
  }
}
