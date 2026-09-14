/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

// ---------- growth: buddy challenges + share telemetry ----------

export const BUDDY_CHALLENGE_KINDS = ['logging_streak', 'workouts', 'meal_logs'] as const;
export type BuddyChallengeKind = (typeof BUDDY_CHALLENGE_KINDS)[number];

export const BUDDY_CHALLENGE_STATUSES = ['open', 'active', 'completed', 'expired'] as const;
export type BuddyChallengeStatus = (typeof BUDDY_CHALLENGE_STATUSES)[number];

export interface BuddyChallengeMember {
  userId: string;
  displayName: string;
  joinedAt: string;
  /** Distinct qualifying local dates counted toward the challenge target. */
  progressDays: number;
}

export interface BuddyChallenge {
  type: 'buddyChallenge';
  id: string;
  code: string;
  kind: BuddyChallengeKind;
  /** Days of qualifying activity required to win. */
  targetDays: number;
  /** Calendar length of the challenge window. */
  durationDays: number;
  status: BuddyChallengeStatus;
  createdBy: string;
  members: BuddyChallengeMember[];
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
}
