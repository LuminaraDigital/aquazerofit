/**
 * Squads (AZF-P1 Epic C): private groups of up to five, one per person per
 * season, adults only.
 *
 * Privacy is the shape of the read model rather than a filter applied to it:
 *
 *  - members are addressed by an opaque `member_ref`, never a user id, and
 *    every member-scoped action first proves the caller is an active member
 *    of the squad named in the path (the IDOR tests cover each route);
 *  - a member's belt is visible to the squad (they agreed to that at join),
 *    their weekly active days only if they turned "show my numbers" on;
 *  - the weekly board counts active days and nothing else, one per day.
 *
 * Integrity rules (capacity, one squad a season, ownership passing on) are
 * enforced atomically in the repository; this file turns its outcomes into
 * the API's errors.
 */
import { randomInt } from 'node:crypto';
import {
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
import { engageRepo, type MemberRow, type SquadRow } from './repo';

export type JoinVia = 'code' | 'link' | 'corner';

/** Squads one person may start in a rolling day (PRD §5.3). */
export const SQUAD_CREATES_PER_DAY = 5;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REF_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomFrom(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(alphabet.length)]!;
  return out;
}

/**
 * Invite codes are bearer capabilities, like huddle codes: whoever holds one
 * can join. CSPRNG, never Math.random.
 */
const issueCode = () => `${SQUAD_CODE_PREFIX}-${randomFrom(CODE_ALPHABET, 6)}`;
export const issueMemberRef = () => `m_${randomFrom(REF_ALPHABET, 12)}`;

/** Masked like huddle names: a stored name that fails the filter is never shown. */
function displayNameOf(userId: string): string {
  const name = getStore().byId<User>('users', userId)?.displayName?.trim();
  return name && !containsProfanity(name) ? name : 'Fight Camp member';
}

function fail(code: 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND', reason: string, message: string): never {
  throw new AppError(code, message, { reason });
}

export function requireSquadAdult(userId: string): void {
  if (!isAdult(getProfile(userId))) {
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

// ----- read model -----

async function viewOf(squad: SquadRow, viewerId: string, today: string): Promise<SquadView> {
  const members = await engageRepo().activeMembers(squad.id);
  const me = members.find((m) => m.userId === viewerId)!;
  const weekStart = weekStartOf(today);
  const others = members.filter((m) => m.userId !== viewerId);
  if (others.length > 0) {
    // One user's view reads other users' activity (their belts, and the
    // numbers of anyone who chose to show them). The trail records that it
    // happened and how much, not what was seen.
    auditDataAccess(viewerId, 'fightCamp.squad.viewed', {
      squadId: squad.id,
      members: others.length,
      numbersShown: others.filter((m) => m.showStats).length,
    });
  }
  return {
    id: squad.id,
    name: squad.name,
    seasonNumber: squad.seasonNumber,
    inviteCode: squad.inviteCode,
    inviteUrl: `${config.appPublicUrl}/s/${squad.inviteCode}`,
    tgStartParam: `sq_${squad.inviteCode}`,
    isCorner: squad.cornerHash !== null,
    weekStart,
    members: members.map((m) => memberView(m, viewerId, today, weekStart)),
    me: { ref: me.memberRef, showStats: me.showStats },
  };
}

function memberView(m: MemberRow, viewerId: string, today: string, weekStart: string): SquadMemberView {
  const isMe = m.userId === viewerId;
  return {
    ref: m.memberRef,
    displayName: displayNameOf(m.userId),
    isMe,
    role: m.role,
    beltTier: seasonBeltTier(m.userId, today),
    // Your own numbers are always yours to see; anyone else's only by choice.
    weekActiveDays:
      isMe || m.showStats ? squadWeekPoints(activeDatesOf(loadActivity(m.userId)), weekStart) : null,
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

/** The public invite preview: name, size and season, and nobody's name. */
export async function peekSquad(code: string, today: string): Promise<SquadPeekView | null> {
  const squad = await liveSquadByCode(code, today);
  if (!squad) return null;
  const memberCount = (await engageRepo().activeMembers(squad.id)).length;
  return {
    name: squad.name,
    memberCount,
    seasonName: seasonByNumber(squad.seasonNumber).name,
    full: memberCount >= squad.maxMembers,
  };
}

// ----- writes -----

function recordConsent(userId: string, squadId: string): void {
  auditDataAccess(userId, 'fightCamp.squad.consent', { squadId, consentTextVersion: SQUAD_CONSENT_VERSION });
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
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  if ((await repo.squadsCreatedSince(userId, since)) >= SQUAD_CREATES_PER_DAY) {
    throw new AppError('RATE_LIMITED', 'You have started a few squads today. Try again tomorrow.', {
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
    // code_taken: a 1-in-a-billion collision. Draw again.
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
  if (squad.seasonNumber !== seasonFor(today).number) {
    fail('NOT_FOUND', 'squad_not_found', 'That squad code does not match a squad this season.');
  }
  const outcome = await engageRepo().joinSquad(squad.id, newMember(squad, userId, 'member', now.toISOString()));
  if (!outcome.ok) {
    switch (outcome.reason) {
      case 'full':
        fail('CONFLICT', 'squad_full', 'That squad is full. Squads have room for five.');
      case 'already_member':
        fail('CONFLICT', 'squad_already_member', 'You are already in a squad this season.');
      default:
        fail('NOT_FOUND', 'squad_not_found', 'That squad code does not match a squad this season.');
    }
  }
  recordConsent(userId, squad.id);
  const size = (await engageRepo().activeMembers(squad.id)).length;
  logEvent('squad_joined', { season: squad.seasonNumber, size_after: size, via });
  return viewOf(squad, userId, today);
}

export async function joinSquadByCode(userId: string, code: string, today: string, via: JoinVia): Promise<SquadView> {
  requireSquadAdult(userId);
  const squad = await liveSquadByCode(code, today);
  if (!squad) fail('NOT_FOUND', 'squad_not_found', 'That squad code does not match a squad this season.');
  return joinSquad(userId, squad, today, via);
}

export async function leaveSquad(userId: string, squadId: string, now: Date = new Date()): Promise<void> {
  const member = await membershipIn(userId, squadId);
  await engageRepo().leaveSquad(squadId, userId, now.toISOString());
  const size = (await engageRepo().activeMembers(squadId)).length;
  logEvent('squad_left', { season: member.seasonNumber, size_after: size });
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
  return memberView(updated, userId, today, weekStartOf(today));
}
