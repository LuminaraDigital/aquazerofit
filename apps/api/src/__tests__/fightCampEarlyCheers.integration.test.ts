/**
 * S7 early cheers over HTTP (AZF-P1 US-D2).
 *
 * The clock is pinned (Date only): "week one" is counted in calendar days
 * from the account's first day.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { addDays } = await import('../platform/dates');
const { getStore } = await import('../platform/store');
const { engageRepo } = await import('../modules/fightCamp/repo');
const { earlyCheersArm, earlyCheersBucket } = await import('../modules/fightCamp/earlyCheers');
const { rolloutBucket } = await import('../modules/fightRecord/service');

let h: FightCampHarness;
const START = addDays(SEASON_ONE_STARTS_ON, 7);
const pin = (offset: number) => vi.setSystemTime(new Date(`${addDays(START, offset)}T09:00:00.000Z`));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  pin(0);
  h = await fightCampHarness('fc-early-cheers');
});

afterEach(() => {
  h.disableAll();
  delete process.env.FC_EARLY_CHEERS_PERCENT;
  pin(0);
});

afterAll(async () => {
  vi.useRealTimers();
  await h.cleanup();
});

const inbox = (who: Person) => request(h.app).get(`${h.base}/cheers`).set(who.auth());
const record = (who: Person) => request(h.app).get(`${h.base}/fight-record`).set(who.auth());

/** Registered on START, then the clock moves to `today` (a fresh token is minted there). */
async function newcomer(activeOffsets: number[], today: number, opts: { age?: number } = {}): Promise<Person> {
  pin(0);
  const first = await h.register('Newcomer', { age: opts.age ?? 30 });
  h.seedActive(first.userId, activeOffsets.map((d) => addDays(START, d)));
  pin(today);
  return h.refresh(first);
}

/** A newcomer whose bucket is above 0, so some share puts them in the holdout. */
async function holdoutCapable(activeOffsets: number[], today: number): Promise<Person> {
  for (;;) {
    const person = await newcomer(activeOffsets, today);
    if (earlyCheersBucket(person.userId) > 0) return person;
  }
}

/** Move the clock to `day` and read the inbox there, as a returning visit would. */
async function visit(person: Person, day: number) {
  pin(day);
  return inbox(await h.refresh(person));
}

describe('the treatment arm', () => {
  it('gets a coach cheer on each of the first three active days of week one, labelled automated', async () => {
    h.enable('cheers');
    process.env.FC_EARLY_CHEERS_PERCENT = '100';
    const mia = await newcomer([0, 2, 3, 5], 0);
    for (const day of [0, 2, 3, 5, 6]) expect((await visit(mia, day)).status).toBe(200);
    const res = await visit(mia, 6);
    expect(res.body.cheers).toHaveLength(3);
    for (const cheer of res.body.cheers) {
      expect(cheer.from).toEqual({ kind: 'coach', coachName: 'Akin Celsus', automated: true });
    }
    const dates = (await engageRepo().coachCheersTo(mia.userId)).map((c) => [c.localDate, c.cheer]);
    expect(dates).toEqual([
      [addDays(START, 0), 'glove'],
      [addDays(START, 2), 'fire'],
      [addDays(START, 3), 'muscle'],
    ]);
    expect((await engageRepo().exportUser(mia.userId)).experiments).toEqual([
      expect.objectContaining({ experiment: 'early_cheers', arm: 'treatment' }),
    ]);

    // Idempotent: more reads, no more cheers.
    await inbox(mia);
    await record(mia);
    expect(await engageRepo().coachCheersTo(mia.userId)).toHaveLength(3);
  });

  it('cheers a day shown up on that day or the next visit, and does not backfill a late first one', async () => {
    h.enable('cheers');
    process.env.FC_EARLY_CHEERS_PERCENT = '100';
    const jay = await newcomer([0], 1);
    expect((await record(jay)).body.fightCamp.cheers).toEqual({ unseen: 1 });
    expect(await engageRepo().coachCheersTo(jay.userId)).toHaveLength(1);

    const late = await newcomer([0, 1, 2], 5);
    expect((await inbox(late)).body.cheers).toEqual([]);
  });

  it('never sends a fourth, even when an earlier day stops counting', async () => {
    h.enable('cheers');
    process.env.FC_EARLY_CHEERS_PERCENT = '100';
    const kim = await newcomer([0, 1, 2, 3], 0);
    for (const day of [0, 1, 2]) await visit(kim, day);
    expect(await engageRepo().coachCheersTo(kim.userId)).toHaveLength(3);
    getStore().delete('logs', `ml-${kim.userId}-${addDays(START, 0)}`);
    await visit(kim, 3);
    expect(await engageRepo().coachCheersTo(kim.userId)).toHaveLength(3);
  });

  it('keeps the arm on record when the share changes', async () => {
    h.enable('cheers');
    process.env.FC_EARLY_CHEERS_PERCENT = '100';
    const lee = await holdoutCapable([0, 1], 0);
    await visit(lee, 0);
    process.env.FC_EARLY_CHEERS_PERCENT = String(earlyCheersBucket(lee.userId));
    expect(earlyCheersArm(lee.userId)).toBe('holdout');
    await visit(lee, 1);
    expect(await engageRepo().coachCheersTo(lee.userId)).toHaveLength(2);
  });

  it('counts the first day in the calendar of the read, not in UTC', async () => {
    h.enable('cheers');
    process.env.FC_EARLY_CHEERS_PERCENT = '100';
    // 02:00 UTC is the evening before in Los Angeles: their first day is START.
    vi.setSystemTime(new Date(`${addDays(START, 1)}T02:00:00.000Z`));
    const sam = await h.register('Sam', { timezone: 'America/Los_Angeles' });
    h.seedActive(sam.userId, [START]);
    expect((await inbox(sam)).body.cheers).toHaveLength(1);
    expect((await engageRepo().coachCheersTo(sam.userId)).map((c) => c.localDate)).toEqual([START]);
  });
});

describe('the holdout and everyone else', () => {
  it('records the holdout arm and sends no coach cheers', async () => {
    h.enable('cheers');
    process.env.FC_EARLY_CHEERS_PERCENT = '100';
    const grace = await holdoutCapable([0, 1, 2], 3);
    process.env.FC_EARLY_CHEERS_PERCENT = String(earlyCheersBucket(grace.userId));
    expect((await inbox(grace)).body.cheers).toEqual([]);
    expect((await engageRepo().exportUser(grace.userId)).experiments).toEqual([
      expect.objectContaining({ arm: 'holdout' }),
    ]);
  });

  it('runs nothing at a share of 0: no arm, no cheer, even for an arm on record', async () => {
    h.enable('cheers');
    process.env.FC_EARLY_CHEERS_PERCENT = '0';
    const off = await newcomer([0, 1, 2], 2);
    expect((await inbox(off)).body.cheers).toEqual([]);
    expect((await engageRepo().exportUser(off.userId)).experiments).toEqual([]);

    process.env.FC_EARLY_CHEERS_PERCENT = '100';
    const on = await newcomer([0, 1], 0);
    await visit(on, 0);
    process.env.FC_EARLY_CHEERS_PERCENT = '0';
    await visit(on, 1);
    expect(await engageRepo().coachCheersTo(on.userId)).toHaveLength(1);
  });

  it('does nothing after week one, and nothing for a minor', async () => {
    h.enable('cheers');
    process.env.FC_EARLY_CHEERS_PERCENT = '100';
    const late = await newcomer([0, 1, 2], 8);
    expect((await inbox(late)).body.cheers).toEqual([]);
    expect((await engageRepo().exportUser(late.userId)).experiments).toEqual([]);

    const teen = await newcomer([0, 1, 2], 3, { age: 16 });
    expect((await inbox(teen)).status).toBe(403);
    expect((await record(teen)).body.fightCamp.cheers).toBeNull();
    expect(await engageRepo().coachCheersTo(teen.userId)).toEqual([]);
  });

  it('buckets by a hash salted apart from the rollout bucket', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `usr-${i}`);
    expect(ids.map(earlyCheersBucket)).toEqual(ids.map(earlyCheersBucket));
    const same = ids.filter((id) => earlyCheersBucket(id) === rolloutBucket(id)).length;
    expect(same).toBeLessThan(20);
  });
});

describe('the squad welcome prompt (US-D2 AC3)', () => {
  it('offers one cheer for a new member until it is sent', async () => {
    h.enable('squads', 'cheers');
    pin(0);
    const owner = await h.register('Owner');
    // An older account: backdate it so only the newcomer is new.
    const ownerUser = getStore().byId<{ id: string; createdAt: string }>('users', owner.userId)!;
    getStore().upsert('users', { ...ownerUser, createdAt: '2026-01-01T00:00:00.000Z' });
    const made = await request(h.app).post(`${h.base}/squads`).set(owner.auth()).send({ name: 'Corner Crew', consent: true });
    vi.setSystemTime(Date.now() + 1000);
    const fresh = await h.register('Fresh');
    await request(h.app).post(`${h.base}/squads/join`).set(fresh.auth()).send({ code: made.body.squad.inviteCode, consent: true });

    const view = (await request(h.app).get(`${h.base}/squads/current`).set(owner.auth())).body.squad;
    const freshRow = view.members.find((m: { displayName: string }) => m.displayName === 'Fresh');
    expect(freshRow.welcome).toBe(true);
    expect(view.members.find((m: { isMe: boolean }) => m.isMe).welcome).toBe(false);

    await request(h.app).post(`${h.base}/cheers`).set(owner.auth()).send({ to: freshRow.ref, cheer: 'clap' });
    const after = (await request(h.app).get(`${h.base}/squads/current`).set(owner.auth())).body.squad;
    expect(after.members.find((m: { displayName: string }) => m.displayName === 'Fresh').welcome).toBe(false);

    // The newcomer sees no prompt for the long-standing owner.
    const theirs = (await request(h.app).get(`${h.base}/squads/current`).set(fresh.auth())).body.squad;
    expect(theirs.members.every((m: { welcome: boolean }) => m.welcome === false)).toBe(true);
  });
});
