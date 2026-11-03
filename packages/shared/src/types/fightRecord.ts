/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

// ---------- Fight Record: seasons + Consistency Belts (AZF-W3-05) ----------

/**
 * Ascending. The order is load-bearing: tier comparisons are index
 * comparisons, so a new tier can only ever be appended at the top.
 */
export const BELT_TIERS = ['white', 'blue', 'purple', 'brown', 'black'] as const;
export type BeltTier = (typeof BELT_TIERS)[number];

/** One step of the ladder: the active days in a season that earn `tier`. */
export interface BeltRung {
  tier: BeltTier;
  activeDays: number;
}

/** A calendar span of SEASON_LENGTH_DAYS local dates, inclusive at both ends. */
export interface Season {
  id: string;
  /** 1-based. Season 1 begins on SEASON_ONE_STARTS_ON. */
  number: number;
  name: string;
  startsOn: string;
  endsOn: string;
}

/**
 * An awarded belt as the client sees it. The stored award also carries the
 * user id; that never leaves the API.
 */
export interface BeltAwardView {
  id: string;
  seasonNumber: number;
  seasonName: string;
  tier: BeltTier;
  awardedAt: string;
}

export interface FightRecordSeasonProgress {
  season: Season;
  /** Distinct active local dates inside the season, up to today. */
  activeDays: number;
  /** Days remaining including today. Information, never a countdown. */
  daysLeft: number;
  /** Highest belt held this season, or null before the first rung. */
  tier: BeltTier | null;
  /** The next rung, or null once black is held. */
  next: BeltRung | null;
}

export interface EmojiStatusSetting {
  /**
   * Whether this user can turn the status on at all: an adult with a linked
   * Telegram account, on a deployment with the belt emoji set configured.
   */
  available: boolean;
  enabled: boolean;
}

/** GET /fight-record → { fightRecord: FightRecordStatus | null }. */
export interface FightRecordStatus {
  current: FightRecordSeasonProgress;
  ladder: readonly BeltRung[];
  /** Highest belt from every season that has one, newest season first. */
  belts: BeltAwardView[];
  /** The belt to celebrate now, if one has not been shown yet. */
  celebrate: BeltAwardView | null;
  /** Gates the public surfaces (story share, emoji status) on every client. */
  adult: boolean;
  emojiStatus: EmojiStatusSetting;
}
