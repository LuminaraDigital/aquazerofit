/**
 * S9 season recap over HTTP (AZF-P1 US-A3).
 *
 * The clock is pinned (Date only): a recap belongs to a finished season and
 * is offered for the first 14 days after it ends.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_LENGTH_DAYS, SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { addDays } = await import('../platform/dates');
const { engageRepo } = await import('../modules/fightCamp/repo');

let h: FightCampHarness;
const day = (n: number) => addDays(SEASON_ONE_STARTS_ON, n);
const pin = (n: number) => vi.setSystemTime(new Date(`${day(n)}T09:00:00.000Z`));
const SEASON_TWO = SEASON_LENGTH_DAYS;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  pin(SEASON_TWO + 3);
  h = await fightCampHarness('fc-recap');
});

afterEach(() => {
  h.disableAll();
  pin(SEASON_TWO + 3);
});

afterAll(async () => {
  vi.useRealTimers();
  await h.cleanup();
});

const recap = (who: Person, season: number | string) =>
  request(h.app).get(`${h.base}/fight-camp/recap/${season}`).set(who.auth());
const status = async (who: Person) => (await request(h.app).get(`${h.base}/fight-record`).set(who.auth())).body.fightCamp;

/** Active on days 0-13 and 20-29 of season 1: 24 days, a purple belt. */
const SEASON_ONE_DAYS = [...Array.from({ length: 14 }, (_, i) => day(i)), ...Array.from({ length: 10 }, (_, i) => day(20 + i))];

describe('GET /fight-camp/recap/:seasonNumber', () => {
  it('is off with enrolment off', async () => {
    const mia = await h.register('Mia');
    h.seedActive(mia.userId, SEASON_ONE_DAYS);
    expect((await recap(mia, 1)).status).toBe(404);
  });

  it('looks back on a finished season in days and cheers only', async () => {
    h.enable('enrol');
    const mia = await h.register('Mia');
    h.seedActive(mia.userId, SEASON_ONE_DAYS);
    await engageRepo().insertCheer({
      id: 'recap-in', fromKind: 'member', fromUserId: 'mate', coachId: null, toUserId: mia.userId,
      squadId: null, cheer: 'fire', localDate: day(5), createdAt: `${day(5)}T10:00:00.000Z`, seenAt: null,
    });
    await engageRepo().insertCheer({
      id: 'recap-out', fromKind: 'member', fromUserId: mia.userId, coachId: null, toUserId: 'mate',
      squadId: null, cheer: 'clap', localDate: day(6), createdAt: `${day(6)}T10:00:00.000Z`, seenAt: null,
    });
    const res = await recap(mia, 1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      recap: {
        seasonNumber: 1,
        seasonName: 'Fight Camp',
        startsOn: day(0),
        endsOn: day(SEASON_LENGTH_DAYS - 1),
        belt: 'purple',
        activeDays: 24,
        longestRun: 14,
        cheersGiven: 1,
        cheersReceived: 1,
        squadName: null,
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/weight|kcal|calor|macro|photo|meal/i);
  });

  it('names the squad the person ended the season in', async () => {
    h.enable('enrol', 'squads');
    pin(10);
    const rizal = await h.register('Rizal');
    h.seedActive(rizal.userId, SEASON_ONE_DAYS);
    await request(h.app).post(`${h.base}/squads`).set(rizal.auth()).send({ name: 'Corner Crew', consent: true });
    pin(SEASON_TWO + 3);
    const later = await h.refresh(rizal);
    expect((await recap(later, 1)).body.recap.squadName).toBe('Corner Crew');
  });

  it('has no recap for the current season, an unstarted one, or one the person missed', async () => {
    h.enable('enrol');
    const jay = await h.register('Jay');
    h.seedActive(jay.userId, [day(SEASON_TWO + 1)]);
    expect((await recap(jay, 2)).status).toBe(404);
    expect((await recap(jay, 1)).status).toBe(404);
    expect((await recap(jay, 0)).status).toBe(404);
    expect((await recap(jay, 'one')).status).toBe(404);
  });
});

describe('the recap offer', () => {
  it('appears for the first 14 days after a season ends, to people who showed up in it', async () => {
    h.enable('enrol');
    const mia = await h.register('Mia');
    h.seedActive(mia.userId, SEASON_ONE_DAYS);
    expect((await status(mia)).recap).toEqual({ seasonNumber: 1, seasonName: 'Fight Camp' });

    const absent = await h.register('Absent');
    expect((await status(absent)).recap).toBeNull();

    pin(SEASON_TWO + 15);
    expect((await status(await h.refresh(mia))).recap).toBeNull();
  });

  it('does not exist during season one', async () => {
    h.enable('enrol');
    pin(20);
    const early = await h.register('Early');
    h.seedActive(early.userId, [day(1)]);
    expect((await status(early)).recap).toBeNull();
  });
});
