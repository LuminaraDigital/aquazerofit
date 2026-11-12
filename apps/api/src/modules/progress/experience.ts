/**
 * Activity → XP adapter.
 *
 * The scoring rules live in `@aquazerofit/shared/gamification` so the client
 * can explain a level without a round trip; this file's only job is to project
 * the store's four log shapes onto the one day-shaped record those rules
 * consume. Keeping the projection here and the arithmetic there means a change
 * to what counts as activity cannot silently change what a point is worth.
 *
 * Same posture as the rest of the progress module: pure over `UserActivity`,
 * no store access, trivially testable.
 */
import { computeExperience, type ExperienceStatus, type XpDayActivity } from '@aquazerofit/shared';
import type { UserActivity } from './service';

/**
 * One record per local date on which anything happened, ascending.
 *
 * Days with no activity are omitted rather than emitted as zeroes: they score
 * nothing by definition, and a user returning after six months would otherwise
 * force ~180 empty records through the fold on every dashboard read.
 */
const DAY_MS = 86_400_000;

/**
 * Whether a row was recorded around the day it is dated: from the day before
 * (a timezone ahead of UTC) to two days after (yesterday's dinner logged the
 * next morning, in a timezone behind UTC). The daily XP cap is per date and
 * any date can be logged, so without this a few hundred invented dates were a
 * few thousand XP. Such rows still save and still show in the diary; they
 * earn nothing. `recordedAt` is the server's clock; a row without one is
 * from before it existed and keeps counting.
 */
function onTime(localDate: string, recordedAt: string | null | undefined): boolean {
  if (!recordedAt) return true;
  const day = Date.parse(`${localDate}T00:00:00Z`);
  const recorded = Date.parse(recordedAt);
  if (Number.isNaN(day) || Number.isNaN(recorded)) return false;
  return recorded >= day - DAY_MS && recorded < day + 3 * DAY_MS;
}

export function toXpDays(activity: UserActivity): XpDayActivity[] {
  const byDate = new Map<string, XpDayActivity>();

  const dayFor = (localDate: string): XpDayActivity => {
    let day = byDate.get(localDate);
    if (!day) {
      day = { localDate, mealLogs: 0, waterLogs: 0, weighIns: 0, workouts: 0 };
      byDate.set(localDate, day);
    }
    return day;
  };

  // Water and weight loggedAt and a session's completedAt are set by the
  // server; a meal's loggedAt can come from the client, so meals use recordedAt.
  for (const log of activity.meals) {
    if (onTime(log.localDate, log.recordedAt)) dayFor(log.localDate).mealLogs += 1;
  }
  for (const log of activity.waters) {
    if (onTime(log.localDate, log.loggedAt)) dayFor(log.localDate).waterLogs += 1;
  }
  for (const log of activity.weights) {
    if (onTime(log.localDate, log.loggedAt)) dayFor(log.localDate).weighIns += 1;
  }
  for (const session of activity.completedSessions) {
    if (onTime(session.localDate, session.completedAt)) dayFor(session.localDate).workouts += 1;
  }

  return [...byDate.values()].sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export function experienceFor(activity: UserActivity, today: string): ExperienceStatus {
  return computeExperience(toXpDays(activity), today);
}
