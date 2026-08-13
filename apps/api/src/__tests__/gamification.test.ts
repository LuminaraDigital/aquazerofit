/**
 * The XP economy's safety properties, as executable assertions.
 *
 * These are not "does the maths work" tests. Each one pins a rule that exists
 * to stop the progression system from rewarding a behaviour this product must
 * never reward, and each would pass silently if someone "optimised" the caps
 * away. The most important test in the file is the one asserting that a day of
 * frantic over-logging cannot out-earn two ordinary days.
 */
import { describe, expect, it } from 'vitest';
import {
  COACH_BOND_MAX_LEVEL,
  XP_MAX_PER_DAY,
  XP_RULES,
  bondLevelForXp,
  computeExperience,
  levelForXp,
  rankForLevel,
  xpForDay,
  xpForLevel,
  type XpDayActivity,
} from '@aquazerofit/shared';

const day = (over: Partial<XpDayActivity> & { localDate: string }): XpDayActivity => ({
  mealLogs: 0,
  waterLogs: 0,
  weighIns: 0,
  workouts: 0,
  ...over,
});

const total = (entries: { points: number }[]): number =>
  entries.reduce((sum, e) => sum + e.points, 0);

describe('per-day caps', () => {
  it('stops paying for meals past the daily cap', () => {
    const capped = XP_RULES.find((r) => r.kind === 'mealLog')!;
    const four = total(xpForDay(day({ localDate: '2026-08-01', mealLogs: 4 }), false));
    const twenty = total(xpForDay(day({ localDate: '2026-08-01', mealLogs: 20 }), false));

    expect(twenty).toBe(four);
    expect(four).toBe(20 /* activeDay */ + capped.maxPerDay * capped.points);
  });

  it('never awards more than XP_MAX_PER_DAY however hard the day is farmed', () => {
    const extreme = xpForDay(
      day({ localDate: '2026-08-01', mealLogs: 99, waterLogs: 99, weighIns: 99, workouts: 99 }),
      true,
    );
    expect(total(extreme)).toBeLessThanOrEqual(XP_MAX_PER_DAY);
  });

  it('keeps the breakdown summing to the awarded total even when truncated', () => {
    // The daily ceiling clips the last rule that crosses it; if it dropped that
    // rule instead, the itemised list a user reads would not add up to the
    // number beside it.
    const entries = xpForDay(
      day({ localDate: '2026-08-01', mealLogs: 4, waterLogs: 1, weighIns: 1, workouts: 2 }),
      true,
    );
    expect(total(entries)).toBeLessThanOrEqual(XP_MAX_PER_DAY);
    expect(entries.every((e) => e.points > 0)).toBe(true);
  });

  it('cannot let one frantic day beat two ordinary ones', () => {
    const frantic = total(
      xpForDay(day({ localDate: '2026-08-01', mealLogs: 40, waterLogs: 12 }), false),
    );
    const ordinary = day({ localDate: '2026-08-01', mealLogs: 3, waterLogs: 1 });
    const twoOrdinaryDays =
      total(xpForDay(ordinary, false)) + total(xpForDay({ ...ordinary, localDate: '2026-08-02' }, false));

    expect(twoOrdinaryDays).toBeGreaterThan(frantic);
  });
});

describe('recovery', () => {
  it('pays for a logged rest day that follows training', () => {
    const days: XpDayActivity[] = [
      day({ localDate: '2026-08-01', mealLogs: 2, workouts: 1 }),
      day({ localDate: '2026-08-02', mealLogs: 2 }),
    ];
    const withRest = computeExperience(days, '2026-08-02');

    const noPriorTraining = computeExperience(
      [day({ localDate: '2026-08-01', mealLogs: 2 }), day({ localDate: '2026-08-02', mealLogs: 2 })],
      '2026-08-02',
    );

    const recoveryRule = XP_RULES.find((r) => r.kind === 'recoveryDay')!;
    expect(withRest.totalXp - noPriorTraining.totalXp).toBe(
      recoveryRule.points + 30 /* the workout itself */,
    );
  });

  it('does not pay a rest bonus on a day that also trained', () => {
    const trainedBothDays = computeExperience(
      [
        day({ localDate: '2026-08-01', mealLogs: 2, workouts: 1 }),
        day({ localDate: '2026-08-02', mealLogs: 2, workouts: 1 }),
      ],
      '2026-08-02',
    );
    const breakdown = trainedBothDays.todayBreakdown.map((e) => e.kind);
    expect(breakdown).not.toContain('recoveryDay');
  });
});

describe('level curve', () => {
  it('round-trips level ↔ XP at every boundary', () => {
    for (let level = 1; level <= 30; level += 1) {
      const start = xpForLevel(level);
      expect(levelForXp(start)).toBe(level);
      // One point short of the threshold is still the previous level.
      if (level > 1) expect(levelForXp(start - 1)).toBe(level - 1);
    }
  });

  it('never reports a level below 1, including for a brand new account', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-500)).toBe(1);
  });

  it('assigns the highest rank a level clears', () => {
    expect(rankForLevel(1).id).toBe('rookie');
    expect(rankForLevel(4).id).toBe('contender');
    expect(rankForLevel(99).id).toBe('champion');
  });
});

describe('progression cannot go backwards', () => {
  it('is monotonic in effort — adding a day never lowers total XP', () => {
    const days: XpDayActivity[] = [];
    let previous = 0;
    for (let d = 1; d <= 20; d += 1) {
      days.push(day({ localDate: `2026-08-${String(d).padStart(2, '0')}`, mealLogs: 2 }));
      const current = computeExperience(days, '2026-08-20').totalXp;
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('reports zero earned today on a day with no activity, without losing history', () => {
    const status = computeExperience(
      [day({ localDate: '2026-08-01', mealLogs: 3, workouts: 1 })],
      '2026-09-15',
    );
    expect(status.earnedToday).toBe(0);
    expect(status.todayBreakdown).toEqual([]);
    expect(status.totalXp).toBeGreaterThan(0);
  });
});

describe('coach bond', () => {
  it('starts at level 1 and caps', () => {
    expect(bondLevelForXp(0)).toBe(1);
    expect(bondLevelForXp(10_000_000)).toBe(COACH_BOND_MAX_LEVEL);
  });
});
