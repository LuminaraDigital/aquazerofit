/**
 * S6 cheers and nudges over HTTP (AZF-P1 US-D1, US-D3, §5.3).
 *
 * The clock is pinned (Date only): "one a day" and quiet hours are both
 * calendar rules. Telegram is the only thing reached over fetch, stubbed.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { addDays } = await import('../platform/dates');
const { getStore } = await import('../platform/store');
const { engageRepo } = await import('../modules/fightCamp/repo');
const { saveConsents } = await import('../modules/me/service');
const { resetRateLimiter } = await import('../platform/rateLimiter');
const { inQuietHours, localHour } = await import('../modules/fightCamp/nudges');

let h: FightCampHarness;
const DAY = addDays(SEASON_ONE_STARTS_ON, 9);
/** 10:00 in Sydney (UTC+11 in October): inside waking hours. */
const MORNING_UTC = `${addDays(DAY, -1)}T23:00:00.000Z`;

const telegram: Array<{ method: string; body: Record<string, unknown> }> = [];

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${DAY}T09:00:00.000Z`));
  h = await fightCampHarness('fc-cheers');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      telegram.push({ method: url.split('/').pop()!, body: JSON.parse(init.body) as Record<string, unknown> });
      return { json: async () => ({ ok: true, result: true }) };
    }),
  );
});

afterEach(() => {
  h.disableAll();
  delete process.env.TELEGRAM_BOT_TOKEN;
  telegram.length = 0;
  vi.setSystemTime(new Date(`${DAY}T09:00:00.000Z`));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await h.cleanup();
});

const post = (who: Person, path: string, body: object = {}) =>
  request(h.app).post(`${h.base}${path}`).set(who.auth()).send(body);
const get = (who: Person, path: string) => request(h.app).get(`${h.base}${path}`).set(who.auth());

async function squadOf(size: number) {
  const people: Person[] = [];
  for (let i = 0; i < size; i += 1) people.push(await h.register(`Mate${i}`));
  const made = await post(people[0]!, '/squads', { name: 'Corner Crew', consent: true });
  for (const person of people.slice(1)) {
    vi.setSystemTime(Date.now() + 1000);
    await post(person, '/squads/join', { code: made.body.squad.inviteCode, consent: true });
  }
  const view = (await get(people[0]!, '/squads/current')).body.squad;
  const refOf = (i: number) => view.members.find((m: { displayName: string }) => m.displayName === `Mate${i}`).ref as string;
  return { people, squad: view as { id: string }, refOf };
}

const cheer = (who: Person, to: string, kind = 'fire') => post(who, '/cheers', { to, cheer: kind });

describe('with cheers off', () => {
  it('answers 404 even inside a squad', async () => {
    h.enable('squads');
    const { people, refOf } = await squadOf(2);
    expect((await cheer(people[0]!, refOf(1))).status).toBe(404);
    expect((await get(people[0]!, '/cheers')).status).toBe(404);
    const fr = await get(people[0]!, '/fight-record');
    expect(fr.body.fightCamp.cheers).toBeNull();
  });
});

describe('sending (US-D1)', () => {
  it('sends one cheer per mate per day and says "sent today" after', async () => {
    h.enable('squads', 'cheers');
    const { people, refOf } = await squadOf(2);
    const first = await cheer(people[0]!, refOf(1));
    expect(first.status).toBe(201);
    expect(first.body.cheer).toMatchObject({ cheer: 'fire', id: expect.any(String) });
    const again = await cheer(people[0]!, refOf(1), 'clap');
    expect(again.status).toBe(409);
    expect(again.body.details.reason).toBe('cheer_already_today');

    const board = (await get(people[0]!, '/squads/current')).body.squad;
    expect(board.members.find((m: { displayName: string }) => m.displayName === 'Mate1').cheeredToday).toBe(true);

    // The day comes from the sender's stored timezone, not the header: a
    // header claiming another zone cannot buy a second cheer...
    const sender = getStore().byId<{ id: string }>('users', people[0]!.userId)!;
    getStore().upsert('users', { ...sender, timezone: 'UTC' });
    const headerTrick = await request(h.app)
      .post(`${h.base}/cheers`)
      .set({ ...people[0]!.auth(), 'X-Timezone': 'Etc/GMT+12' })
      .send({ to: refOf(1), cheer: 'fire' });
    expect(headerTrick.status).toBe(409);
    // ...while a real change of zone (at 09:00 UTC it is still yesterday at
    // UTC-12) is a different day.
    getStore().upsert('users', { ...sender, timezone: 'Etc/GMT+12' });
    expect((await cheer(people[0]!, refOf(1))).status).toBe(201);
  });

  it('refuses outsiders, unknown refs, oneself and a cheer that is not one of the five, alike', async () => {
    h.enable('squads', 'cheers');
    const { people, refOf } = await squadOf(2);
    const { people: others, refOf: otherRef } = await squadOf(1);
    const outcomes = await Promise.all([
      cheer(people[0]!, otherRef(0)),
      cheer(others[0]!, refOf(1)),
      cheer(people[0]!, 'm_zzzzzzzzzzzz'),
      cheer(people[0]!, refOf(0)),
    ]);
    for (const res of outcomes) {
      expect(res.status).toBe(403);
      expect(res.body.details.reason).toBe('not_squad_mate');
    }
    expect((await cheer(people[0]!, refOf(1), 'trophy')).status).toBe(400);
    expect((await post(people[0]!, '/cheers', { to: refOf(1), cheer: 'fire', note: 'hi' })).status).toBe(201);
  });

  it('does not reach a mate outside the rollout, whose Fight Camp is off', async () => {
    h.enable('squads', 'cheers');
    const { rolloutBucket } = await import('../modules/fightRecord/service');
    // Find a squad where the second member buckets above the first.
    let pair: Awaited<ReturnType<typeof squadOf>> | null = null;
    for (let i = 0; i < 20 && !pair; i += 1) {
      const candidate = await squadOf(2);
      const [a, b] = candidate.people.map((p) => rolloutBucket(p.userId)) as [number, number];
      if (a < b) pair = candidate;
    }
    expect(pair).not.toBeNull();
    process.env.FIGHT_RECORD_ROLLOUT_PERCENT = String(rolloutBucket(pair!.people[1]!.userId));
    expect((await cheer(pair!.people[0]!, pair!.refOf(1))).status).toBe(403);
  });

  it('does not reach a mate who is no longer known to be an adult', async () => {
    h.enable('squads', 'cheers');
    const { people, refOf } = await squadOf(2);
    h.setAge(people[1]!.userId, 16);
    expect((await cheer(people[0]!, refOf(1))).status).toBe(403);
  });
});

describe('the inbox', () => {
  it('names the sender while they are a squad mate, and "A former squad mate" after', async () => {
    h.enable('squads', 'cheers');
    const { people, squad, refOf } = await squadOf(2);
    await cheer(people[0]!, refOf(1), 'muscle');
    const inbox = await get(people[1]!, '/cheers');
    expect(inbox.body).toEqual({
      cheers: [
        {
          id: expect.any(String),
          from: { kind: 'member', displayName: 'Mate0' },
          cheer: 'muscle',
          createdAt: expect.any(String),
          seen: false,
        },
      ],
      nextCursor: null,
    });
    expect((await get(people[1]!, '/fight-record')).body.fightCamp.cheers).toEqual({ unseen: 1 });

    await post(people[0]!, `/squads/${squad.id}/leave`);
    const after = await get(people[1]!, '/cheers');
    expect(after.body.cheers[0].from).toEqual({ kind: 'member', displayName: 'A former squad mate' });
    expect(JSON.stringify(after.body)).not.toContain(people[0]!.userId);
  });

  it('labels a coach cheer as automated', async () => {
    h.enable('squads', 'cheers');
    const mia = await h.register('Mia');
    await engageRepo().insertCheer({
      id: 'cheer-coach-1',
      fromKind: 'coach',
      fromUserId: null,
      coachId: 'akin',
      toUserId: mia.userId,
      squadId: null,
      cheer: 'glove',
      localDate: DAY,
      createdAt: new Date().toISOString(),
      seenAt: null,
    });
    const inbox = await get(mia, '/cheers');
    expect(inbox.body.cheers[0].from).toEqual({ kind: 'coach', coachName: 'Akin Celsus', automated: true });
  });

  it('pages newest first and marks only what was asked seen', async () => {
    h.enable('squads', 'cheers');
    const mia = await h.register('Mia');
    const base = Date.now();
    for (let i = 0; i < 25; i += 1) {
      await engageRepo().insertCheer({
        id: `cheer-page-${String(i).padStart(2, '0')}`,
        fromKind: 'member',
        fromUserId: `sender-${i}`,
        coachId: null,
        toUserId: mia.userId,
        squadId: null,
        cheer: 'clap',
        localDate: DAY,
        createdAt: new Date(base - i * 60_000).toISOString(),
        seenAt: null,
      });
    }
    const first = await get(mia, '/cheers');
    expect(first.body.cheers).toHaveLength(20);
    expect(first.body.cheers[0].id).toBe('cheer-page-00');
    const second = await get(mia, `/cheers?cursor=${first.body.nextCursor}`);
    expect(second.body.cheers.map((c: { id: string }) => c.id)).toEqual(
      ['20', '21', '22', '23', '24'].map((n) => `cheer-page-${n}`),
    );
    expect(second.body.nextCursor).toBeNull();
    // A cursor this API did not issue reads from the start rather than failing.
    expect((await get(mia, '/cheers?cursor=not-a-cursor')).body.cheers[0].id).toBe('cheer-page-00');

    const other = await h.register('Other');
    await engageRepo().insertCheer({
      id: 'cheer-for-someone-else',
      fromKind: 'member',
      fromUserId: 'sender-x',
      coachId: null,
      toUserId: other.userId,
      squadId: null,
      cheer: 'fire',
      localDate: DAY,
      createdAt: new Date(base).toISOString(),
      seenAt: null,
    });
    expect(
      (await post(mia, '/cheers/seen', { ids: ['cheer-page-00', 'cheer-page-01', 'cheer-for-someone-else'] })).status,
    ).toBe(204);
    expect((await get(mia, '/fight-record')).body.fightCamp.cheers).toEqual({ unseen: 23 });
    // Someone else's cheer stays unseen: marking is scoped to the recipient.
    expect((await engageRepo().cheersTo(other.userId, { since: '2000-01-01T00:00:00.000Z', limit: 5 }))[0]!.seenAt).toBeNull();
    // A cursor that only looks like a date reads from the start, never a 500.
    const sneaky = Buffer.from(JSON.stringify(['1', 'x'])).toString('base64url');
    expect((await get(mia, `/cheers?cursor=${sneaky}`)).body.cheers[0].id).toBe('cheer-page-00');
    expect((await post(mia, '/cheers/seen', { ids: Array.from({ length: 51 }, (_, i) => `x${i}`) })).status).toBe(400);
  });
});

describe('quiet hours', () => {
  it('runs from 21:00 to 08:00 in the person’s own zone', () => {
    expect([20, 21, 23, 0, 7, 8, 12].map(inQuietHours)).toEqual([false, true, true, true, true, false, false]);
    expect(localHour('Australia/Sydney', new Date('2026-10-28T23:00:00.000Z'))).toBe(10);
    expect(localHour('Not/AZone', new Date())).toBeNull();
  });
});

describe('bot nudges (US-D3)', () => {
  async function nudgeable(person: Person, timezone = 'Australia/Sydney'): Promise<number> {
    const tgId = 9_100_000 + Math.floor(Math.random() * 100_000);
    const user = getStore().byId<{ id: string }>('users', person.userId)!;
    getStore().upsert('users', { ...user, tgId, timezone });
    saveConsents(person.userId, {
      wellnessDataProcessing: true,
      aiPersonalisation: false,
      anonymisedAnalytics: false,
      reminders: true,
    });
    return tgId;
  }
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it('messages an opted-in mate once a day, in their waking hours, never twice', async () => {
    vi.setSystemTime(new Date(MORNING_UTC));
    h.enable('squads', 'cheers');
    process.env.TELEGRAM_BOT_TOKEN = '123456:cheers-integration';
    const { people, refOf } = await squadOf(3);
    const tgId = await nudgeable(people[2]!);
    await cheer(people[0]!, refOf(2));
    await settle();
    await cheer(people[1]!, refOf(2), 'clap');
    await settle();
    const sent = telegram.filter((t) => t.method === 'sendMessage');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toMatchObject({ chat_id: tgId });
    expect(String(sent[0]!.body.text)).toMatch(/^Mate0 sent you a 🔥 cheer on AquaZeroFit\.$/);
  });

  it('stays silent in quiet hours, without consent, with the kind off, or with no timezone', async () => {
    h.enable('squads', 'cheers');
    process.env.TELEGRAM_BOT_TOKEN = '123456:cheers-integration';

    // 22:00 in Sydney.
    vi.setSystemTime(new Date(`${DAY}T11:00:00.000Z`));
    const night = await squadOf(2);
    await nudgeable(night.people[1]!);
    await cheer(night.people[0]!, night.refOf(1));
    await settle();

    vi.setSystemTime(new Date(MORNING_UTC));
    const switchedOff = await squadOf(2);
    await nudgeable(switchedOff.people[1]!);
    const put = await request(h.app).put(`${h.base}/cheers/nudges`).set(switchedOff.people[1]!.auth()).send({ cheer: false });
    expect(put.body).toEqual({ nudges: { cheer: false } });
    expect((await get(switchedOff.people[1]!, '/cheers/nudges')).body).toEqual({ nudges: { cheer: false } });
    await cheer(switchedOff.people[0]!, switchedOff.refOf(1));
    await settle();

    const noTimezone = await squadOf(2);
    await nudgeable(noTimezone.people[1]!, '');
    await cheer(noTimezone.people[0]!, noTimezone.refOf(1));
    await settle();

    const noTelegram = await squadOf(2);
    saveConsents(noTelegram.people[1]!.userId, {
      wellnessDataProcessing: true,
      aiPersonalisation: false,
      anonymisedAnalytics: false,
      reminders: true,
    });
    await cheer(noTelegram.people[0]!, noTelegram.refOf(1));
    await settle();

    const noConsent = await squadOf(2);
    const user = getStore().byId<{ id: string }>('users', noConsent.people[1]!.userId)!;
    getStore().upsert('users', { ...user, tgId: 9_999_001, timezone: 'Australia/Sydney' });
    await cheer(noConsent.people[0]!, noConsent.refOf(1));
    await settle();

    expect(telegram.filter((t) => t.method === 'sendMessage')).toEqual([]);
  });
});

describe('the cheer rate limit', () => {
  it('allows 30 sends a minute per person', async () => {
    h.enable('squads', 'cheers');
    const { people } = await squadOf(1);
    process.env.AZF_RATE_LIMIT_FORCE = '1';
    resetRateLimiter();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 31; i += 1) {
        // Alternating case: Express routes /CHEERS to the same handler, so the lane must count it.
        const path = i % 2 === 0 ? '/cheers' : '/CHEERS';
        statuses.push((await post(people[0]!, path, { to: 'm_zzzzzzzzzzzz', cheer: 'fire' })).status);
      }
      expect(statuses.slice(0, 30).every((s) => s === 403)).toBe(true);
      expect(statuses[30]).toBe(429);
      // Reading the inbox is not in that lane.
      expect((await get(people[0]!, '/cheers')).status).toBe(200);
    } finally {
      delete process.env.AZF_RATE_LIMIT_FORCE;
      resetRateLimiter();
    }
  });
});
