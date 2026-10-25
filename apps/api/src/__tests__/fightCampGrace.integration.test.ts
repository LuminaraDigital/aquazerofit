/**
 * S3 Cut Man grace over HTTP (AZF-P1 US-E1, US-E2).
 *
 * The clock is pinned (Date only): earning and bridging are both counted in
 * calendar days of a season. Each case registers its own person after
 * pinning, so an access token minted on another day never expires mid-case.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { addDays } = await import('../platform/dates');
const { engageRepo } = await import('../modules/fightCamp/repo');

let h: FightCampHarness;

const day = (n: number) => addDays(SEASON_ONE_STARTS_ON, n);
const pin = (n: number) => vi.setSystemTime(new Date(`${day(n)}T09:00:00.000Z`));
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => day(from + i));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  pin(0);
  h = await fightCampHarness('fc-grace');
});

afterEach(() => h.disableAll());

afterAll(async () => {
  vi.useRealTimers();
  await h.cleanup();
});

const grace = (who: Person) => request(h.app).get(`${h.base}/grace`).set(who.auth());
const summary = (who: Person) => request(h.app).get(`${h.base}/progress/summary`).set(who.auth());
const record = (who: Person) => request(h.app).get(`${h.base}/fight-record`).set(who.auth());

async function personAt(today: number, activeDays: string[]): Promise<Person> {
  pin(today);
  const who = await h.register('Mia');
  h.seedActive(who.userId, activeDays);
  return who;
}

describe('with Cut Man off', () => {
  it('answers 404 and leaves the progress summary as R1a computes it', async () => {
    const mia = await personAt(16, [...range(0, 13), day(16)]);
    expect((await grace(mia)).status).toBe(404);
    h.enable('enrol');
    expect((await grace(mia)).status).toBe(404);
    const res = await summary(mia);
    expect(res.status).toBe(200);
    expect(res.body.consistency.currentDays).toBe(1);
    expect((await record(mia)).body.fightCamp.grace).toBeNull();
    expect(await engageRepo().graceEntries(mia.userId)).toEqual([]);
  });
});

describe('earning (US-E1)', () => {
  it('earns one Cut Man day per seven active days in a season, banking at most two', async () => {
    h.enable('grace');
    const six = await personAt(6, range(0, 5));
    expect((await grace(six)).body).toEqual({ grace: { banked: 0, nextEarnInActiveDays: 1, lastApplied: null } });

    const seven = await personAt(7, range(0, 6));
    expect((await grace(seven)).body.grace).toEqual({ banked: 1, nextEarnInActiveDays: 7, lastApplied: null });

    const many = await personAt(25, range(0, 24));
    expect((await grace(many)).body.grace).toEqual({ banked: 2, nextEarnInActiveDays: 3, lastApplied: null });
    // One earn row per milestone reached: 7, 14 and 21. The third was not kept.
    // Rows written in one read share a timestamp, so their order is not the
    // claim here; the fold treats a batch of earns the same in any order.
    const earned = (await engageRepo().graceEntries(many.userId)).map((g) => g.milestone);
    expect(earned.sort((a, b) => a! - b!)).toEqual([7, 14, 21]);
  });

  it('carries the bank into the next season and counts the new season afresh', async () => {
    h.enable('grace');
    const mia = await personAt(58, range(0, 13));
    const res = await grace(mia);
    expect(res.body.grace.banked).toBe(2);
    expect(res.body.grace.nextEarnInActiveDays).toBe(7);
  });

  it('writes nothing new on a repeat read', async () => {
    h.enable('grace');
    const mia = await personAt(14, range(0, 13));
    await grace(mia);
    const first = await engageRepo().graceEntries(mia.userId);
    await grace(mia);
    await record(mia);
    expect(await engageRepo().graceEntries(mia.userId)).toEqual(first);
  });
});

describe('applying (US-E2)', () => {
  it('bridges the second missed day and keeps the run going', async () => {
    h.enable('grace');
    // Fourteen active days (two banked), then day 14 and day 15 missed.
    const mia = await personAt(16, [...range(0, 13), day(16)]);
    const res = await summary(mia);
    expect(res.body.consistency.currentDays).toBe(15);
    expect((await grace(mia)).body.grace).toEqual({
      banked: 1,
      nextEarnInActiveDays: 6,
      lastApplied: day(14),
    });
    const applied = (await engageRepo().graceEntries(mia.userId)).filter((g) => g.entry === 'applied');
    expect(applied.map((g) => g.localDate)).toEqual([day(14)]);
  });

  it('never counts a bridged day as active, for belts or the window', async () => {
    h.enable('grace');
    const active = [...range(0, 13), day(16)];
    const mia = await personAt(16, active);
    const res = await summary(mia);
    expect(res.body.consistency.activeDays).toBe(active.length);
    const fr = await record(mia);
    expect(fr.body.fightRecord.current.activeDays).toBe(active.length);
    expect(fr.body.fightRecord.current.tier).toBe('blue');
    expect(fr.body.fightCamp.grace.lastApplied).toBe(day(14));
  });

  it('spends nothing on a gap that leads back to no active day', async () => {
    h.enable('grace');
    const mia = await personAt(20, range(0, 13));
    await summary(mia);
    expect((await grace(mia)).body.grace.banked).toBe(2);
    expect((await engageRepo().graceEntries(mia.userId)).some((g) => g.entry === 'applied')).toBe(false);
  });

  it('keeps achievements on the un-bridged run', async () => {
    h.enable('grace');
    const mia = await personAt(16, [...range(0, 5), day(8), day(9), day(10), day(11), day(12), day(13), day(16)]);
    const bridged = await summary(mia);
    h.disableAll();
    const plain = await summary(mia);
    expect(bridged.body.achievements).toEqual(plain.body.achievements);
  });
});
