/**
 * S4 squads over HTTP (AZF-P1 US-C1, C2, C5, C6, B1, §5.3, §8.4, §8.6).
 *
 * What this defends, in the order a regression would hurt:
 *  - privacy: no user id in any response; numbers hidden unless shown;
 *    nobody outside a squad can read or change it (IDOR, per route);
 *  - minors and unknown ages cannot create or join;
 *  - the atomic rules: five members, one squad a season, ownership passes on;
 *  - consent is required by the server, not only shown by the client.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { addDays } = await import('../platform/dates');
const { resetRateLimiter } = await import('../platform/rateLimiter');
const { getStore } = await import('../platform/store');
const { clearSquadCodeMissesForTests } = await import('../modules/fightCamp/squads');
const { engageRepo } = await import('../modules/fightCamp/repo');

let h: FightCampHarness;
const TODAY = addDays(SEASON_ONE_STARTS_ON, 9); // a Wednesday

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T09:00:00.000Z`));
  h = await fightCampHarness('fc-squads');
});

afterEach(() => {
  h.disableAll();
  clearSquadCodeMissesForTests();
});

afterAll(async () => {
  vi.useRealTimers();
  await h.cleanup();
});

const post = (who: Person, path: string, body: object = {}) =>
  request(h.app).post(`${h.base}${path}`).set(who.auth()).send(body);
const create = (who: Person, name = 'Corner Crew') => post(who, '/squads', { name, consent: true });
const join = (who: Person, code: string) => post(who, '/squads/join', { code, consent: true });
const current = (who: Person) => request(h.app).get(`${h.base}/squads/current`).set(who.auth());
const peek = (code: string) => request(h.app).get(`${h.base}/squads/peek/${code}`);

async function squadOf(size: number) {
  const people = await Promise.all(Array.from({ length: size }, (_, i) => h.register(`Member${i}`)));
  const made = await create(people[0]!);
  for (const person of people.slice(1)) {
    // The clock is frozen, so step it: "earliest joined" needs distinct times.
    vi.setSystemTime(Date.now() + 1000);
    expect((await join(person, made.body.squad.inviteCode)).status).toBe(200);
  }
  return { people, squad: made.body.squad as { id: string; inviteCode: string } };
}

describe('with squads off', () => {
  it('answers 404 for a real squad once the flag is off', async () => {
    h.enable('squads');
    const { people, squad } = await squadOf(1);
    h.disableAll();
    const owner = people[0]!;
    expect((await current(owner)).status).toBe(404);
    expect((await post(owner, `/squads/${squad.id}/leave`)).status).toBe(404);
    const patch = await request(h.app).patch(`${h.base}/squads/${squad.id}/me`).set(owner.auth()).send({ showStats: true });
    expect(patch.status).toBe(404);
    expect((await peek(squad.inviteCode)).status).toBe(404);
  });

  it('answers 404 on every route, the public peek included', async () => {
    const mia = await h.register('Mia');
    h.enable('enrol');
    expect((await create(mia)).status).toBe(404);
    expect((await current(mia)).status).toBe(404);
    expect((await join(mia, 'SQD-AAAAAAAAAA')).status).toBe(404);
    expect((await post(mia, '/squads/x/leave')).status).toBe(404);
    expect((await peek('SQD-AAAAAAAAAA')).status).toBe(404);
  });
});

describe('creating (US-C1)', () => {
  it('creates a squad the creator owns, with an invite code and links', async () => {
    h.enable('squads');
    const mia = await h.register('Mia');
    const res = await create(mia, '  Corner Crew  ');
    expect(res.status).toBe(201);
    const squad = res.body.squad;
    expect(squad).toMatchObject({ name: 'Corner Crew', seasonNumber: 1, isCorner: false });
    expect(squad.inviteCode).toMatch(/^SQD-[A-HJ-NP-Z2-9]{10}$/);
    expect(squad.inviteUrl).toMatch(new RegExp(`/s/${squad.inviteCode}$`));
    expect(squad.tgStartParam).toBe(`sq_${squad.inviteCode}`);
    expect(squad.tgStartParam.length).toBeLessThanOrEqual(64);
    expect(squad.members).toEqual([
      expect.objectContaining({ isMe: true, role: 'owner', displayName: 'Mia', weekActiveDays: 0 }),
    ]);
    expect(squad.me.ref).toBe(squad.members[0].ref);
    expect(JSON.stringify(res.body)).not.toContain(mia.userId);
  });

  it('validates the name and requires consent', async () => {
    h.enable('squads');
    const mia = await h.register('Mia');
    expect((await create(mia, 'ab')).status).toBe(400);
    expect((await create(mia, 'x'.repeat(33))).status).toBe(400);
    expect((await create(mia, 'shit squad')).status).toBe(400);
    expect((await post(mia, '/squads', { name: 'Corner Crew' })).status).toBe(400);
    expect((await post(mia, '/squads', { name: 'Corner Crew', consent: false })).status).toBe(400);
  });

  it('allows one active squad per season', async () => {
    h.enable('squads');
    const mia = await h.register('Mia');
    expect((await create(mia)).status).toBe(201);
    const second = await create(mia, 'Second Squad');
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: 'CONFLICT', details: { reason: 'squad_already_member' } });
  });

  it('refuses minors kindly, and tells an unknown age to add it', async () => {
    h.enable('squads');
    const teen = await h.register('Teen', { age: 16 });
    const teenRes = await create(teen);
    expect(teenRes.status).toBe(403);
    expect(teenRes.body.details.reason).toBe('squad_adult_only');
    expect((await current(teen)).status).toBe(403);

    const unknown = await h.register('Unknown', { age: null });
    const unknownRes = await create(unknown);
    expect(unknownRes.status).toBe(403);
    expect(unknownRes.body.details.reason).toBe('squad_age_unknown');
  });

  it('limits how many squads one person can start in a day', async () => {
    h.enable('squads');
    const mia = await h.register('Mia');
    for (let i = 0; i < 5; i += 1) {
      const made = await create(mia, `Squad ${i + 1}`);
      expect(made.status).toBe(201);
      expect((await post(mia, `/squads/${made.body.squad.id}/leave`)).status).toBe(204);
    }
    const sixth = await create(mia, 'Squad 6');
    expect(sixth.status).toBe(429);
    expect(sixth.body.details.reason).toBe('squad_create_limit');
  });
});

describe('peeking and joining (US-C2)', () => {
  it('peeks without sign-in and without naming anyone', async () => {
    h.enable('squads');
    const { people, squad } = await squadOf(2);
    const res = await peek(squad.inviteCode.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ squad: { name: 'Corner Crew', memberCount: 2, seasonName: 'Fight Camp', full: false } });
    const raw = JSON.stringify(res.body);
    for (const person of people) expect(raw).not.toContain(person.userId);
    expect(raw).not.toContain('Member0');
    expect((await peek('SQD-AAAAAAAAAA')).body).toEqual({ squad: null });
    expect((await peek('not-a-code')).body).toEqual({ squad: null });
  });

  it('joins by code, case-insensitively', async () => {
    h.enable('squads');
    const { squad } = await squadOf(1);
    const jay = await h.register('Jay');
    vi.setSystemTime(Date.now() + 1000);
    const res = await join(jay, squad.inviteCode.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body.squad.members.map((m: { displayName: string }) => m.displayName)).toEqual(['Member0', 'Jay']);
  });

  it('refuses a sixth member, a second squad, an unknown code and a missing consent', async () => {
    h.enable('squads');
    const { squad } = await squadOf(5);
    const late = await h.register('Late');
    const full = await join(late, squad.inviteCode);
    expect(full.status).toBe(409);
    expect(full.body.details.reason).toBe('squad_full');
    expect((await peek(squad.inviteCode)).body.squad.full).toBe(true);

    const { squad: other, people } = await squadOf(1);
    const again = await join(people[0]!, squad.inviteCode);
    expect(again.status).toBe(409);
    expect(again.body.details.reason).toBe('squad_already_member');

    expect((await join(late, 'SQD-ZZZZZZZZZZ')).status).toBe(404);
    expect((await post(late, '/squads/join', { code: other.inviteCode })).status).toBe(400);
  });

  it('refuses minors', async () => {
    h.enable('squads');
    const { squad } = await squadOf(1);
    const teen = await h.register('Teen', { age: 17 });
    const res = await join(teen, squad.inviteCode);
    expect(res.status).toBe(403);
    expect(res.body.details.reason).toBe('squad_adult_only');
  });
});

describe('guessing codes', () => {
  it('tells someone already in a squad nothing about whether a code is live', async () => {
    h.enable('squads');
    const { squad } = await squadOf(1);
    const { people } = await squadOf(1);
    const insider = people[0]!;
    const live = await join(insider, squad.inviteCode);
    const unknown = await join(insider, 'SQD-QQQQQQQQQQ');
    expect([live.status, unknown.status]).toEqual([409, 409]);
    expect(live.body.details.reason).toBe('squad_already_member');
    expect(unknown.body.details.reason).toBe('squad_already_member');
  });

  it('locks a person out for an hour after ten codes that match nothing', async () => {
    h.enable('squads');
    const guesser = await h.register('Guesser');
    for (let i = 0; i < 10; i += 1) {
      expect((await join(guesser, `SQD-${'BCDEFGHJKL'[i]!.repeat(10)}`)).status).toBe(404);
    }
    const { squad } = await squadOf(1);
    const locked = await join(guesser, squad.inviteCode);
    expect(locked.status).toBe(429);
    expect(locked.body.details.reason).toBe('squad_code_attempts');
  });
});

describe('the squad view (US-B1, US-C5)', () => {
  it('shows belts to the squad and numbers only to those who chose to show them', async () => {
    h.enable('squads');
    const { people, squad } = await squadOf(2);
    const [owner, mate] = people as [Person, Person];
    h.seedActive(owner.userId, [0, 1, 2, 7, 8].map((d) => addDays(SEASON_ONE_STARTS_ON, d)));
    h.seedActive(mate.userId, [7, 9].map((d) => addDays(SEASON_ONE_STARTS_ON, d)));

    const seenByMate = (await current(mate)).body.squad;
    const ownerRow = seenByMate.members.find((m: { isMe: boolean }) => !m.isMe);
    const mateRow = seenByMate.members.find((m: { isMe: boolean }) => m.isMe);
    expect(ownerRow).toMatchObject({ beltTier: 'white', weekActiveDays: null, role: 'owner' });
    expect(mateRow).toMatchObject({ beltTier: null, weekActiveDays: 2 });
    expect(seenByMate.weekStart).toBe(addDays(SEASON_ONE_STARTS_ON, 7));

    const shown = await request(h.app)
      .patch(`${h.base}/squads/${squad.id}/me`)
      .set(owner.auth())
      .send({ showStats: true });
    expect(shown.status).toBe(200);
    expect(shown.body.member).toMatchObject({ isMe: true, weekActiveDays: 2 });
    const after = (await current(mate)).body.squad;
    expect(after.members.find((m: { isMe: boolean }) => !m.isMe).weekActiveDays).toBe(2);

    const raw = JSON.stringify(after);
    for (const person of people) expect(raw).not.toContain(person.userId);
  });

  it('records the consent with its version, and the cross-user read once a day', async () => {
    h.enable('squads');
    const { people } = await squadOf(2);
    for (let i = 0; i < 5; i += 1) await current(people[1]!);
    const events = getStore().where<{ id: string; userId?: string; action?: string; detail?: { consentTextVersion?: string } }>(
      'audit',
      (d) => d.userId === people[1]!.userId,
    );
    expect(events.find((d) => d.action === 'fightCamp.squad.consent')?.detail?.consentTextVersion).toBe(
      'squad-consent-v1',
    );
    expect(events.filter((d) => d.action === 'fightCamp.squad.viewed')).toHaveLength(1);
  });

  it('shows first names only, never an auto-filled name', async () => {
    h.enable('squads');
    const full = await h.register('Rizal Pratama');
    const made = await create(full);
    expect(made.body.squad.members[0].displayName).toBe('Rizal');
    const user = getStore().byId<{ id: string; email: string }>('users', full.userId)!;
    getStore().upsert('users', { ...user, displayName: user.email.split('@')[0] });
    expect((await current(full)).body.squad.members[0].displayName).toBe('Fight Camp member');
  });

  it('takes out a member who is no longer known to be an adult', async () => {
    h.enable('squads');
    const { people, squad } = await squadOf(3);
    const [owner, , later] = people as [Person, Person, Person];
    h.setAge(later.userId, 16);
    const view = (await current(owner)).body.squad;
    expect(view.members).toHaveLength(2);
    expect((await engageRepo().activeMembership(later.userId, 1))).toBeNull();
    expect((await peek(squad.inviteCode)).body.squad.memberCount).toBe(2);
    const teenView = await current(later);
    expect(teenView.status).toBe(403);
  });

  it('carries the squad into the fightCamp block for adults only', async () => {
    h.enable('squads');
    const { people, squad } = await squadOf(1);
    const fr = await request(h.app).get(`${h.base}/fight-record`).set(people[0]!.auth());
    expect(fr.body.fightCamp.squads).toEqual({ current: { id: squad.id, name: 'Corner Crew' } });
    const teen = await h.register('Teen', { age: 16 });
    const teenFr = await request(h.app).get(`${h.base}/fight-record`).set(teen.auth());
    expect(teenFr.body.fightCamp.squads).toBeNull();
  });
});

describe('owners', () => {
  it('rotate the invite code, retiring every old link', async () => {
    h.enable('squads');
    const { people, squad } = await squadOf(2);
    const rotated = await post(people[0]!, `/squads/${squad.id}/rotate-code`);
    expect(rotated.status).toBe(200);
    const fresh = rotated.body.squad.inviteCode as string;
    expect(fresh).not.toBe(squad.inviteCode);
    expect((await peek(squad.inviteCode)).body.squad).toBeNull();
    expect((await peek(fresh)).body.squad.memberCount).toBe(2);
    const notOwner = await post(people[1]!, `/squads/${squad.id}/rotate-code`);
    expect(notOwner.status).toBe(403);
    expect(notOwner.body.details.reason).toBe('squad_owner_only');
  });

  it('remove a member, who can then join elsewhere', async () => {
    h.enable('squads');
    const { people, squad } = await squadOf(3);
    const [owner, mate] = people as [Person, Person];
    const view = (await current(owner)).body.squad;
    const mateRef = view.members.find((m: { displayName: string }) => m.displayName === 'Member1').ref;
    expect((await post(mate, `/squads/${squad.id}/members/${mateRef}/remove`)).status).toBe(403);
    expect((await post(owner, `/squads/${squad.id}/members/${mateRef}/remove`)).status).toBe(204);
    expect((await current(mate)).body.squad).toBeNull();
    expect((await post(owner, `/squads/${squad.id}/members/${mateRef}/remove`)).status).toBe(404);
    expect((await post(owner, `/squads/${squad.id}/members/${view.me.ref}/remove`)).status).toBe(404);
    const { squad: other } = await squadOf(1);
    expect((await join(mate, other.inviteCode)).status).toBe(200);
  });
});

describe('the last place', () => {
  it('goes to exactly one of two people joining at once', async () => {
    h.enable('squads');
    const { squad } = await squadOf(4);
    const [a, b] = await Promise.all([h.register('RaceA'), h.register('RaceB')]);
    const results = await Promise.all([join(a, squad.inviteCode), join(b, squad.inviteCode)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await peek(squad.inviteCode)).body.squad.memberCount).toBe(5);
  });
});

describe('leaving (US-C6)', () => {
  it('hands ownership to the earliest joined member and archives an empty squad', async () => {
    h.enable('squads');
    const { people, squad } = await squadOf(3);
    const [owner, second, third] = people as [Person, Person, Person];
    expect((await post(owner, `/squads/${squad.id}/leave`)).status).toBe(204);
    expect((await current(owner)).body.squad).toBeNull();
    const view = (await current(third)).body.squad;
    expect(view.members.map((m: { displayName: string; role: string }) => [m.displayName, m.role])).toEqual([
      ['Member1', 'owner'],
      ['Member2', 'member'],
    ]);
    await post(second, `/squads/${squad.id}/leave`);
    await post(third, `/squads/${squad.id}/leave`);
    expect((await peek(squad.inviteCode)).body.squad).toBeNull();
    const latecomer = await h.register('Latecomer');
    expect((await join(latecomer, squad.inviteCode)).status).toBe(404);
  });
});

describe('outsiders (IDOR)', () => {
  it('cannot leave, change or read a squad they are not in', async () => {
    h.enable('squads');
    const { squad } = await squadOf(2);
    const outsider = await h.register('Outsider');
    expect((await post(outsider, `/squads/${squad.id}/leave`)).status).toBe(404);
    const patch = await request(h.app)
      .patch(`${h.base}/squads/${squad.id}/me`)
      .set(outsider.auth())
      .send({ showStats: true });
    expect(patch.status).toBe(404);
    expect((await current(outsider)).body.squad).toBeNull();

    // A member of another squad is an outsider too.
    const { people: others } = await squadOf(1);
    expect((await post(others[0]!, `/squads/${squad.id}/leave`)).status).toBe(404);
  });
});

describe('the public peek rate limit', () => {
  it('allows 30 peeks a minute per address', async () => {
    h.enable('squads');
    process.env.AZF_RATE_LIMIT_FORCE = '1';
    resetRateLimiter();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 31; i += 1) statuses.push((await peek('SQD-AAAAAAAAAA')).status);
      expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
      expect(statuses[30]).toBe(429);
    } finally {
      delete process.env.AZF_RATE_LIMIT_FORCE;
      resetRateLimiter();
    }
  });
});
