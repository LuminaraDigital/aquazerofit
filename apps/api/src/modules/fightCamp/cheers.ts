/**
 * Cheers (AZF-P1 Epic D): one tap of support between squad mates.
 *
 *  - Five fixed cheers and no free text, so there is nothing to moderate.
 *  - One per sender, recipient and the sender's local day, enforced by a
 *    unique index; a second tap answers "sent today".
 *  - Only between active members of the same squad. An outsider, an unknown
 *    ref, a former member and the sender themself all get the same refusal,
 *    so the route says nothing about who is in which squad.
 *  - A cheer from someone who has since left, or whose account is gone,
 *    stays in the inbox as "A former squad mate".
 *  - A coach's cheer (early cheers, US-D2) is always labelled automated.
 */
import {
  CHEER_EMOJI,
  COACHES,
  seasonFor,
  type CheerView,
  type SendCheerInput,
  type User,
} from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { getStore, newId } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { engageRepo, type CheerCursor, type CheerRow } from './repo';
import { sendNudge } from './nudges';
import { displayNameOf, requireSquadAdult, telegramSafe } from './squads';
import { fcEnabled } from './flags';
import { localDateFor } from '../../platform/dates';
import { isAdult } from '../fightRecord/service';
import { getProfile } from '../me/service';

/** The inbox shows the last thirty days, a page at a time. */
export const CHEER_INBOX_DAYS = 30;
export const CHEER_PAGE_SIZE = 20;
/** An account younger than this is new (the early-cheers window, US-D2). */
export const NEW_ACCOUNT_DAYS = 7;

const DAY_MS = 86_400_000;
const FORMER_MATE = 'A former squad mate';

function notSquadMate(): never {
  throw new AppError('FORBIDDEN', 'You can cheer the people in your squad.', { reason: 'not_squad_mate' });
}

function isNewAccount(userId: string, now: Date): boolean {
  const createdAt = getStore().byId<User>('users', userId)?.createdAt;
  return createdAt !== undefined && now.getTime() - Date.parse(createdAt) < NEW_ACCOUNT_DAYS * DAY_MS;
}

/**
 * The day "one cheer a day" counts on. The sender's stored timezone when
 * there is one: the X-Timezone header is the client's word, and any zone
 * from UTC-12 to UTC+14 would let a sender claim two or three different
 * dates within minutes.
 */
function senderLocalDate(senderId: string, today: string, now: Date): string {
  const timezone = getStore().byId<User>('users', senderId)?.timezone;
  return timezone ? localDateFor(timezone, now) : today;
}

export function encodeCursor(cursor: CheerCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString('base64url');
}

/** A cursor this API issued, or null for anything else (which reads from the start). */
export function decodeCursor(raw: unknown): CheerCursor | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 200) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [createdAt, id] = value as [unknown, unknown];
    // Exactly what encodeCursor wrote: an ISO instant and an id. V8 parses
    // "1" or "foo 2" as dates, which Postgres would then refuse with a 500.
    if (typeof createdAt !== 'string' || typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) return null;
    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== createdAt) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Who a cheer shows as, for its recipient. */
async function senderOf(row: CheerRow, recipientId: string, today: string): Promise<CheerView['from']> {
  if (row.fromKind === 'coach') {
    const coach = COACHES.find((c) => c.id === row.coachId);
    return { kind: 'coach', coachName: coach?.name ?? 'Your coach', automated: true };
  }
  if (row.fromUserId === null) return { kind: 'member', displayName: FORMER_MATE };
  const season = seasonFor(today).number;
  const [theirs, mine] = await Promise.all([
    engageRepo().activeMembership(row.fromUserId, season),
    engageRepo().activeMembership(recipientId, season),
  ]);
  const stillMates = theirs !== null && mine !== null && theirs.squadId === mine.squadId;
  return { kind: 'member', displayName: stillMates ? displayNameOf(row.fromUserId) : FORMER_MATE };
}

async function viewOf(row: CheerRow, recipientId: string, today: string): Promise<CheerView> {
  return {
    id: row.id,
    from: await senderOf(row, recipientId, today),
    cheer: row.cheer,
    createdAt: row.createdAt,
    seen: row.seenAt !== null,
  };
}

export async function sendCheer(
  senderId: string,
  input: SendCheerInput,
  today: string,
  now: Date = new Date(),
): Promise<{ id: string; cheer: CheerView['cheer']; createdAt: string }> {
  requireSquadAdult(senderId);
  const repo = engageRepo();
  const me = await repo.activeMembership(senderId, seasonFor(today).number);
  // The ref is looked up inside the sender's own squad only, so it cannot
  // reach anyone elsewhere; a mate no longer known to be an adult is out of
  // reach too (squads.adultMembers takes them out on the next read).
  const target = me ? await repo.activeMemberByRef(me.squadId, input.to) : null;
  // Both ends must have squads and cheers on: someone the rollout no longer
  // includes would otherwise be cheered (and messaged) while their own Fight
  // Camp answers 404 and they cannot reach their squad to leave it.
  if (
    !me ||
    !target ||
    target.userId === senderId ||
    !isAdult(getProfile(target.userId)) ||
    !fcEnabled('squads', target.userId) ||
    !fcEnabled('cheers', target.userId)
  ) {
    notSquadMate();
  }
  const localDate = senderLocalDate(senderId, today, now);
  const row: CheerRow = {
    id: newId('cheer'),
    fromKind: 'member',
    fromUserId: senderId,
    coachId: null,
    toUserId: target.userId,
    squadId: me.squadId,
    cheer: input.cheer,
    localDate,
    createdAt: now.toISOString(),
    seenAt: null,
  };
  if (!(await repo.insertCheer(row))) {
    throw new AppError('CONFLICT', 'Sent today. You can cheer them again tomorrow.', {
      reason: 'cheer_already_today',
    });
  }
  logEvent('cheer_sent', {
    cheer: input.cheer,
    from_kind: 'member',
    is_new_recipient: isNewAccount(target.userId, now),
  });
  // Not awaited: the sender never waits on Telegram, and sendNudge never throws.
  void sendNudge(
    target.userId,
    'cheer',
    `${telegramSafe(displayNameOf(senderId), 'A squad mate')} sent you a ${CHEER_EMOJI[input.cheer]} cheer on AquaZeroFit.`,
    now,
  );
  return { id: row.id, cheer: row.cheer, createdAt: row.createdAt };
}

export async function cheerInbox(
  userId: string,
  cursor: CheerCursor | null,
  today: string,
  now: Date = new Date(),
): Promise<{ cheers: CheerView[]; nextCursor: string | null }> {
  const since = new Date(now.getTime() - CHEER_INBOX_DAYS * DAY_MS).toISOString();
  // One more than a page tells whether another page exists.
  const rows = await engageRepo().cheersTo(userId, {
    since,
    limit: CHEER_PAGE_SIZE + 1,
    ...(cursor ? { before: cursor } : {}),
  });
  const page = rows.slice(0, CHEER_PAGE_SIZE);
  const last = page.at(-1);
  return {
    cheers: await Promise.all(page.map((row) => viewOf(row, userId, today))),
    nextCursor: rows.length > CHEER_PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

export async function markCheersSeen(userId: string, ids: readonly string[], now: Date = new Date()): Promise<void> {
  if (ids.length > 0) await engageRepo().markCheersSeen(userId, ids, now.toISOString());
}

export async function unseenCheers(userId: string, now: Date = new Date()): Promise<number> {
  return engageRepo().unseenCheerCount(userId, new Date(now.getTime() - CHEER_INBOX_DAYS * DAY_MS).toISOString());
}

/** User ids the sender has cheered on their local `today`. */
export async function cheeredToday(senderId: string, today: string): Promise<Set<string>> {
  return new Set((await engageRepo().cheersSentOn(senderId, today)).map((c) => c.toUserId));
}
