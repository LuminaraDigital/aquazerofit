/**
 * Buddy challenges: private accountability huddles (not a public social feed).
 * Progress is recomputed from meal logs / workout sessions on read so the
 * ledger stays the source of truth (AQF: code calculates).
 */
import { randomInt } from 'node:crypto';
import {
  BUDDY_CHALLENGE_CODE_PREFIX,
  BUDDY_CHALLENGE_MAX_MEMBERS,
  type BuddyChallenge,
  type BuddyChallengeKind,
  type BuddyChallengeMember,
  type CreateBuddyChallengeInput,
  type User,
  type WorkoutSession,
} from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { getStore, newId } from '../../platform/store';
import { mealLogsForDate } from '../logs/service';

function todayIsoDate(): string {
  return new Date().toLocaleDateString('en-CA');
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

function datesInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function displayNameFor(userId: string): string {
  const user = getStore().byId<User>('users', userId);
  return user?.displayName?.trim() || 'Aqua buddy';
}

/**
 * An invite code is a bearer capability: whoever holds it can join the huddle
 * and see the other members' names and progress. It is therefore drawn from a
 * CSPRNG, not Math.random() — a predictable code is a guessable one.
 */
function issueCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[randomInt(alphabet.length)]!;
  }
  return `${BUDDY_CHALLENGE_CODE_PREFIX}-${suffix}`;
}

function findByCode(code: string): BuddyChallenge | undefined {
  const normalised = code.trim().toUpperCase();
  return getStore()
    .where<BuddyChallenge>('logs', (d) => d.type === 'buddyChallenge' && d.code === normalised)
    .at(0);
}

function dayQualifies(userId: string, localDate: string, kind: BuddyChallengeKind): boolean {
  if (kind === 'meal_logs' || kind === 'logging_streak') {
    if (mealLogsForDate(userId, localDate).length > 0) return true;
  }
  if (kind === 'workouts' || kind === 'logging_streak') {
    const workouts = getStore().where<WorkoutSession>(
      'plans',
      (d) =>
        d.type === 'workoutSession' &&
        d.userId === userId &&
        d.localDate === localDate &&
        d.status === 'completed',
    );
    if (workouts.length > 0) return true;
  }
  if (kind === 'logging_streak') {
    // Water or weight also counts as "showing up" for streak challenges.
    const water = getStore().where(
      'logs',
      (d) =>
        (d as { type?: string; userId?: string; localDate?: string }).type === 'waterLog' &&
        (d as { userId?: string }).userId === userId &&
        (d as { localDate?: string }).localDate === localDate,
    );
    if (water.length > 0) return true;
  }
  return false;
}

function countProgress(userId: string, challenge: BuddyChallenge): number {
  const windowEnd = challenge.endsAt < todayIsoDate() ? challenge.endsAt : todayIsoDate();
  if (windowEnd < challenge.startsAt) return 0;
  let n = 0;
  for (const day of datesInclusive(challenge.startsAt, windowEnd)) {
    if (dayQualifies(userId, day, challenge.kind)) n += 1;
  }
  return n;
}

/**
 * Status from the dates, the member count and progress already known — no
 * ledger recomputation, so this is safe on unauthenticated paths.
 */
function deriveStatus(
  challenge: BuddyChallenge,
  members: BuddyChallengeMember[],
): BuddyChallenge['status'] {
  if (todayIsoDate() > challenge.endsAt) return 'expired';
  if (members.some((m) => m.progressDays >= challenge.targetDays)) return 'completed';
  return members.length >= 2 ? 'active' : 'open';
}

/**
 * Recompute every member's progress from the ledger and re-derive status.
 * `updatedAt` moves only when something material actually changed: the store
 * write-through marks a document dirty on every upsert, so stamping a new
 * timestamp on each read would turn every list request into a write of every
 * huddle the caller belongs to. Returns the input object unchanged when there
 * is nothing to persist, which callers use as the "no write needed" signal.
 */
function refreshStatus(challenge: BuddyChallenge): BuddyChallenge {
  const members: BuddyChallengeMember[] = challenge.members.map((m) => ({
    ...m,
    progressDays: countProgress(m.userId, challenge),
  }));
  const status = deriveStatus(challenge, members);
  const changed =
    status !== challenge.status ||
    members.some((m, i) => m.progressDays !== challenge.members[i]?.progressDays);

  if (!changed) return challenge;
  return { ...challenge, status, members, updatedAt: new Date().toISOString() };
}

export function listChallengesForUser(userId: string): BuddyChallenge[] {
  return getStore()
    .where<BuddyChallenge>(
      'logs',
      (d) => d.type === 'buddyChallenge' && d.members.some((m) => m.userId === userId),
    )
    .map((c) => {
      const refreshed = refreshStatus(c);
      if (refreshed !== c) getStore().upsert('logs', refreshed);
      return refreshed;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getChallenge(id: string, userId: string): BuddyChallenge {
  const raw = getStore().byId<BuddyChallenge>('logs', id);
  if (!raw || raw.type !== 'buddyChallenge') {
    throw new AppError('NOT_FOUND', 'Challenge not found');
  }
  if (!raw.members.some((m: BuddyChallengeMember) => m.userId === userId)) {
    throw new AppError('FORBIDDEN', 'You are not a member of this challenge');
  }
  const refreshed = refreshStatus(raw);
  if (refreshed !== raw) getStore().upsert('logs', refreshed);
  return refreshed;
}

export function createChallenge(userId: string, input: CreateBuddyChallengeInput): BuddyChallenge {
  const startsAt = todayIsoDate();
  const endsAt = addDays(startsAt, input.durationDays - 1);
  let code = issueCode();
  // Extremely unlikely collision; retry a few times.
  for (let i = 0; i < 5 && findByCode(code); i++) code = issueCode();

  const now = new Date().toISOString();
  const challenge: BuddyChallenge = {
    type: 'buddyChallenge',
    id: newId('chal'),
    code,
    kind: input.kind,
    targetDays: input.targetDays,
    durationDays: input.durationDays,
    status: 'open',
    createdBy: userId,
    members: [
      {
        userId,
        displayName: displayNameFor(userId),
        joinedAt: now,
        progressDays: 0,
      },
    ],
    startsAt,
    endsAt,
    createdAt: now,
    updatedAt: now,
  };
  const refreshed = refreshStatus(challenge);
  getStore().upsert('logs', refreshed);
  return refreshed;
}

export function joinChallenge(userId: string, code: string): BuddyChallenge {
  const existing = findByCode(code);
  if (!existing) throw new AppError('NOT_FOUND', 'No challenge matches that code');
  if (existing.endsAt < todayIsoDate()) {
    throw new AppError('VALIDATION_FAILED', 'This challenge has ended');
  }
  if (existing.members.some((m) => m.userId === userId)) {
    return refreshStatus(existing);
  }
  if (existing.members.length >= BUDDY_CHALLENGE_MAX_MEMBERS) {
    throw new AppError('VALIDATION_FAILED', 'This huddle is full');
  }
  const now = new Date().toISOString();
  const next: BuddyChallenge = {
    ...existing,
    members: [
      ...existing.members,
      {
        userId,
        displayName: displayNameFor(userId),
        joinedAt: now,
        progressDays: 0,
      },
    ],
    updatedAt: now,
  };
  const refreshed = refreshStatus(next);
  getStore().upsert('logs', refreshed);
  return refreshed;
}

/**
 * Public invite peek (no auth) for join UX.
 *
 * Deliberately does NOT recompute progress: that walks every day of the
 * challenge window for every member, and each day costs a full scan of the
 * logs container. On an unauthenticated route that is a ~1000x amplifier per
 * request. The teaser needs a member count and a status, both of which come
 * from the stored document. Progress is refreshed on the authenticated reads.
 */
export function peekChallenge(code: string): {
  code: string;
  kind: BuddyChallengeKind;
  targetDays: number;
  durationDays: number;
  memberCount: number;
  endsAt: string;
  status: BuddyChallenge['status'];
} {
  const existing = findByCode(code);
  if (!existing) throw new AppError('NOT_FOUND', 'No challenge matches that code');
  return {
    code: existing.code,
    kind: existing.kind,
    targetDays: existing.targetDays,
    durationDays: existing.durationDays,
    memberCount: existing.members.length,
    endsAt: existing.endsAt,
    status: deriveStatus(existing, existing.members),
  };
}

export function toPublicMemberNames(challenge: BuddyChallenge): BuddyChallenge {
  // Refresh display names from current user docs.
  return {
    ...challenge,
    members: challenge.members.map((m) => ({
      ...m,
      displayName: displayNameFor(m.userId),
    })),
  };
}

/**
 * Account-erasure hook, called from purgeUser.
 *
 * A challenge document has no top-level `userId` — the membership lives in
 * `members[].userId` and `createdBy` — so the generic user-scoped sweep in
 * me/service cannot see it. Without this, a deleted account's id and the
 * display name captured at join time would survive in every huddle they were
 * ever in, and they would keep occupying a slot against the member cap.
 *
 * The purged user leaves every huddle. A huddle with no members left is
 * deleted outright; one that still has members outlives its creator, so
 * ownership passes to the longest-standing survivor rather than dangling.
 * Returns the number of huddles touched (for the purge audit line).
 */
export function removeUserFromChallenges(userId: string): number {
  const store = getStore();
  const affected = store.where<BuddyChallenge>(
    'logs',
    (d) =>
      d.type === 'buddyChallenge' &&
      (d.createdBy === userId || d.members.some((m) => m.userId === userId)),
  );

  for (const challenge of affected) {
    const members = challenge.members.filter((m) => m.userId !== userId);
    if (members.length === 0) {
      store.deleteWhere<BuddyChallenge>('logs', (d) => d.id === challenge.id);
      continue;
    }
    store.upsert('logs', {
      ...challenge,
      members,
      createdBy: challenge.createdBy === userId ? members[0]!.userId : challenge.createdBy,
      status: deriveStatus(challenge, members),
      updatedAt: new Date().toISOString(),
    });
  }
  return affected.length;
}

export function inviteRefForUser(userId: string): string {
  // Short stable invite token derived from id (not secret; for attribution only).
  return userId.replace(/-/g, '').slice(0, 10);
}
