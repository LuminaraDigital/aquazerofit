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
