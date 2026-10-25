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
import { TG_INIT_DATA_MAX_BYTES } from './constants';
import { containsProfanity, PROFANITY_MESSAGE } from './profanity';
import type { BeltTier } from './types/fightRecord';

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
/**
 * Characters after the prefix. An invite code is a bearer capability, so it
 * is long enough (32^10, about 10^15) that guessing a live one is not a
 * plan, even before the rate limits and the lockout.
 */
export const SQUAD_CODE_LENGTH = 10;
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
  .regex(/^SQD-[A-HJ-NP-Z2-9]{10}$/);
export const memberRefSchema = z.string().regex(/^m_[A-Za-z0-9]{12}$/);
export const shareCodeSchema = z.string().regex(/^[A-Za-z0-9]{8}$/);

export const enrolInputSchema = z.object({
  source: z.enum(ENROL_SOURCES).default('dashboard'),
});
export type EnrolInput = z.infer<typeof enrolInputSchema>;

/**
 * The words a person agrees to before their belt becomes visible to a
 * squad (PRD §8.4). Versioned so the audit trail says which wording each
 * join was agreed under; reword it and the version must move.
 */
export const SQUAD_CONSENT_TEXT =
  'Your squad will see your first name and your belt. Your daily numbers stay hidden unless you turn them on.';
export const SQUAD_CONSENT_VERSION = 'squad-consent-v1';

export const squadNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .refine((v) => !containsProfanity(v), { message: PROFANITY_MESSAGE });

/** `consent: true` is the server-side record of the sheet above, not a UI nicety. */
export const createSquadInputSchema = z.object({
  name: squadNameSchema,
  consent: z.literal(true),
});
export type CreateSquadInput = z.infer<typeof createSquadInputSchema>;

export const joinSquadInputSchema = z.object({
  code: squadCodeSchema,
  consent: z.literal(true),
});
export type JoinSquadInput = z.infer<typeof joinSquadInputSchema>;

export const updateMySquadSettingsSchema = z.object({ showStats: z.boolean() });

/**
 * Squad Corner (US-C3): the Mini App was opened from a Telegram group. The
 * raw initData is sent so the server can check its signature and read the
 * group's `chat_instance` itself; nothing the client claims about the group
 * is trusted.
 */
const tgInitData = z.string().min(1).max(TG_INIT_DATA_MAX_BYTES);
export const squadCornerInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('peek'), tgInitData }),
  z.object({ action: z.literal('create'), tgInitData, name: squadNameSchema, consent: z.literal(true) }),
  z.object({ action: z.literal('join'), tgInitData, consent: z.literal(true) }),
]);
export type SquadCornerInput = z.infer<typeof squadCornerInputSchema>;

/** One tap, one of five fixed cheers. There is no free text to moderate. */
export const sendCheerInputSchema = z.object({
  to: memberRefSchema,
  cheer: z.enum(CHEER_KINDS),
});
export type SendCheerInput = z.infer<typeof sendCheerInputSchema>;

export const CHEERS_SEEN_MAX_IDS = 50;
export const cheersSeenInputSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).max(CHEERS_SEEN_MAX_IDS),
});

/** Bot message kinds a person can switch off one by one (US-D3 AC2). */
export const NUDGE_KINDS = ['cheer'] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];
export const nudgeSettingsInputSchema = z.object({ cheer: z.boolean() });
export type NudgeSettings = z.infer<typeof nudgeSettingsInputSchema>;

export const createShareLinkInputSchema = z.object({ kind: z.enum(SHARE_KINDS_P1) });

export const SURFACES = ['web', 'tma'] as const;
export const shareAttributionInputSchema = z.object({
  code: shareCodeSchema,
  surface: z.enum(SURFACES),
});

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

// ---------- squads ----------

const DAY_MS = 86_400_000;

/** The Monday of the ISO week containing `localDate` (weeks run Monday to Sunday). */
export function weekStartOf(localDate: string): string {
  const day = Date.parse(`${localDate}T00:00:00Z`);
  const weekday = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day - weekday * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Squad points for one week: distinct active dates from `weekStart` to the
 * Sunday after it, so 0 to 7. One per day, whatever was logged that day: a
 * second meal, a bigger workout or a lower weight earns nothing more, which
 * is what keeps the board from rewarding extreme behaviour (US-C5 AC2).
 */
export function squadWeekPoints(activeDates: Iterable<string>, weekStart: string): number {
  const end = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * DAY_MS).toISOString().slice(0, 10);
  let points = 0;
  for (const date of new Set(activeDates)) if (date >= weekStart && date <= end) points += 1;
  return points;
}

export interface SquadMemberView {
  /** Opaque, stable per membership. Never a user id. */
  ref: string;
  displayName: string;
  isMe: boolean;
  role: 'owner' | 'member';
  /** Current-season belt, or null for "No belt yet". */
  beltTier: BeltTier | null;
  /** Active days this week, 0 to 7, or null when the member keeps them hidden. */
  weekActiveDays: number | null;
  /** Whether the viewer has cheered this member today. False while cheers are off. */
  cheeredToday: boolean;
  /**
   * New to AquaZeroFit and to the squad this week, and never cheered by the
   * viewer: the board offers one "just joined" prompt (US-D2 AC3). False
   * while cheers are off.
   */
  welcome: boolean;
}

export interface SquadView {
  id: string;
  name: string;
  seasonNumber: number;
  inviteCode: string;
  /** https://<site>/s/<code> */
  inviteUrl: string;
  /** `sq_<code>` for t.me/<bot>/<app>?startapp=… (fits Telegram's 64 characters). */
  tgStartParam: string;
  /** Bound to a Telegram group (Squad Corner). */
  isCorner: boolean;
  /** Monday of the week the board counts. */
  weekStart: string;
  /** Active members, earliest joined first. At most SQUAD_MAX_MEMBERS. */
  members: SquadMemberView[];
  /** The caller's own place in this squad. Owners can rotate the code and remove members. */
  me: { ref: string; showStats: boolean; role: 'owner' | 'member' };
}

/** What an invite link shows before sign-in. No member is named. */
export interface SquadPeekView {
  name: string;
  memberCount: number;
  seasonName: string;
  full: boolean;
}

/**
 * none: no squad for this group yet (offer to start one); joinable: there is
 * one with room; full; member: the caller is already in it.
 */
export type SquadCornerState = 'none' | 'joinable' | 'full' | 'member';

export interface SquadCornerView {
  state: SquadCornerState;
  squad: SquadPeekView | null;
}

/** A cheer in the inbox. A coach's is always labelled automated (US-D2 AC2). */
export interface CheerView {
  id: string;
  from:
    | { kind: 'member'; displayName: string }
    | { kind: 'coach'; coachName: string; automated: true };
  cheer: CheerKind;
  createdAt: string;
  seen: boolean;
}

export interface SquadBoardRow {
  member: SquadMemberView;
  /** Shared by ties. Null for members who are warming up or hidden. */
  rank: number | null;
}

/**
 * The weekly board (US-C5): members with points ranked by them, ties
 * sharing a rank; members on 0 listed alphabetically under "Warming up";
 * hidden members listed alphabetically after. Nobody is labelled last.
 */
export function squadBoard(members: readonly SquadMemberView[]): {
  ranked: SquadBoardRow[];
  warmingUp: SquadMemberView[];
  hidden: SquadMemberView[];
} {
  const byName = (a: SquadMemberView, b: SquadMemberView) =>
    a.displayName.localeCompare(b.displayName) || (a.ref < b.ref ? -1 : 1);
  const counted = members.filter((m) => m.weekActiveDays !== null && m.weekActiveDays > 0);
  const sorted = [...counted].sort((a, b) => b.weekActiveDays! - a.weekActiveDays! || byName(a, b));
  const ranked = sorted.map((member) => ({
    member,
    rank: 1 + sorted.filter((other) => other.weekActiveDays! > member.weekActiveDays!).length,
  }));
  return {
    ranked,
    warmingUp: members.filter((m) => m.weekActiveDays === 0).sort(byName),
    hidden: members.filter((m) => m.weekActiveDays === null).sort(byName),
  };
}

// ---------- Share Kit ----------

/** Card sizes in pixels. Story is designed first; feed is R1a's card size. */
export const SHARE_FORMATS = {
  story: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
  x: { width: 1600, height: 900 },
} as const;
export type ShareFormat = keyof typeof SHARE_FORMATS;

/** Story pixels Telegram and Instagram cover with their own interface. */
export const STORY_SAFE_ZONE = { top: 120, bottom: 240 } as const;

export interface ShareLinkView {
  code: string;
  /** https://<site>/r/<code> */
  url: string;
  /** `sh_<code>` for t.me/<bot>/<app>?startapp=… */
  tgStartParam: string;
}

/** "3 people joined from your cards"; names only for people now in your squad. */
export interface ShareSummary {
  joined: number;
  inYourSquad: string[];
}

/**
 * The static story image for a card (US-F2): identical for everyone with
 * the same kind, belt and season accent, so it can be a public URL Telegram
 * fetches itself. Generated by tools/share/build-story-art.mjs. Kinds with
 * no belt on them use `none`.
 */
export function storyArtPath(kind: ShareKindP1, tier: BeltTier | null, accentId: SeasonAccentId): string {
  // A belt card with no belt has nothing to show but the season itself.
  const art = kind === 'belt' && tier === null ? 'season' : kind;
  const shown = art === 'week' || art === 'squad_invite' ? 'none' : (tier ?? 'none');
  return `/share/story/${art}-${shown}-${accentId}.png`;
}

/**
 * A story caption that always ends with its link and never runs past the
 * 200 characters a non-Premium account may post: the text gives way first.
 */
export function storyCaption(text: string, link: string): string {
  const room = STORY_CAPTION_MAX_CHARS - link.length - 1;
  if (room <= 0) return link.slice(0, STORY_CAPTION_MAX_CHARS);
  const body = [...text].length <= room ? text : `${[...text].slice(0, room - 1).join('').trimEnd()}…`;
  return `${body} ${link}`;
}

// ---------- season recap ----------

/**
 * A finished season, effort only (US-A3): no weight, measurement, photo,
 * calorie or macro has a field here.
 */
export interface SeasonRecap {
  seasonNumber: number;
  seasonName: string;
  startsOn: string;
  endsOn: string;
  /** The highest belt held for the season, or null. */
  belt: BeltTier | null;
  activeDays: number;
  /** Longest run of the season, counted the way the consistency card counts it. */
  longestRun: number;
  cheersGiven: number;
  cheersReceived: number;
  /** The squad the person was in at the end of the season, if any. */
  squadName: string | null;
}

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
  /**
   * A banked day is holding the run open over a gap nothing has been logged
   * after yet. It is spent only if the person comes back.
   */
  standingBy: boolean;
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
  /**
   * FC_SQUADS, for adults only: the caller's squad this season, or
   * `current: null` with the create and join actions available.
   */
  squads: { current: { id: string; name: string } | null } | null;
  /** FC_CHEERS, for adults only: how many cheers are waiting to be seen. */
  cheers: { unseen: number } | null;
  /** FC_SHARE_KIT, for adults only: how many people joined from this person's cards. */
  shareKit: { joined: number } | null;
  /**
   * FC_ENROL: the season just ended has a recap ready, offered for its first
   * 14 days to anyone who showed up in it at least once.
   */
  recap: { seasonNumber: number; seasonName: string } | null;
}
