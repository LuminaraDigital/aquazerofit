/**
 * Squads (AZF-P1 Epic C): private groups of up to five, one per person per
 * season, adults only.
 *
 * Privacy is the shape of the read model rather than a filter applied to it:
 *
 *  - members are addressed by an opaque `member_ref`, never a user id, and
 *    every member-scoped action first proves the caller is an active member
 *    of the squad named in the path (the IDOR tests cover each route);
 *  - a member's first name and belt are visible to the squad (they agreed to
 *    that at join), their weekly active days only if they turned "show my
 *    numbers" on; an auto-filled name (an email's local part, "Telegram
 *    user 123") is never shown;
 *  - the weekly board counts active days and nothing else, one per day;
 *  - adults only, continuously: a member whose age is no longer known to be
 *    18 or over is taken out of the squad the next time anyone reads it.
 *
 * Invite codes are bearer capabilities, so they are long (32^10), every
 * lookup that fails before membership answers the same 404, repeated
 * misses lock the caller out for an hour, and an owner can rotate the code
 * or remove a member who should not be there.
 *
 * Integrity rules (capacity, one squad a season, ownership passing on) are
 * enforced atomically in the repository; this file turns its outcomes into
 * the API's errors.
 */
import { randomInt } from 'node:crypto';
import {
  SQUAD_CODE_LENGTH,
  SQUAD_CODE_PREFIX,
  SQUAD_CONSENT_VERSION,
  SQUAD_MAX_MEMBERS,
  containsProfanity,
  seasonByNumber,
  seasonFor,
  squadWeekPoints,
  weekStartOf,
  type SquadMemberView,
  type SquadPeekView,
  type SquadView,
  type User,
} from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { AppError } from '../../platform/errors';
import { getStore, newId } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { auditDataAccess, getProfile } from '../me/service';
import { activeDatesOf, loadActivity } from '../progress/service';
import { isAdult, seasonBeltTier } from '../fightRecord/service';
import { fcEnabled } from './flags';
import { engageRepo, type MemberRow, type SquadRow } from './repo';

export type JoinVia = 'code' | 'link' | 'corner';

/** Squads one person may start in a rolling day (PRD §5.3). */
export const SQUAD_CREATES_PER_DAY = 5;
/** Failed code lookups per person per hour before joins are refused for the hour. */
export const SQUAD_CODE_MISSES_PER_HOUR = 10;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REF_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const HOUR_MS = 3_600_000;

function randomFrom(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(alphabet.length)]!;
  return out;
}

/** CSPRNG, never Math.random: a predictable code is a guessable one. */
const issueCode = () => `${SQUAD_CODE_PREFIX}-${randomFrom(CODE_ALPHABET, SQUAD_CODE_LENGTH)}`;
export const issueMemberRef = () => `m_${randomFrom(REF_ALPHABET, 12)}`;

const FALLBACK_NAME = 'Fight Camp member';

/**
 * Text that goes into a Telegram message the bot sends. Plain-text mode
 * stops markup, but Telegram still turns URLs and @mentions into links, so a
 * name like "evil.example/login" would arrive as a link from our bot. Only
 * letters, numbers, spaces, apostrophes and hyphens get through; anything
 * else becomes the fallback.
 */
export function telegramSafe(text: string, fallback: string): string {
  return /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '’-]*$/u.test(text) ? text : fallback;
}

/**
 * The person's first name, or null when it is not one to show. Names the
 * account never chose (the email local part registration fills in,
 * Telegram's numbered fallback) are not shown: they can identify someone
 * who never typed them.
 */
export function firstNameOf(userId: string): string | null {
  const user = getStore().byId<User>('users', userId);
  const name = user?.displayName?.trim() ?? '';
  const autoFilled = name === user?.email.split('@')[0] || /^Telegram user \d+$/.test(name);
  const first = name.split(/\s+/)[0] ?? '';
  return first && !autoFilled && !containsProfanity(first) ? first : null;
}

/** A member's first name, masked like huddle names. */
export function displayNameOf(userId: string): string {
  return firstNameOf(userId) ?? FALLBACK_NAME;
}

function fail(code: 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND', reason: string, message: string): never {
  throw new AppError(code, message, { reason });
}

function notFound(): never {
  fail('NOT_FOUND', 'squad_not_found', 'That squad code does not match a squad this season.');
}

/**
 * Adults only. An unknown age is its own reason so a new account arriving
 * by invite can be sent to add it, rather than being told it is a minor.
 */
export function requireSquadAdult(userId: string): void {
  const age = getProfile(userId)?.age;
  if (typeof age !== 'number') {
    fail('FORBIDDEN', 'squad_age_unknown', 'Add your age in your wellness essentials to join a squad.');
  }
  if (!isAdult({ age })) {
    fail('FORBIDDEN', 'squad_adult_only', 'Squads are for members aged 18 and over. Your belts stay on your own Fight Record.');
  }
}

function newMember(squad: SquadRow, userId: string, role: MemberRow['role'], at: string): MemberRow {
  return {
    squadId: squad.id,
    userId,
    memberRef: issueMemberRef(),
    seasonNumber: squad.seasonNumber,
    role,
    showStats: false,
    joinedAt: at,
    leftAt: null,
  };
}

/** The caller's live membership of `squadId`, or the 404 every outsider gets. */
export async function membershipIn(userId: string, squadId: string): Promise<MemberRow> {
  const squad = await engageRepo().squad(squadId);
  const member = squad ? await engageRepo().activeMembership(userId, squad.seasonNumber) : null;
  if (!squad || !member || member.squadId !== squadId) {
    fail('NOT_FOUND', 'squad_not_found', 'That squad was not found.');
  }
  return member;
}

/**
 * Active members who are still known adults. Anyone else is taken out of
 * the squad here, on read, so a profile edit to under 18 (or a deleted
 * profile) cannot leave someone listed in a group of adults.
 */
export async function adultMembers(squadId: string, now: Date = new Date()): Promise<MemberRow[]> {
  const members = await engageRepo().activeMembers(squadId);
  const adults: MemberRow[] = [];
  for (const member of members) {
    if (isAdult(getProfile(member.userId))) {
      adults.push(member);
    } else {
      await engageRepo().leaveSquad(squadId, member.userId, now.toISOString());
      logEvent('squad_member_auto_left', { reason: 'age' });
    }
  }
  return adults;
}

// ----- read model -----

/**
 * One audit record per viewer, squad and day is enough to show the cross-user
 * read happened; one per request would let a single user write hundreds of
 * thousands. Per process and bounded: a restart can at worst repeat a line.
 */
const auditedViews = new Set<string>();

function auditView(viewerId: string, squadId: string, today: string, others: readonly MemberRow[]): void {
  const key = `${viewerId}|${squadId}|${today}`;
  if (auditedViews.has(key)) return;
  if (auditedViews.size > 50_000) auditedViews.clear();
  auditedViews.add(key);
  auditDataAccess(viewerId, 'fightCamp.squad.viewed', {
    squadId,
    members: others.length,
    numbersShown: others.filter((m) => m.showStats).length,
  });
}

/** Who the viewer has cheered today, or nobody while cheers are off for them. */
async function cheeredBy(viewerId: string, today: string): Promise<ReadonlySet<string>> {
  if (!fcEnabled('cheers', viewerId)) return new Set();
  return new Set((await engageRepo().cheersSentOn(viewerId, today)).map((c) => c.toUserId));
}

const WEEK_MS = 7 * 86_400_000;

/**
 * Members the viewer should be offered one "just joined" cheer for: new to
 * AquaZeroFit and to this squad within the week, and never cheered by the
 * viewer. Once the viewer cheers them the prompt is gone for good.
 */
async function welcomeFor(viewerId: string, members: readonly MemberRow[], now: Date = new Date()): Promise<ReadonlySet<string>> {
  if (!fcEnabled('cheers', viewerId)) return new Set();
  const fresh = members.filter((m) => {
    if (m.userId === viewerId || now.getTime() - Date.parse(m.joinedAt) >= WEEK_MS) return false;
    const createdAt = getStore().byId<User>('users', m.userId)?.createdAt;
    return createdAt !== undefined && now.getTime() - Date.parse(createdAt) < WEEK_MS;
  });
  const out = new Set<string>();
  for (const m of fresh) if (!(await engageRepo().hasCheered(viewerId, m.userId))) out.add(m.userId);
  return out;
}

async function viewOf(squad: SquadRow, viewerId: string, today: string): Promise<SquadView> {
  const members = await adultMembers(squad.id);
  const cheered = await cheeredBy(viewerId, today);
  const welcome = await welcomeFor(viewerId, members);
  const me = members.find((m) => m.userId === viewerId);
  if (!me) notFound();
  const weekStart = weekStartOf(today);
  const others = members.filter((m) => m.userId !== viewerId);
  // One user's view reads other users' activity (their belts, and the
  // numbers of anyone who chose to show them).
  if (others.length > 0) auditView(viewerId, squad.id, today, others);
  return {
    id: squad.id,
    name: squad.name,
    seasonNumber: squad.seasonNumber,
    inviteCode: squad.inviteCode,
    inviteUrl: `${config.appPublicUrl}/s/${squad.inviteCode}`,
    tgStartParam: `sq_${squad.inviteCode}`,
    isCorner: squad.cornerHash !== null,
    weekStart,
    members: distinctNames(members.map((m) => memberView(m, viewerId, today, weekStart, cheered, welcome))),
    me: { ref: me.memberRef, showStats: me.showStats, role: me.role },
  };
}

/**
 * Several members can share the fallback name. Numbering the repeats keeps
 * each row, and each "Cheer <name>" button, telling people apart.
 */
function distinctNames(views: SquadMemberView[]): SquadMemberView[] {
  const seen = new Map<string, number>();
  return views.map((view) => {
    const n = (seen.get(view.displayName) ?? 0) + 1;
    seen.set(view.displayName, n);
    return n === 1 ? view : { ...view, displayName: `${view.displayName} ${n}` };
  });
}

function memberView(
  m: MemberRow,
  viewerId: string,
  today: string,
  weekStart: string,
  cheered: ReadonlySet<string>,
  welcome: ReadonlySet<string> = new Set(),
): SquadMemberView {
  const isMe = m.userId === viewerId;
  // One activity load per member, shared by the belt and the week count.
  const activeDates = activeDatesOf(loadActivity(m.userId));
  return {
    ref: m.memberRef,
    displayName: displayNameOf(m.userId),
    isMe,
    role: m.role,
    beltTier: seasonBeltTier(m.userId, today, activeDates),
    // Your own numbers are always yours to see; anyone else's only by choice.
    weekActiveDays: isMe || m.showStats ? squadWeekPoints(activeDates, weekStart) : null,
    cheeredToday: cheered.has(m.userId),
    welcome: welcome.has(m.userId),
  };
}

export async function currentSquad(userId: string, today: string): Promise<SquadView | null> {
  const membership = await engageRepo().activeMembership(userId, seasonFor(today).number);
  if (!membership) return null;
  const squad = await engageRepo().squad(membership.squadId);
  return squad ? viewOf(squad, userId, today) : null;
}

/** The `squads` part of GET /fight-record: just enough to link to /squad. */
export async function squadsStatus(userId: string, today: string): Promise<{ current: { id: string; name: string } | null } | null> {
  if (!isAdult(getProfile(userId))) return null;
  const membership = await engageRepo().activeMembership(userId, seasonFor(today).number);
  const squad = membership ? await engageRepo().squad(membership.squadId) : null;
  return { current: squad ? { id: squad.id, name: squad.name } : null };
}

/** A live squad of the current season for a code, or null. */
async function liveSquadByCode(code: string, today: string): Promise<SquadRow | null> {
  const squad = await engageRepo().squadByCode(code);
  return squad && squad.archivedAt === null && squad.seasonNumber === seasonFor(today).number ? squad : null;
}

export async function peekOf(squad: SquadRow): Promise<SquadPeekView> {
  const memberCount = (await adultMembers(squad.id)).length;
  return {
    name: squad.name,
    memberCount,
    seasonName: seasonByNumber(squad.seasonNumber).name,
    full: memberCount >= squad.maxMembers,
  };
}

/** The public invite preview: name, size and season, and nobody's name. */
export async function peekSquad(code: string, today: string): Promise<SquadPeekView | null> {
  const squad = await liveSquadByCode(code, today);
  return squad ? peekOf(squad) : null;
}

// ----- failed code lookups -----

const misses = new Map<string, number[]>();

function recentMisses(userId: string, now: number): number[] {
  const kept = (misses.get(userId) ?? []).filter((t) => now - t < HOUR_MS);
  if (kept.length > 0) misses.set(userId, kept);
  else misses.delete(userId);
  return kept;
}

function refuseIfGuessing(userId: string, now: Date): void {
  const recent = recentMisses(userId, now.getTime());
  if (recent.length >= SQUAD_CODE_MISSES_PER_HOUR) {
    throw new AppError('RATE_LIMITED', 'Too many codes that did not match. Try again in an hour.', {
      reason: 'squad_code_attempts',
      retryAfterSeconds: Math.max(1, Math.ceil((recent[0]! + HOUR_MS - now.getTime()) / 1000)),
    });
  }
}

function recordMiss(userId: string, now: Date): void {
  misses.set(userId, [...recentMisses(userId, now.getTime()), now.getTime()]);
}

/** Test-only: forget recorded misses. */
export function clearSquadCodeMissesForTests(): void {
  if (!config.isTest) throw new Error('clearSquadCodeMissesForTests is only available under test');
  misses.clear();
}

// ----- writes -----

function recordConsent(userId: string, squadId: string): void {
  auditDataAccess(userId, 'fightCamp.squad.consent', { squadId, consentTextVersion: SQUAD_CONSENT_VERSION });
}

async function requireNoSquad(userId: string, today: string): Promise<void> {
  if (await engageRepo().activeMembership(userId, seasonFor(today).number)) {
    fail('CONFLICT', 'squad_already_member', 'You are already in a squad this season.');
  }
}

export async function createSquad(
  userId: string,
  name: string,
  today: string,
  now: Date = new Date(),
  opts: { cornerHash?: string } = {},
): Promise<SquadView> {
  requireSquadAdult(userId);
  const repo = engageRepo();
  const since = new Date(now.getTime() - 24 * HOUR_MS).toISOString();
  if ((await repo.squadsCreatedSince(userId, since)) >= SQUAD_CREATES_PER_DAY) {
    throw new AppError('RATE_LIMITED', 'You have started five squads in the last day. Try again later.', {
      reason: 'squad_create_limit',
      retryAfterSeconds: 3600,
    });
  }
  const at = now.toISOString();
  const seasonNumber = seasonFor(today).number;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const squad: SquadRow = {
      id: newId('sqd'),
      seasonNumber,
      name,
      inviteCode: issueCode(),
      cornerHash: opts.cornerHash ?? null,
      maxMembers: SQUAD_MAX_MEMBERS,
      createdBy: userId,
      createdAt: at,
      archivedAt: null,
    };
    const outcome = await repo.createSquad(squad, newMember(squad, userId, 'owner', at));
    if (outcome.ok) {
      recordConsent(userId, squad.id);
      logEvent('squad_created', { season: seasonNumber, size_after: 1, via: opts.cornerHash ? 'corner' : 'code' });
      return viewOf(squad, userId, today);
    }
    if (outcome.reason === 'already_member') {
      fail('CONFLICT', 'squad_already_member', 'You are already in a squad this season.');
    }
    if (outcome.reason === 'corner_taken') {
      fail('CONFLICT', 'squad_corner_taken', 'This group already has a Squad Corner this season.');
    }
    // code_taken: a vanishingly rare collision. Draw again.
  }
  throw new AppError('INTERNAL', 'Could not issue a squad code. Try again.');
}

export async function joinSquad(
  userId: string,
  squad: SquadRow,
  today: string,
  via: JoinVia,
  now: Date = new Date(),
): Promise<SquadView> {
  requireSquadAdult(userId);
  if (squad.seasonNumber !== seasonFor(today).number) notFound();
  // Departed minors free their places before capacity is judged.
  await adultMembers(squad.id, now);
  const outcome = await engageRepo().joinSquad(squad.id, newMember(squad, userId, 'member', now.toISOString()));
  if (!outcome.ok) {
    switch (outcome.reason) {
      case 'full':
        fail('CONFLICT', 'squad_full', 'That squad is full. Squads have room for five.');
      case 'already_member':
        fail('CONFLICT', 'squad_already_member', 'You are already in a squad this season.');
      case 'removed':
        fail('FORBIDDEN', 'squad_removed', 'You were taken out of this squad, so you cannot rejoin it this season.');
      default:
        notFound();
    }
  }
  recordConsent(userId, squad.id);
  const size = (await engageRepo().activeMembers(squad.id)).length;
  logEvent('squad_joined', { season: squad.seasonNumber, size_after: size, via });
  return viewOf(squad, userId, today);
}

/**
 * Join by invite code. Membership is checked before the code is looked up,
 * so someone already in a squad learns nothing about whether a code is live,
 * and every code that matches nothing counts toward the hourly lockout.
 */
export async function joinSquadByCode(
  userId: string,
  code: string,
  today: string,
  via: JoinVia,
  now: Date = new Date(),
): Promise<SquadView> {
  requireSquadAdult(userId);
  await requireNoSquad(userId, today);
  refuseIfGuessing(userId, now);
  const squad = await liveSquadByCode(code, today);
  if (!squad) {
    recordMiss(userId, now);
    notFound();
  }
  return joinSquad(userId, squad, today, via, now);
}

export async function leaveSquad(userId: string, squadId: string, now: Date = new Date()): Promise<void> {
  const member = await membershipIn(userId, squadId);
  await engageRepo().leaveSquad(squadId, userId, now.toISOString());
  const size = (await engageRepo().activeMembers(squadId)).length;
  logEvent('squad_left', { season: member.seasonNumber, size_after: size });
}

async function requireOwner(userId: string, squadId: string): Promise<MemberRow> {
  const member = await membershipIn(userId, squadId);
  if (member.role !== 'owner') {
    fail('FORBIDDEN', 'squad_owner_only', 'Only the person who runs the squad can do that.');
  }
  return member;
}

/** Owner only: a new invite code. Every link with the old one stops working. */
export async function rotateInviteCode(userId: string, squadId: string, today: string): Promise<SquadView> {
  await requireOwner(userId, squadId);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if ((await engageRepo().setInviteCode(squadId, issueCode())) === 'ok') {
      auditDataAccess(userId, 'fightCamp.squad.codeRotated', { squadId });
      const squad = await engageRepo().squad(squadId);
      return viewOf(squad!, userId, today);
    }
  }
  throw new AppError('INTERNAL', 'Could not issue a squad code. Try again.');
}

/** Owner only: take a member out of the squad. They can still join another. */
export async function removeMember(userId: string, squadId: string, memberRef: string, now: Date = new Date()): Promise<void> {
  await requireOwner(userId, squadId);
  const target = await engageRepo().activeMemberByRef(squadId, memberRef);
  if (!target || target.userId === userId) {
    fail('NOT_FOUND', 'squad_member_not_found', 'That member is not in this squad.');
  }
  await engageRepo().leaveSquad(squadId, target.userId, now.toISOString(), { removed: true });
  auditDataAccess(userId, 'fightCamp.squad.memberRemoved', { squadId });
  logEvent('squad_member_removed', { season: target.seasonNumber });
}

/**
 * A caller who is no longer a known adult is taken out of their squad when
 * they next ask for it, so they are not left listed somewhere they cannot
 * reach to leave.
 */
export async function leaveIfNoLongerAdult(userId: string, today: string): Promise<void> {
  if (isAdult(getProfile(userId))) return;
  const membership = await engageRepo().activeMembership(userId, seasonFor(today).number);
  if (membership) {
    await engageRepo().leaveSquad(membership.squadId, userId, new Date().toISOString());
    logEvent('squad_member_auto_left', { reason: 'age' });
  }
}

export async function setShowStats(
  userId: string,
  squadId: string,
  showStats: boolean,
  today: string,
): Promise<SquadMemberView> {
  await membershipIn(userId, squadId);
  const updated = await engageRepo().setShowStats(squadId, userId, showStats);
  if (!updated) fail('NOT_FOUND', 'squad_not_found', 'That squad was not found.');
  auditDataAccess(userId, 'fightCamp.squad.showStats', { squadId, on: showStats });
  logEvent('squad_stats_toggled', { on: showStats });
  return memberView(updated, userId, today, weekStartOf(today), await cheeredBy(userId, today));
}
