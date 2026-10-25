/**
 * Fight Camp (AZF-P1): the social layer over Fight Record's seasons and belts.
 *
 * Fight Record's rule holds here too, and so does its method of enforcing it:
 *
 *   **Everything social in Fight Camp counts showing up, never an outcome.**
 *
 * Squad points, Cut Man grace and recap totals all take active local dates and
 * nothing else, so no weight, calorie or body figure has a parameter to arrive
 * through. A bridged (Cut Man) day is a separate set that only the consistency
 * run reads; it is never an active day, so it can never raise a belt, a squad
 * point or a recap total.
 *
 * Pure and dependency-free apart from zod, like `fightRecord.ts`, so the API
 * and the web client compute the same week, the same bank and the same theme.
 */
import { z } from 'zod';

// ---------- vocabulary ----------

export const CHEER_KINDS = ['glove', 'fire', 'muscle', 'clap', 'water'] as const;
export type CheerKind = (typeof CHEER_KINDS)[number];

export const CHEER_EMOJI: Record<CheerKind, string> = {
  glove: '🥊',
  fire: '🔥',
  muscle: '💪',
  clap: '👏',
  water: '💧',
};

export const SHARE_KINDS_P1 = ['belt', 'season', 'recap', 'squad_invite', 'week'] as const;
export type ShareKindP1 = (typeof SHARE_KINDS_P1)[number];

export const ENROL_SOURCES = ['dashboard', 'recap', 'squad', 'deeplink'] as const;
export type EnrolSource = (typeof ENROL_SOURCES)[number];

export const SQUAD_MAX_MEMBERS = 5;
export const SQUAD_CODE_PREFIX = 'SQD';
export const GRACE_EARN_EVERY_ACTIVE_DAYS = 7;
export const GRACE_BANK_MAX = 2;
/** A banked Cut Man day only bridges a gap inside this many trailing days. */
export const GRACE_BRIDGE_WINDOW_DAYS = 7;
/** Enrolment is the primary card action for this many days of a season. */
export const FRESH_START_WINDOW_DAYS = 14;
/** A season's recap is offered for this many days after it ends. */
export const RECAP_WINDOW_DAYS = 14;
/** Telegram's caption limit for users without Telegram Premium. */
export const STORY_CAPTION_MAX_CHARS = 200;

// ---------- request schemas ----------

/** Same alphabet as huddle codes: no 0/O or 1/I, so a code read aloud survives. */
export const squadCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^SQD-[A-HJ-NP-Z2-9]{6}$/);
export const memberRefSchema = z.string().regex(/^m_[A-Za-z0-9]{12}$/);
export const shareCodeSchema = z.string().regex(/^[A-Za-z0-9]{8}$/);

export const enrolInputSchema = z.object({
  source: z.enum(ENROL_SOURCES).default('dashboard'),
});
export type EnrolInput = z.infer<typeof enrolInputSchema>;

// ---------- copy ----------

/**
 * Words no Fight Camp surface may use (PRD §6.1, W3-05 §2.7). Stems rather
 * than whole words, so "streaks", "resetting" and "failed" fail too. Both the
 * API messages and every rendered Phase 1 string are scanned with it.
 */
export const BANNED_COPY =
  /\b(streak\w*|lost|los(e|es|ing)|reset\w*|fail\w*|broke\w*|break\w*|missed out|last place|lazy|hurr\w*|last chance|expir\w*)\b/i;

// ---------- seasons ----------

/**
 * One accent per season, keyed by `seasonNumber % 6` (US-A2). Used for bands,
 * borders and glyphs only, never as a text colour, so no accent has to clear
 * a contrast bar against both themes. The id names the static story art.
 */
export const SEASON_ACCENTS = [
  { id: 'gold', colour: '#c9a227' },
  { id: 'red', colour: '#d1495b' },
  { id: 'teal', colour: '#2a9d8f' },
  { id: 'blue', colour: '#3d7bd9' },
  { id: 'amber', colour: '#e08e2b' },
  { id: 'violet', colour: '#8b5cf6' },
] as const;
export type SeasonAccentId = (typeof SEASON_ACCENTS)[number]['id'];

/** The season's coach line, same index as the accent. Effort, never outcome. */
const SEASON_COACH_LINES = [
  'Title run. Same work, every day you can.',
  'Camp is open. Show up, then show up again.',
  'Ground game is patience. One honest day at a time.',
  'Second wind finds the people who keep moving.',
  'Ring craft is built in quiet rounds. Keep yours.',
  'The long game rewards the ones who come back.',
] as const;

export interface SeasonTheme {
  accentId: SeasonAccentId;
  accent: string;
  coachLine: string;
}

export function seasonTheme(seasonNumber: number): SeasonTheme {
  const index = ((Math.floor(seasonNumber) % 6) + 6) % 6;
  const accent = SEASON_ACCENTS[index]!;
  return { accentId: accent.id, accent: accent.colour, coachLine: SEASON_COACH_LINES[index]! };
}

/**
 * Where the "Join Fight Camp" prompt sits: the card's one primary action in
 * a season's fresh-start window, a quiet link after it (US-A1 AC4).
 */
export type EnrolPrompt = 'primary' | 'secondary';

// ---------- Cut Man grace ----------

/** Cut Man days a season's active days have earned: one per seven. */
export function graceEarned(activeDaysInSeason: number): number {
  return Math.floor(Math.max(0, activeDaysInSeason) / GRACE_EARN_EVERY_ACTIVE_DAYS);
}

/** Active days still to log this season before the next Cut Man day, 1 to 7. */
export function nextGraceInActiveDays(activeDaysInSeason: number): number {
  return GRACE_EARN_EVERY_ACTIVE_DAYS - (Math.max(0, activeDaysInSeason) % GRACE_EARN_EVERY_ACTIVE_DAYS);
}

/**
 * The bank, folded over the ledger in the order it was written. The cap
 * applies at each earn, so a day earned with two already banked is simply
 * not kept: `min(2, earned - applied)` would instead let a long run bank
 * days invisibly and spend them later, which is a store of value, not a cap.
 */
export function graceBank(entries: Iterable<{ entry: 'earned' | 'applied' }>): number {
  let bank = 0;
  for (const { entry } of entries) {
    bank = entry === 'earned' ? Math.min(GRACE_BANK_MAX, bank + 1) : Math.max(0, bank - 1);
  }
  return bank;
}

// ---------- responses ----------

export interface GraceView {
  /** Cut Man days in the bank now, 0 to GRACE_BANK_MAX. */
  banked: number;
  /** Active days this season until the next one is earned, 1 to 7. */
  nextEarnInActiveDays: number;
  /** The most recent day Cut Man stepped in, or null. */
  lastApplied: string | null;
}

export interface EnrolmentView {
  seasonNumber: number;
  seasonName: string;
  source: EnrolSource;
  enrolledAt: string;
}

/**
 * Additive block beside `fightRecord` on GET /fight-record. Absent unless at
 * least one Fight Camp feature is on for the caller; each part is null while
 * its own feature is off, so a client renders exactly the parts that exist.
 */
export interface FightCampStatus {
  theme: SeasonTheme;
  /** FC_ENROL. */
  enrolment: { enrolled: boolean; prompt: EnrolPrompt } | null;
  /** FC_GRACE. */
  grace: GraceView | null;
}
