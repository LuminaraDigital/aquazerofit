/**
 * Recovery-aware consistency (AQF-11 §6). These tests exist to pin the one
 * behaviour the classic streak got wrong: a missed day must not destroy the
 * run. `computeConsistency` is pure over its activity argument, so no store or
 * HTTP layer is involved.
 */
import { describe, expect, it } from 'vitest';
import {
  CONSISTENCY_GRACE_DAYS,
  CONSISTENCY_STEADY_DAYS,
  CONSISTENCY_WINDOW_DAYS,
  type MealLog,
} from '@aquazerofit/shared';
import { computeConsistency, computeStreak, type UserActivity } from '../modules/progress/service';

/** Activity is only ever read for its local dates, so meals alone suffice. */
function activityOn(dates: string[]): UserActivity {
  return {
    meals: dates.map(
      (localDate, i): MealLog => ({
        id: `ml-${i}`,
        userId: 'u1',
        type: 'mealLog',
        mealType: 'lunch',
        items: [],
        totalKcal: 500,
        totalProteinG: 30,
        totalCarbsG: 50,
        totalFatG: 15,
        source: 'manual',
        localDate,
        loggedAt: `${localDate}T12:00:00.000Z`,
      }),
    ),
    waters: [],
    weights: [],
    completedSessions: [],
  };
}

/** 2026-07-03 .. 2026-07-09 — exactly CONSISTENCY_STEADY_DAYS, ending "today". */
const SEVEN_DAYS_TO_THE_9TH = [
  '2026-07-03',
  '2026-07-04',
  '2026-07-05',
  '2026-07-06',
  '2026-07-07',
  '2026-07-08',
  '2026-07-09',
];

describe('computeConsistency — a missed day cannot destroy the run', () => {
  it('bridges a single missed day: Mon, Tue, (miss Wed), Thu is one 3-day run', () => {
    // 2026-07-06 Mon, 07 Tue, 09 Thu — Wednesday the 8th is missed.
    const activity = activityOn(['2026-07-06', '2026-07-07', '2026-07-09']);
    const c = computeConsistency(activity, '2026-07-09');

    expect(c.currentDays).toBe(3);
    expect(c.graceRemaining).toBe(0); // the one grace day paid for Wednesday
    expect(c.state).not.toBe('resting');
    // The punishing counter it replaces would have reported 1.
    expect(computeStreak(activity, '2026-07-09')).toBe(1);
  });

  it('ends the run on two consecutive missed days', () => {
    // 06, 07 logged; 08 and 09 missed; back on the 10th.
    const dates = ['2026-07-06', '2026-07-07', '2026-07-10'];
    const c = computeConsistency(activityOn(dates), '2026-07-10');

    expect(c.currentDays).toBe(1);
    expect(c.graceRemaining).toBe(CONSISTENCY_GRACE_DAYS);
    expect(c.bestDays).toBe(2); // the earlier run is still on the record
  });

  it('does not reduce the run for an incomplete today', () => {
    const dates = ['2026-07-06', '2026-07-07', '2026-07-08'];
    const logged = computeConsistency(activityOn(dates), '2026-07-08');
    const stillGoing = computeConsistency(activityOn(dates), '2026-07-09');

    expect(stillGoing.currentDays).toBe(logged.currentDays);
    expect(stillGoing.currentDays).toBe(3);
    expect(stillGoing.graceRemaining).toBe(CONSISTENCY_GRACE_DAYS);
  });

  it('counts a day once — as active or as grace, never both', () => {
    // Five active days bridged by a single gap: 06 07 (miss 08) 09 10 11.
    const c = computeConsistency(
      activityOn(['2026-07-06', '2026-07-07', '2026-07-09', '2026-07-10', '2026-07-11']),
      '2026-07-11',
    );

    expect(c.currentDays).toBe(5); // not 6 — the bridged Wednesday is not active
    expect(c.graceRemaining).toBe(0);
  });
});

describe('computeConsistency — bestDays', () => {
  it('survives a fully broken run and is never below currentDays', () => {
    const long = ['05-01', '05-02', '05-03', '05-04', '05-05'].map((d) => `2026-${d}`);
    const c = computeConsistency(activityOn([...long, '2026-07-09']), '2026-07-09');

    expect(c.currentDays).toBe(1);
    expect(c.bestDays).toBe(5);
    expect(c.bestDays).toBeGreaterThanOrEqual(c.currentDays);
  });

  it('measures the best run with the same grace rule', () => {
    // 04-01..04-03, gap of one, 04-05..04-06 → a single 5-day run.
    const c = computeConsistency(
      activityOn(['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-05', '2026-04-06']),
      '2026-07-09',
    );

    expect(c.bestDays).toBe(5);
    expect(c.currentDays).toBe(0); // long since ended
  });

  it('is zero for a user with no logs', () => {
    expect(computeConsistency(activityOn([]), '2026-07-09').bestDays).toBe(0);
  });
});

describe('computeConsistency — window', () => {
  it('counts only the trailing window and ignores older activity', () => {
    const today = '2026-07-09';
    const oldest = '2026-06-12'; // exactly 27 days back — the window edge
    const c = computeConsistency(activityOn([oldest, '2026-06-11', '2026-01-01', today]), today);

    expect(c.windowDays).toBe(CONSISTENCY_WINDOW_DAYS);
    expect(c.activeDays).toBe(2); // 2026-06-11 and 2026-01-01 are outside
    expect(c.lastActiveDate).toBe(today);
  });

  it('reports lastActiveDate as null when there is nothing logged', () => {
    expect(computeConsistency(activityOn([]), '2026-07-09').lastActiveDate).toBeNull();
  });
});

describe('computeConsistency — state', () => {
  it('rests for a brand-new user with no logs, with grace intact', () => {
    const c = computeConsistency(activityOn([]), '2026-07-09');

    expect(c.state).toBe('resting');
    expect(c.currentDays).toBe(0);
    expect(c.activeDays).toBe(0);
    // Resting is neutral: nothing has been spent, nothing has been lost.
    expect(c.graceRemaining).toBe(CONSISTENCY_GRACE_DAYS);
  });

  it('rests once the last active day is beyond grace, not before', () => {
    const stillGoing = computeConsistency(activityOn(['2026-07-07']), '2026-07-09');
    const rested = computeConsistency(activityOn(['2026-07-06']), '2026-07-09');

    expect(stillGoing.state).not.toBe('resting'); // yesterday-but-one is bridged
    expect(rested.state).toBe('resting');
    expect(rested.currentDays).toBe(0);
  });

  it('builds on a fresh short run', () => {
    const c = computeConsistency(activityOn(['2026-07-08', '2026-07-09']), '2026-07-09');

    expect(c.state).toBe('building');
    expect(c.currentDays).toBe(2);
  });

  it('is steady at CONSISTENCY_STEADY_DAYS', () => {
    expect(SEVEN_DAYS_TO_THE_9TH).toHaveLength(CONSISTENCY_STEADY_DAYS);
    const c = computeConsistency(activityOn(SEVEN_DAYS_TO_THE_9TH), '2026-07-09');

    expect(c.currentDays).toBe(CONSISTENCY_STEADY_DAYS);
    expect(c.state).toBe('steady');
  });

  it('recovers when the user returns after a multi-day gap', () => {
    // Active around the 1st, away for a week, back today.
    const c = computeConsistency(
      activityOn(['2026-06-30', '2026-07-01', '2026-07-02', '2026-07-09']),
      '2026-07-09',
    );

    expect(c.state).toBe('recovering');
    expect(c.currentDays).toBe(1);
    expect(c.bestDays).toBe(3); // what they did before is still theirs
    expect(c.activeDays).toBe(4);
  });

  it('prefers steady over recovering once the new run is long enough', () => {
    const dates = ['2026-06-20', ...SEVEN_DAYS_TO_THE_9TH];
    const c = computeConsistency(activityOn(dates), '2026-07-09');

    expect(c.state).toBe('steady');
  });
});
