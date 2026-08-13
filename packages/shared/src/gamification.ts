/**
 * Progression model: experience, levels and tournament ranks.
 *
 * ONE RULE GOVERNS THIS ENTIRE FILE, and it is a safety rule rather than a
 * design preference:
 *
 *   **XP is awarded for behaviour, never for outcomes.**
 *
 * Nothing here can score a calorie deficit, a rate of loss, or a kilogram
 * moved. In a product that also holds a person's weight and intake, an economy
 * that pays out for "less" is a machine for manufacturing disordered eating in
 * exactly the users who engage most. So the ledger pays for *showing up*:
 * logging, training, hydrating, weighing in — and for resting after work, which
 * is the one behaviour a naive points system punishes by omission.
 *
 * Two structural consequences follow, and both are load-bearing:
 *
 *  1. **Every earn is capped per day** (`XP_RULES[].maxPerDay`, and
 *     `XP_MAX_PER_DAY` over the total). A user cannot buy a level with a
 *     bad night — twelve logged snacks score the same as four. This removes
 *     the incentive to over-log, and with it the incentive to over-eat to have
 *     something to log.
 *  2. **XP is derived, never stored.** `computeExperience` is a pure fold over
 *     activity the store already holds, so a level cannot drift from the
 *     behaviour that earned it, cannot be granted by a client, and replays
 *     identically after any migration. Same contract as the credit ledger:
 *     balances are folded, not incremented.
 *
 * Mirrors the consistency model in `types.ts` — there is no state in which a
 * user *loses* XP, because a scoreboard that goes down is a punishment display,
 * and this product does not punish.
 */

/** Local date (YYYY-MM-DD) → what the user did that day. */
export interface XpDayActivity {
  localDate: string;
  mealLogs: number;
  waterLogs: number;
  weighIns: number;
  workouts: number;
}

export type XpReasonKind =
  | 'activeDay'
  | 'mealLog'
  | 'waterLog'
  | 'weighIn'
  | 'workout'
  | 'recoveryDay';

export interface XpRule {
  kind: XpReasonKind;
  /** Points per qualifying occurrence. */
  points: number;
  /** Occurrences that can score in a single day. Above this, effort is free. */
  maxPerDay: number;
  /** Weight-neutral, behaviour-named label shown in the breakdown. */
  label: string;
}

/**
 * The full earn table. `activeDay` pays for opening the app and recording
 * anything at all, which is deliberately the single largest per-occurrence
 * award available to a user having a hard week: the floor for "I showed up"
 * sits above the floor for "I trained".
 */
export const XP_RULES: readonly XpRule[] = [
  { kind: 'activeDay', points: 20, maxPerDay: 1, label: 'Showed up' },
  { kind: 'mealLog', points: 10, maxPerDay: 4, label: 'Meals logged' },
  { kind: 'waterLog', points: 5, maxPerDay: 1, label: 'Hydration logged' },
  { kind: 'weighIn', points: 15, maxPerDay: 1, label: 'Weigh-in' },
  { kind: 'workout', points: 30, maxPerDay: 2, label: 'Training' },
  { kind: 'recoveryDay', points: 15, maxPerDay: 1, label: 'Recovery honoured' },
] as const;

/**
 * Hard ceiling on a single day's earnings, applied after the per-rule caps.
 * The per-rule caps already bound each lane; this bounds their sum, so no
 * future rule addition can quietly make a single heroic day worth a week of
 * ordinary ones. Overtraining must never out-earn consistency.
 */
export const XP_MAX_PER_DAY = 150;

/**
 * A rest day scores only when it follows real work — a logged day with no
 * training, within XP_RECOVERY_LOOKBACK_DAYS of a session. Without the
 * lookback this would pay every user for every untrained day, which is not a
 * recovery mechanic, just inflation.
 */
export const XP_RECOVERY_LOOKBACK_DAYS = 2;

/**
 * Level curve: level n begins at XP_LEVEL_STEP · (n−1) · n / 2, i.e. each
 * level costs XP_LEVEL_STEP more than the one before (75, 150, 225 …).
 *
 * Chosen against the real earn rate rather than by feel: a consistently
 * logging user banks ~85 XP/day, which puts the early coach unlocks within the
 * first fortnight — inside the window where a habit is still forming and a
 * reward still changes behaviour — while the final unlock sits months out and
 * stays worth wanting.
 */
export const XP_LEVEL_STEP = 75;
export const XP_MAX_LEVEL = 50;

/** Cumulative XP at which `level` begins. Level 1 starts at 0. */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return (XP_LEVEL_STEP * (n - 1) * n) / 2;
}

/** Highest level fully paid for by `totalXp`. */
export function levelForXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp));
  // Closed form of the triangular inverse, then corrected by at most one step
  // so floating-point error can never award or withhold a level at a boundary.
  let level = Math.floor((1 + Math.sqrt(1 + (8 * xp) / XP_LEVEL_STEP)) / 2);
  level = Math.min(XP_MAX_LEVEL, Math.max(1, level));
  while (level < XP_MAX_LEVEL && xpForLevel(level + 1) <= xp) level += 1;
  while (level > 1 && xpForLevel(level) > xp) level -= 1;
  return level;
}

/**
 * Named bands over the level ladder, borrowed from the Heavens Tournament
 * bracket so progression reads as a fighter's career rather than a number
 * going up. `minLevel` ascending; the last band a level clears is its rank.
 */
export interface CoachRank {
  id: string;
  name: string;
  minLevel: number;
}

export const COACH_RANKS: readonly CoachRank[] = [
  { id: 'rookie', name: 'Rookie', minLevel: 1 },
  { id: 'contender', name: 'Contender', minLevel: 3 },
  { id: 'prospect', name: 'Prospect', minLevel: 5 },
  { id: 'ranked', name: 'Ranked', minLevel: 8 },
  { id: 'top-eight', name: 'Top Eight', minLevel: 11 },
  { id: 'heavens', name: 'Heavens Bracket', minLevel: 14 },
  { id: 'champion', name: 'Champion', minLevel: 18 },
] as const;

export function rankForLevel(level: number): CoachRank {
  let rank = COACH_RANKS[0]!;
  for (const candidate of COACH_RANKS) {
    if (level >= candidate.minLevel) rank = candidate;
  }
  return rank;
}

/**
 * Bond: XP earned while a given coach was the selected one.
 *
 * Deliberately linear where the main ladder is quadratic. The main ladder
 * paces unlocks across months and has to keep its late levels expensive; bond
 * exists to make *this* coach feel like they know you, so it must move
 * visibly within the first week or it is not doing its job. Ten steps, then it
 * stops — a relationship that never tops out is a treadmill.
 */
export const COACH_BOND_STEP = 250;
export const COACH_BOND_MAX_LEVEL = 10;

export function bondLevelForXp(bondXp: number): number {
  const xp = Math.max(0, Math.floor(bondXp));
  return Math.min(COACH_BOND_MAX_LEVEL, 1 + Math.floor(xp / COACH_BOND_STEP));
}

/** Progress through the current bond level, 0–1. 1 at the cap. */
export function bondProgressForXp(bondXp: number): number {
  if (bondLevelForXp(bondXp) >= COACH_BOND_MAX_LEVEL) return 1;
  return (Math.max(0, bondXp) % COACH_BOND_STEP) / COACH_BOND_STEP;
}

export interface XpBreakdownEntry {
  kind: XpReasonKind;
  label: string;
  points: number;
}

export interface ExperienceStatus {
  totalXp: number;
  level: number;
  rank: CoachRank;
  /** Cumulative XP at which the current level began. */
  levelStartXp: number;
  /** Cumulative XP at which the next level begins; null at XP_MAX_LEVEL. */
  nextLevelXp: number | null;
  /** Progress through the current level, 0–1. 1 at max level. */
  levelProgress: number;
  /** XP earned today, after caps — what the dashboard celebrates. */
  earnedToday: number;
  /** Today's earnings by rule, non-zero entries only, in XP_RULES order. */
  todayBreakdown: XpBreakdownEntry[];
  /** Whether today has hit XP_MAX_PER_DAY. Shown as "banked", never as a wall. */
  dailyCapReached: boolean;
}

/** Points a single day is worth, after per-rule and daily caps. */
export function xpForDay(day: XpDayActivity, recoveryDay: boolean): XpBreakdownEntry[] {
  const occurrences: Record<XpReasonKind, number> = {
    activeDay: day.mealLogs + day.waterLogs + day.weighIns + day.workouts > 0 ? 1 : 0,
    mealLog: day.mealLogs,
    waterLog: day.waterLogs,
    weighIn: day.weighIns,
    workout: day.workouts,
    recoveryDay: recoveryDay ? 1 : 0,
  };

  const entries: XpBreakdownEntry[] = [];
  let spent = 0;
  for (const rule of XP_RULES) {
    const counted = Math.min(occurrences[rule.kind], rule.maxPerDay);
    if (counted <= 0) continue;
    // The daily ceiling truncates the last rule that crosses it rather than
    // dropping it, so the breakdown always sums to the awarded total.
    const points = Math.min(counted * rule.points, Math.max(0, XP_MAX_PER_DAY - spent));
    if (points <= 0) continue;
    spent += points;
    entries.push({ kind: rule.kind, label: rule.label, points });
  }
  return entries;
}

function sumPoints(entries: readonly XpBreakdownEntry[]): number {
  return entries.reduce((total, entry) => total + entry.points, 0);
}

/**
 * Fold the user's whole history into a progression status.
 *
 * `days` must be sorted ascending by `localDate`; `today` is the user's local
 * date so that "earned today" matches the day the user is actually living in
 * rather than the server's.
 */
export function computeExperience(
  days: readonly XpDayActivity[],
  today: string,
): ExperienceStatus {
  const workoutDates = new Set(days.filter((d) => d.workouts > 0).map((d) => d.localDate));

  let totalXp = 0;
  let todayBreakdown: XpBreakdownEntry[] = [];

  for (const day of days) {
    const trainedRecently = recentlyTrained(day.localDate, workoutDates);
    const isRecovery = day.workouts === 0 && trainedRecently && hasAnyLog(day);
    const entries = xpForDay(day, isRecovery);
    totalXp += sumPoints(entries);
    if (day.localDate === today) todayBreakdown = entries;
  }

  const level = levelForXp(totalXp);
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = level >= XP_MAX_LEVEL ? null : xpForLevel(level + 1);
  const span = nextLevelXp === null ? 0 : nextLevelXp - levelStartXp;
  const earnedToday = sumPoints(todayBreakdown);

  return {
    totalXp,
    level,
    rank: rankForLevel(level),
    levelStartXp,
    nextLevelXp,
    levelProgress: span > 0 ? Math.min(1, (totalXp - levelStartXp) / span) : 1,
    earnedToday,
    todayBreakdown,
    dailyCapReached: earnedToday >= XP_MAX_PER_DAY,
  };
}

function hasAnyLog(day: XpDayActivity): boolean {
  return day.mealLogs + day.waterLogs + day.weighIns > 0;
}

/** Was there a session in the XP_RECOVERY_LOOKBACK_DAYS before `localDate`? */
function recentlyTrained(localDate: string, workoutDates: ReadonlySet<string>): boolean {
  for (let back = 1; back <= XP_RECOVERY_LOOKBACK_DAYS; back += 1) {
    if (workoutDates.has(shiftIsoDate(localDate, -back))) return true;
  }
  return false;
}

/**
 * Local ISO date arithmetic. Duplicated from the API's `platform/dates` rather
 * than imported because this module is shared with the browser bundle and must
 * stay dependency-free; midday anchoring keeps a ±1 day DST shift from moving
 * the date.
 */
function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}
