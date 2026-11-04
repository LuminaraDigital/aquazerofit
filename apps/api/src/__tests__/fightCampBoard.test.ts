/**
 * The squad week and board (AZF-P1 US-C5, §4.3): pure functions shared by
 * the API and the web client.
 */
import { describe, expect, it } from 'vitest';
import { squadBoard, squadWeekPoints, weekStartOf, type SquadMemberView } from '@aquazerofit/shared';
import { addDays } from '../platform/dates';

const member = (displayName: string, weekActiveDays: number | null, ref = displayName): SquadMemberView => ({
  ref,
  displayName,
  isMe: false,
  role: 'member',
  beltTier: null,
  weekActiveDays,
});

describe('weekStartOf', () => {
  it('answers the Monday of the week, Monday to Sunday', () => {
    // 2026-10-19 is a Monday.
    for (let i = 0; i < 7; i += 1) expect(weekStartOf(addDays('2026-10-19', i))).toBe('2026-10-19');
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26');
    expect(weekStartOf('2026-10-18')).toBe('2026-10-12');
    // Across a year boundary.
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
  });
});

describe('squadWeekPoints', () => {
  it('counts each active day of the week once, 0 to 7', () => {
    const week = '2026-10-19';
    expect(squadWeekPoints([], week)).toBe(0);
    expect(squadWeekPoints(['2026-10-19', '2026-10-19', '2026-10-25'], week)).toBe(2);
    expect(squadWeekPoints(['2026-10-18', '2026-10-26'], week)).toBe(0);
    const everyDay = Array.from({ length: 30 }, (_, i) => addDays('2026-10-10', i));
    expect(squadWeekPoints(everyDay, week)).toBe(7);
  });

  it('stays inside 0 to 7 for any history', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 200; n += 1) {
      const dates = Array.from({ length: Math.floor(rand() * 40) }, () => addDays('2026-10-01', Math.floor(rand() * 60)));
      const points = squadWeekPoints(dates, weekStartOf(addDays('2026-10-01', Math.floor(rand() * 60))));
      expect(points).toBeGreaterThanOrEqual(0);
      expect(points).toBeLessThanOrEqual(7);
    }
  });
});

describe('squadBoard', () => {
  it('ranks by days with shared ranks for ties and no last place', () => {
    const board = squadBoard([
      member('Rizal', 3),
      member('Mia', 5),
      member('Jay', 3),
      member('Grace', 0),
      member('Ana', 0),
    ]);
    expect(board.ranked.map((r) => [r.member.displayName, r.rank])).toEqual([
      ['Mia', 1],
      ['Jay', 2],
      ['Rizal', 2],
    ]);
    expect(board.warmingUp.map((m) => m.displayName)).toEqual(['Ana', 'Grace']);
    expect(board.hidden).toEqual([]);
  });

  it('keeps hidden members out of the ranking, alphabetically', () => {
    const board = squadBoard([member('Zed', null), member('Bo', null), member('Cy', 1)]);
    expect(board.ranked.map((r) => r.member.displayName)).toEqual(['Cy']);
    expect(board.hidden.map((m) => m.displayName)).toEqual(['Bo', 'Zed']);
  });
});
