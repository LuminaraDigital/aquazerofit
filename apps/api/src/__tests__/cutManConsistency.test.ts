/**
 * Cut Man days in the consistency run (AZF-P1 US-E2, §4.3, §10.1).
 *
 * Three guarantees, in the order a regression would hurt:
 *
 *  1. With no bridged dates the output is byte-identical to R1a. The hash
 *     below was recorded by running this exact generator against the
 *     consistency code as it stood before Cut Man existed (6a80efd).
 *  2. A bridged date never counts as an active day: the window count is the
 *     same with or without bridges, so belts and squad points cannot move.
 *  3. Bridges are planned only where they save a run that reaches another
 *     active day, inside the last seven days, up to the bank.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MealLog } from '@aquazerofit/shared';
import { addDays } from '../platform/dates';
import { computeConsistency, planCutManBridges, type UserActivity } from '../modules/progress/service';

const TODAY = '2026-12-01';

function activityOn(dates: readonly string[]): UserActivity {
  return {
    meals: dates.map((localDate, i) => ({ id: `m${i}`, localDate, loggedAt: `${localDate}T12:00:00.000Z` }) as MealLog),
    waters: [],
    weights: [],
    completedSessions: [],
  };
}

/** mulberry32: a tiny seeded PRNG, so the histories are the same on every run. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomHistories(count: number): string[][] {
  const rand = prng(20261025);
  return Array.from({ length: count }, () => {
    const density = rand();
    const dates: string[] = [];
    for (let back = 0; back < 120; back += 1) if (rand() < density) dates.push(addDays(TODAY, -back));
    return dates;
  });
}

const ago = (n: number) => addDays(TODAY, -n);

describe('computeConsistency without bridges', () => {
  it('is byte-identical to the R1a output across 400 seeded histories', () => {
    const outputs = randomHistories(400).map((dates) => computeConsistency(activityOn(dates), TODAY));
    const digest = createHash('sha256').update(JSON.stringify(outputs)).digest('hex');
    expect(digest).toBe(R1A_DIGEST);
  });

  it('treats an empty bridge set exactly like no options', () => {
    for (const dates of randomHistories(50)) {
      const activity = activityOn(dates);
      expect(computeConsistency(activity, TODAY, { bridgedDates: new Set() })).toEqual(
        computeConsistency(activity, TODAY),
      );
    }
  });
});

describe('computeConsistency with bridges', () => {
  it('carries the run across a bridged day without counting it as active', () => {
    // Active today and 4 days ago; yesterday is the built-in grace day, two
    // days ago would end the run, so three days ago is bridged.
    const activity = activityOn([ago(0), ago(4), ago(5)]);
    const plain = computeConsistency(activity, TODAY);
    expect(plain.currentDays).toBe(1);

    const bridgedDates = new Set([ago(2), ago(3)]);
    const bridged = computeConsistency(activity, TODAY, { bridgedDates });
    expect(bridged.currentDays).toBe(3);
    expect(bridged.activeDays).toBe(plain.activeDays);
    expect(bridged.graceRemaining).toBe(0);
  });

  it('never changes the active-day count, whatever is bridged', () => {
    const rand = prng(7);
    for (const dates of randomHistories(100)) {
      const active = new Set(dates);
      const bridgedDates = new Set<string>();
      for (let back = 0; back < 30; back += 1) {
        if (!active.has(ago(back)) && rand() < 0.3) bridgedDates.add(ago(back));
      }
      const activity = activityOn(dates);
      const withBridges = computeConsistency(activity, TODAY, { bridgedDates });
      const without = computeConsistency(activity, TODAY);
      expect(withBridges.activeDays).toBe(without.activeDays);
      expect(withBridges.lastActiveDate).toBe(without.lastActiveDate);
      expect(withBridges.currentDays).toBeGreaterThanOrEqual(without.currentDays);
      expect(withBridges.bestDays).toBeGreaterThanOrEqual(without.bestDays);
    }
  });

  it('keeps a bridged run out of the resting state', () => {
    // Nothing today or for three days; four days ago active.
    const activity = activityOn([ago(4), ago(5), ago(6)]);
    expect(computeConsistency(activity, TODAY).state).toBe('resting');
    const bridged = computeConsistency(activity, TODAY, { bridgedDates: new Set([ago(2), ago(3)]) });
    expect(bridged.state).not.toBe('resting');
    expect(bridged.currentDays).toBe(3);
  });
});

describe('planCutManBridges', () => {
  const plan = (dates: string[], bank: number, bridged: string[] = []) =>
    planCutManBridges(new Set(dates), TODAY, new Set(bridged), bank);
  const spends = (dates: string[], bank: number, bridged: string[] = []) => plan(dates, bank, bridged).commit;

  it('bridges the newest miss and leaves the built-in grace for the one behind it', () => {
    // Active today and three days ago: two misses, one grace day, one bridge.
    expect(spends([ago(0), ago(3)], 2)).toEqual([ago(1)]);
  });

  it('spends nothing when the built-in grace already covers the gap', () => {
    expect(spends([ago(0), ago(2)], 2)).toEqual([]);
  });

  it('spends up to the bank, and nothing if the bank cannot reach an active day', () => {
    expect(spends([ago(0), ago(4)], 2)).toEqual([ago(1), ago(2)]);
    expect(plan([ago(0), ago(4)], 1)).toEqual({ commit: [], standBy: [] });
    expect(plan([ago(0), ago(4)], 0)).toEqual({ commit: [], standBy: [] });
  });

  it('never spends on misses that lead back to nothing', () => {
    expect(plan([], 2)).toEqual({ commit: [], standBy: [] });
    expect(plan([ago(0)], 2)).toEqual({ commit: [], standBy: [] });
    expect(plan([ago(9)], 2)).toEqual({ commit: [], standBy: [] });
  });

  it('keeps the long run when an old miss already used the built-in grace (review case)', () => {
    // Forty days of history, missed only 20 days ago and yesterday. Giving the
    // grace day to yesterday would end the run at 20 days ago; bridging
    // yesterday instead keeps all of it.
    const dates = Array.from({ length: 40 }, (_, i) => ago(i)).filter((d) => d !== ago(20) && d !== ago(1));
    const decided = plan(dates, 2);
    expect(decided).toEqual({ commit: [ago(1)], standBy: [] });
    const activity = activityOn(dates);
    const kept = computeConsistency(activity, TODAY, { bridgedDates: new Set(decided.commit) });
    expect(kept.currentDays).toBe(38);
    expect(computeConsistency(activity, TODAY).currentDays).toBe(19);
  });

  it('stands by instead of spending while nothing has been logged since the gap (review case)', () => {
    // Active through three days ago, nothing since. Yesterday is the grace
    // day's to cover; two days ago would need a bridge, but nobody is back.
    expect(plan([ago(3), ago(4)], 2)).toEqual({ commit: [], standBy: [ago(1)] });
    // Back today: now it is spent.
    expect(plan([ago(0), ago(3), ago(4)], 2)).toEqual({ commit: [ago(1)], standBy: [] });
  });

  it('reaches no further back than the six days before today', () => {
    // Six days ago is the oldest date a bridge can cover; the grace day takes
    // the miss behind it.
    expect(spends([ago(0), ago(1), ago(2), ago(3), ago(4), ago(5), ago(8)], 2)).toEqual([ago(6)]);
    // Both misses older than that: nothing to bridge, nothing spent.
    expect(plan([ago(0), ago(1), ago(2), ago(3), ago(4), ago(5), ago(6), ago(9)], 2)).toEqual({
      commit: [],
      standBy: [],
    });
  });

  it('steps over days already bridged without spending again', () => {
    expect(spends([ago(0), ago(4)], 2, [ago(1), ago(2)])).toEqual([]);
    expect(spends([ago(0), ago(5)], 1, [ago(1), ago(2)])).toEqual([ago(3)]);
  });

  it('does not charge an incomplete today', () => {
    // Today missed (not charged), yesterday active, then two misses back to
    // an active day four days ago: one bridge, one grace day.
    expect(plan([ago(1), ago(4)], 2)).toEqual({ commit: [ago(2)], standBy: [] });
  });
});

/** Recorded from 6a80efd's computeConsistency with the generator above. */
const R1A_DIGEST = '8f1941fce7122297ca35ac5613908da56b5bae64e99e9c16af510970cf02f432';
