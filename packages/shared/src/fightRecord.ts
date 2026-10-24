/**
 * Fight Record: seasons and Consistency Belts (AZF-W3-05 §3).
 *
 * The same rule that governs `gamification.ts` governs this file, for the same
 * safety reason:
 *
 *   **A belt is awarded for showing up, never for an outcome.**
 *
 * It is enforced by the shape of the inputs rather than by a comment. Every
 * function here that decides a belt takes active local dates (or a count of
 * them) and nothing else, so there is no parameter through which a weight, a
 * calorie or a body measurement could reach the decision. A future change that
 * wanted to reward "less" would have to change these signatures first, in a
 * file whose header says why it must not.
 *
 * Two further properties are load-bearing:
 *
 *  1. **A belt cannot be lost.** Progress is a count of active days inside the
 *     season, and a count does not fall when a day is missed. There is no grace
 *     bookkeeping here because there is nothing to forgive: a quiet week
 *     changes nothing, and the copy never has to explain a loss.
 *  2. **Every season starts clean.** Seasons are fixed calendar spans, so a
 *     user who lapsed returns to the same zero as everyone else at the next
 *     boundary, with every belt they ever earned still on their record.
 *
 * Pure and dependency-free, like `gamification.ts`: the API derives belts with
 * it and the web client explains the ladder with it, so the two cannot
 * disagree about what a season is.
 */
import type { BeltRung, BeltTier, Season } from './types/fightRecord';
import { BELT_TIERS } from './types/fightRecord';

/** Eight weeks: long enough to build a habit, short enough to restart often. */
export const SEASON_LENGTH_DAYS = 56;

/**
 * The Monday season 1 begins. Set once, to the launch Monday, before Fight
 * Record is first enabled in production, and never moved afterwards: award ids
 * embed the season number, so moving the anchor would re-label belts people
 * already hold. Dates before it fall into season 1 and count for nothing.
 */
export const SEASON_ONE_STARTS_ON = '2026-10-19';

/**
 * Rotating season names. Fighter-camp vocabulary rather than weather: half the
 * markets this ships to have no autumn, and a season called "Winter Camp" in
 * Jakarta reads as a translation error.
 */
export const SEASON_NAMES = [
  'Fight Camp',
  'Ground Game',
  'Second Wind',
  'Ring Craft',
  'Long Game',
  'Title Run',
] as const;

/**
 * Active days in a season that earn each belt, ascending with BELT_TIERS.
 *
 * Calibrated against the weekly-active-logger bar (three active days a week)
 * rather than by feel: that habit is purple, the middle of the ladder. White
 * is an early win inside the first week; black is six days in seven, which
 * leaves room for a rest day every week of the season.
 */
export const BELT_LADDER: readonly BeltRung[] = [
  { tier: 'white', activeDays: 3 },
  { tier: 'blue', activeDays: 12 },
  { tier: 'purple', activeDays: 24 },
  { tier: 'brown', activeDays: 36 },
  { tier: 'black', activeDays: 48 },
] as const;

const DAY_MS = 86_400_000;

/**
 * ISO-date arithmetic in UTC. A UTC day is always 24 hours, so differences are
 * exact integers and no daylight-saving shift can move a boundary; the inputs
 * are already the user's local calendar dates.
 */
function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
}

function isoDateOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

const ANCHOR_DAY = dayNumber(SEASON_ONE_STARTS_ON);

/** Season `number` (1-based). Numbers below 1 are clamped to season 1. */
export function seasonByNumber(number: number): Season {
  const index = Math.max(0, Math.floor(number) - 1);
  const start = ANCHOR_DAY + index * SEASON_LENGTH_DAYS;
  return {
    id: `season-${index + 1}`,
    number: index + 1,
    name: SEASON_NAMES[index % SEASON_NAMES.length]!,
    startsOn: isoDateOf(start),
    endsOn: isoDateOf(start + SEASON_LENGTH_DAYS - 1),
  };
}

/** The season containing a local date. Never "no season": see the anchor. */
export function seasonNumberFor(localDate: string): number {
  return Math.max(0, Math.floor((dayNumber(localDate) - ANCHOR_DAY) / SEASON_LENGTH_DAYS)) + 1;
}

export function seasonFor(localDate: string): Season {
  return seasonByNumber(seasonNumberFor(localDate));
}

/**
 * Days remaining in `season` including `today`. Before the season opens it is
 * the full length, so the figure never exceeds what a season can hold.
 */
export function daysLeftIn(season: Season, today: string): number {
  const from = Math.max(dayNumber(today), dayNumber(season.startsOn));
  return Math.max(0, dayNumber(season.endsOn) - from + 1);
}

/** Highest belt `activeDays` has earned, or null below the first rung. */
export function tierForActiveDays(activeDays: number): BeltTier | null {
  let tier: BeltTier | null = null;
  for (const rung of BELT_LADDER) {
    if (activeDays >= rung.activeDays) tier = rung.tier;
  }
  return tier;
}

/** The rung above `activeDays`, or null once black is held. */
export function nextRungFor(activeDays: number): BeltRung | null {
  return BELT_LADDER.find((rung) => activeDays < rung.activeDays) ?? null;
}

/** Ladder position, for comparing tiers. -1 for "no belt". */
export function tierRank(tier: BeltTier | null): number {
  return tier === null ? -1 : BELT_TIERS.indexOf(tier);
}

/**
 * Active days per season number, counting only dates up to `today`.
 *
 * The clamp matters because log dates are client-supplied local dates: a
 * device a timezone ahead can file tomorrow's date, and that day has not been
 * shown up for yet. Only seasons with at least one active day appear.
 */
export function activeDaysBySeason(
  activeDates: Iterable<string>,
  today: string,
): Map<number, number> {
  const counts = new Map<number, number>();
  const last = dayNumber(today);
  for (const date of new Set(activeDates)) {
    const day = dayNumber(date);
    // Not a date (NaN fails both bounds), in the future, or before the anchor.
    // Pre-anchor dates clamp into season 1 for the calendar's sake, but they
    // predate the first season and must not count toward its belt.
    if (!(day >= ANCHOR_DAY && day <= last)) continue;
    const number = seasonNumberFor(date);
    counts.set(number, (counts.get(number) ?? 0) + 1);
  }
  return counts;
}
