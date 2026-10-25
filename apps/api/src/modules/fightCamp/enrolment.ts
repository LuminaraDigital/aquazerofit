/**
 * Fight Camp enrolment (AZF-P1 US-A1): a one-tap commitment to the season.
 *
 * It is a marker and nothing more. Belts accrue whether or not anyone enrols
 * (US-A1 AC3): no belt, grace or squad rule reads this table, so enrolment
 * can never become a gate on R1a's effort-only ladder.
 */
import {
  FRESH_START_WINDOW_DAYS,
  seasonFor,
  type EnrolPrompt,
  type EnrolSource,
  type EnrolmentView,
  type Season,
} from '@aquazerofit/shared';
import { daysBetween } from '../../platform/dates';
import { logEvent } from '../../platform/telemetry';
import { engageRepo, type EnrolmentRow } from './repo';

function viewOf(row: EnrolmentRow, season: Season): EnrolmentView {
  return {
    seasonNumber: row.seasonNumber,
    seasonName: season.name,
    source: row.source,
    enrolledAt: row.enrolledAt,
  };
}

/** Enrol in the season containing `today`. Idempotent per user and season. */
export async function enrol(
  userId: string,
  source: EnrolSource,
  today: string,
  now: Date = new Date(),
): Promise<{ enrolment: EnrolmentView; created: boolean }> {
  const season = seasonFor(today);
  const { row, created } = await engageRepo().enrol({
    userId,
    seasonNumber: season.number,
    source,
    enrolledAt: now.toISOString(),
  });
  if (created) logEvent('fc_enrolled', { season: season.number, source });
  return { enrolment: viewOf(row, season), created };
}

/** The fresh-start window: the first FRESH_START_WINDOW_DAYS of a season. */
export function enrolPromptFor(season: Season, today: string): EnrolPrompt {
  return daysBetween(season.startsOn, today) < FRESH_START_WINDOW_DAYS ? 'primary' : 'secondary';
}

export async function enrolmentStatus(
  userId: string,
  today: string,
): Promise<{ enrolled: boolean; prompt: EnrolPrompt }> {
  const season = seasonFor(today);
  const row = await engageRepo().enrolment(userId, season.number);
  return { enrolled: row !== null, prompt: enrolPromptFor(season, today) };
}
