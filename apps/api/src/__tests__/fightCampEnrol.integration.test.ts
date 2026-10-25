/**
 * S2 Fight Camp enrolment over HTTP (AZF-P1 US-A1, US-A2, §5.3).
 *
 * The clock is pinned (Date only) because the fresh-start window is a span
 * of calendar days inside a season.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON, seasonTheme } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { addDays } = await import('../platform/dates');

let h: FightCampHarness;
let mia: Person;

const pin = (dayOfSeason: number) =>
  vi.setSystemTime(new Date(`${addDays(SEASON_ONE_STARTS_ON, dayOfSeason)}T09:00:00.000Z`));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  pin(3);
  h = await fightCampHarness('fc-enrol');
  mia = await h.register('Mia');
});

afterEach(() => {
  h.disableAll();
  pin(3);
});

afterAll(async () => {
  vi.useRealTimers();
  await h.cleanup();
});

const read = (who: Person) => request(h.app).get(`${h.base}/fight-record`).set(who.auth());
const enrol = (who: Person, body: unknown = {}) =>
  request(h.app).post(`${h.base}/fight-camp/enrolments`).set(who.auth()).send(body as object);

describe('with Fight Camp off', () => {
  it('answers 404 and leaves GET /fight-record exactly as R1a shaped it', async () => {
    expect((await enrol(mia)).status).toBe(404);
    h.enable(); // master switch only
    expect((await enrol(mia)).status).toBe(404);
    const res = await read(mia);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['fightRecord']);
  });

  it('stays off for a user outside the rollout bucket', async () => {
    h.enable('enrol');
    process.env.FIGHT_RECORD_ROLLOUT_PERCENT = '0';
    expect((await enrol(mia)).status).toBe(404);
    expect(await read(mia).then((r) => r.body)).toEqual({ fightRecord: null });
  });
});

describe('POST /fight-camp/enrolments', () => {
  it('requires authentication', async () => {
    h.enable('enrol');
    expect((await request(h.app).post(`${h.base}/fight-camp/enrolments`).send({})).status).toBe(401);
  });

  it('enrols once and answers the same enrolment on every repeat', async () => {
    h.enable('enrol');
    const rizal = await h.register('Rizal');
    const first = await enrol(rizal, { source: 'dashboard' });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      enrolment: {
        seasonNumber: 1,
        seasonName: 'Fight Camp',
        source: 'dashboard',
        enrolledAt: expect.any(String),
      },
    });
    const again = await enrol(rizal, { source: 'recap' });
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
  });

  it('defaults the source and rejects one it does not know', async () => {
    h.enable('enrol');
    const jay = await h.register('Jay');
    expect((await enrol(jay, { source: 'billboard' })).status).toBe(400);
    const res = await enrol(jay);
    expect(res.status).toBe(201);
    expect(res.body.enrolment.source).toBe('dashboard');
  });
});

describe('the fightCamp block on GET /fight-record', () => {
  it('carries the season theme and the enrolment state', async () => {
    h.enable('enrol');
    const grace = await h.register('Grace');
    const before = await read(grace);
    expect(before.body.fightCamp).toEqual({
      theme: seasonTheme(1),
      enrolment: { enrolled: false, prompt: 'primary' },
      grace: null,
    });
    await enrol(grace);
    expect((await read(grace)).body.fightCamp.enrolment).toEqual({ enrolled: true, prompt: 'primary' });
  });

  it('moves the prompt to a quiet placement after the first 14 days of a season', async () => {
    h.enable('enrol');
    // Each person registers after the clock moves: an access token minted at
    // day 3 has long expired by day 13.
    pin(13);
    expect((await read(await h.register('Day13'))).body.fightCamp.enrolment.prompt).toBe('primary');
    pin(14);
    expect((await read(await h.register('Day14'))).body.fightCamp.enrolment.prompt).toBe('secondary');
    // A new season opens a new fresh-start window.
    pin(56);
    const next = (await read(await h.register('Season2'))).body;
    expect(next.fightRecord.current.season.number).toBe(2);
    expect(next.fightCamp).toEqual({
      theme: seasonTheme(2),
      enrolment: { enrolled: false, prompt: 'primary' },
      grace: null,
    });
  });

  it('awards belts whether or not the user enrolled', async () => {
    h.enable('enrol');
    const solo = await h.register('Solo');
    h.seedActive(solo.userId, [0, 1, 2].map((d) => addDays(SEASON_ONE_STARTS_ON, d)));
    const res = await read(solo);
    expect(res.body.fightCamp.enrolment.enrolled).toBe(false);
    expect(res.body.fightRecord.current.tier).toBe('white');
  });
});

describe('season themes', () => {
  it('gives every season one accent and one line, repeating every six seasons', () => {
    const themes = [1, 2, 3, 4, 5, 6].map(seasonTheme);
    expect(new Set(themes.map((t) => t.accent)).size).toBe(6);
    expect(new Set(themes.map((t) => t.coachLine)).size).toBe(6);
    expect(seasonTheme(7)).toEqual(seasonTheme(1));
    for (const theme of themes) expect(theme.accent).toMatch(/^#[0-9a-f]{6}$/);
  });
});
