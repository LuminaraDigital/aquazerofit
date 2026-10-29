/**
 * Season recap (AZF-P1 US-A3): when a season ends, a look back that can be
 * kept or shared.
 *
 * Effort only. Every figure here is a count of days or of cheers; the belt
 * comes from the same read-only lookup the squad board uses, and nothing in
 * this file reads a weight, a meal or a body measurement.
 *
 * Offered for the first RECAP_WINDOW_DAYS after a season ends to anyone who
 * showed up in it at least once. The recap itself stays readable afterwards
 * for any finished season the person was active in.
 */
import {
  RECAP_WINDOW_DAYS,
  SEASON_ONE_STARTS_ON,
  seasonByNumber,
  seasonFor,
  type SeasonRecap,
} from '@aquazerofit/shared';
import { daysBetween } from '../../platform/dates';
import { logEvent } from '../../platform/telemetry';
import { seasonBeltTier } from '../fightRecord/service';
import { activeDatesOf, loadActivity, longestRun } from '../progress/service';
import { engageRepo } from './repo';

function seasonDates(activeDates: ReadonlySet<string>, seasonNumber: number): string[] {
  const season = seasonByNumber(seasonNumber);
  return [...activeDates]
    .filter((d) => d >= SEASON_ONE_STARTS_ON && d >= season.startsOn && d <= season.endsOn)
    .sort();
}

/** The recap for a finished season the person showed up in, or null. */
export async function seasonRecap(userId: string, seasonNumber: number, today: string): Promise<SeasonRecap | null> {
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1 || seasonNumber >= seasonFor(today).number) return null;
  const season = seasonByNumber(seasonNumber);
  const activeDates = activeDatesOf(loadActivity(userId));
  const dates = seasonDates(activeDates, seasonNumber);
  if (dates.length === 0) return null;
  const repo = engageRepo();
  const [tally, membership, grace] = await Promise.all([
    repo.cheerTally(userId, season.startsOn, season.endsOn),
    repo.activeMembership(userId, seasonNumber),
    repo.graceEntries(userId),
  ]);
  // Cut Man days bridge the run here exactly as they do on the consistency card.
  const bridged = new Set(grace.filter((g) => g.entry === 'applied').map((g) => g.localDate));
  const squad = membership ? await repo.squad(membership.squadId) : null;
  logEvent('fc_recap_built', { season: seasonNumber });
  return {
    seasonNumber,
    seasonName: season.name,
    startsOn: season.startsOn,
    endsOn: season.endsOn,
    // The season's own end, so the belt is the one held for that season.
    belt: seasonBeltTier(userId, season.endsOn, activeDates),
    activeDays: dates.length,
    longestRun: longestRun(dates, bridged),
    cheersGiven: tally.given,
    cheersReceived: tally.received,
    squadName: squad?.name ?? null,
  };
}

/** The `recap` part of the status block: the season just ended, in its window. */
export function recapOffer(userId: string, today: string): { seasonNumber: number; seasonName: string } | null {
  const previous = seasonFor(today).number - 1;
  if (previous < 1) return null;
  const season = seasonByNumber(previous);
  if (daysBetween(season.endsOn, today) > RECAP_WINDOW_DAYS) return null;
  const showedUp = seasonDates(activeDatesOf(loadActivity(userId)), previous).length > 0;
  return showedUp ? { seasonNumber: previous, seasonName: season.name } : null;
}
