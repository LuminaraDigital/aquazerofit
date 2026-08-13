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

  for (const log of activity.meals) dayFor(log.localDate).mealLogs += 1;
  for (const log of activity.waters) dayFor(log.localDate).waterLogs += 1;
  for (const log of activity.weights) dayFor(log.localDate).weighIns += 1;
  for (const session of activity.completedSessions) dayFor(session.localDate).workouts += 1;

  return [...byDate.values()].sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export function experienceFor(activity: UserActivity, today: string): ExperienceStatus {
  return computeExperience(toXpDays(activity), today);
}
