/**
 * XP is paid for activity recorded around the day it belongs to.
 *
 * Logs accept any calendar date, which is what lets a user backfill a diary.
 * But the daily XP cap is per date, so a water log of 1 ml on each of a few
 * hundred invented dates was a few thousand XP, every earned coach unlocked
 * and no reason left to buy one. Backfilled and future-dated rows still save;
 * they just earn nothing. The clock that decides is the server's
 * (recordedAt, loggedAt, completedAt), never the client-chosen localDate or a
 * client-supplied meal loggedAt.
 */
import { describe, expect, it } from 'vitest';
import type { MealLog, WaterLog, WeightLog, WorkoutSession } from '@aquazerofit/shared';
import { toXpDays } from '../modules/progress/experience';

const at = (date: string, hour = 12) => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;

const water = (localDate: string, loggedAt: string) =>
  ({ id: `w-${localDate}-${loggedAt}`, userId: 'u', type: 'waterLog', amountMl: 1, localDate, loggedAt }) as unknown as WaterLog;
const meal = (localDate: string, extra: Partial<MealLog> = {}) =>
  ({ id: `m-${localDate}`, userId: 'u', type: 'mealLog', items: [], localDate, loggedAt: at(localDate), ...extra }) as unknown as MealLog;
const session = (localDate: string, completedAt: string) =>
  ({ id: `s-${localDate}`, userId: 'u', type: 'workoutSession', localDate, completedAt }) as unknown as WorkoutSession;

const activity = (parts: { meals?: MealLog[]; waters?: WaterLog[]; weights?: WeightLog[]; completedSessions?: WorkoutSession[] }) => ({
  meals: [],
  waters: [],
  weights: [],
  completedSessions: [],
  ...parts,
});

describe('XP for activity recorded on time', () => {
  it('pays for a log recorded on its day, and for yesterday logged this morning', () => {
    const days = toXpDays(activity({ waters: [water('2026-11-12', at('2026-11-12')), water('2026-11-11', at('2026-11-12', 7))] }));
    expect(days.map((d) => [d.localDate, d.waterLogs])).toEqual([
      ['2026-11-11', 1],
      ['2026-11-12', 1],
    ]);
  });

  it('allows for a timezone ahead of UTC', () => {
    // 08:00 on the 12th in Sydney is 21:00 UTC on the 11th.
    expect(toXpDays(activity({ waters: [water('2026-11-12', at('2026-11-11', 21))] }))[0]?.waterLogs).toBe(1);
  });

  it('pays nothing for a log backfilled weeks later or dated in the future', () => {
    const days = toXpDays(
      activity({
        waters: [water('2026-01-01', at('2026-11-12')), water('2027-05-05', at('2026-11-12'))],
        completedSessions: [session('2026-02-02', at('2026-11-12'))],
      }),
    );
    expect(days).toEqual([]);
  });

  it('judges a meal by the server recordedAt, not the client loggedAt', () => {
    const farmed = meal('2026-03-03', { loggedAt: at('2026-03-03'), recordedAt: at('2026-11-12') } as Partial<MealLog>);
    expect(toXpDays(activity({ meals: [farmed] }))).toEqual([]);
  });

  it('keeps paying for meals saved before recordedAt existed', () => {
    expect(toXpDays(activity({ meals: [meal('2026-03-03')] }))[0]?.mealLogs).toBe(1);
  });
});
