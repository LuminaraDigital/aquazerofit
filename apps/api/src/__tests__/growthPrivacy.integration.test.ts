/**
 * Regression cover for the growth surface (buddy challenges + share telemetry).
 *
 * Every case here failed before the fix it guards:
 *  - challenge documents carry no top-level `userId`, so purgeUser's
 *    user-scoped sweep over `logs` could not see them and a deleted account
 *    stayed a named member forever;
 *  - growth events keep their identifiers in `props`/`attribution`, which
 *    scrubDetail does not reach, so the anonymised record still pointed back
 *    at the huddles and the inviter;
 *  - the public peek recomputed every member's progress, and each day of the
 *    window costs a full scan of the logs container;
 *  - authenticated reads stamped a fresh `updatedAt`, dirtying every huddle on
 *    every list;
 *  - invite codes came from Math.random();
 *  - nothing ever expired the unauthenticated telemetry writes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BuddyChallenge, GrowthEvent } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-growth-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { purgeUser } = await import('../modules/me/service');
const { sweepGrowthEvents } = await import('../modules/analytics/router');

const app = createApp();
const base = '/api/v1';

interface Actor {
  id: string;
  token: string;
}

async function registerActor(email: string, displayName: string): Promise<Actor> {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email, password: 'CorrectHorse9Battery', displayName });
  expect(res.status).toBe(201);
  const token = res.body.accessToken as string;

  const me = await request(app).get(`${base}/me`).set({ Authorization: `Bearer ${token}` });
  expect(me.status).toBe(200);
  return { id: me.body.user.id as string, token };
}

function challengeByCode(code: string): BuddyChallenge | undefined {
  return getStore()
    .where<BuddyChallenge>('logs', (d) => d.type === 'buddyChallenge' && d.code === code)
    .at(0);
}

async function createHuddle(actor: Actor, durationDays = 14): Promise<string> {
  const res = await request(app)
    .post(`${base}/challenges`)
    .set({ Authorization: `Bearer ${actor.token}` })
    .send({ kind: 'logging_streak', targetDays: 7, durationDays });
  expect(res.status).toBe(201);
  return res.body.challenge.code as string;
}

let alice: Actor;
let bob: Actor;

beforeAll(async () => {
  alice = await registerActor('growth-alice@example.com', 'Alice');
  bob = await registerActor('growth-bob@example.com', 'Bob');
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('account erasure reaches buddy challenges', () => {
  it('removes a purged account from a huddle that outlives it, and rehomes ownership', async () => {
    const doomed = await registerActor('growth-doomed@example.com', 'Doomed');
    const code = await createHuddle(doomed);

    const joined = await request(app)
      .post(`${base}/challenges/join`)
      .set({ Authorization: `Bearer ${bob.token}` })
      .send({ code });
    expect(joined.status).toBe(200);
    expect(challengeByCode(code)?.members).toHaveLength(2);

    purgeUser(doomed.id);

    const after = challengeByCode(code);
    expect(after).toBeDefined();
    expect(after!.members.map((m) => m.userId)).toEqual([bob.id]);
    // Ownership passes to the survivor rather than dangling at a dead id.
    expect(after!.createdBy).toBe(bob.id);
    // Nothing anywhere in the document still points at the deleted account.
    expect(JSON.stringify(after)).not.toContain(doomed.id);
  });

  it('deletes a huddle outright once its last member is purged', async () => {
    const solo = await registerActor('growth-solo@example.com', 'Solo');
    const code = await createHuddle(solo);
    expect(challengeByCode(code)).toBeDefined();

    purgeUser(solo.id);

    expect(challengeByCode(code)).toBeUndefined();
  });
});

describe('growth telemetry anonymisation', () => {
  it('strips the referral and huddle code that would re-link a purged account', async () => {
    const tracked = await registerActor('growth-tracked@example.com', 'Tracked');
    const code = await createHuddle(tracked);

    const posted = await request(app)
      .post(`${base}/analytics/events`)
      .set({ Authorization: `Bearer ${tracked.token}` })
      .send({
        name: 'challenge_shared',
        props: { code, kind: 'huddle' },
        attribution: { ref: 'inviter123', utmSource: 'telegram', challengeCode: code },
      });
    expect(posted.status).toBe(202);
    const eventId = posted.body.id as string;

    const before = getStore().byId<GrowthEvent>('audit', eventId);
    expect(before?.userId).toBe(tracked.id);
    expect(before?.attribution.ref).toBe('inviter123');

    purgeUser(tracked.id);

    const after = getStore().byId<GrowthEvent>('audit', eventId);
    expect(after).toBeDefined();
    expect(after!.userId).toBe('anonymised');
    expect(after!.attribution.ref).toBeNull();
    expect(after!.attribution.challengeCode).toBeNull();
    expect(after!.props.code).toBeUndefined();
    // The aggregate survives: the event is what the record is for.
    expect(after!.name).toBe('challenge_shared');
    expect(after!.attribution.utmSource).toBe('telegram');
    expect(after!.props.kind).toBe('huddle');
  });

  it('expires growth events past the retention window and keeps the rest', () => {
    const store = getStore();
    const stale: GrowthEvent = {
      type: 'growthEvent',
      id: 'gev_stale_fixture',
      userId: null,
      name: 'share_opened',
      props: {},
      attribution: {
        ref: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        challengeCode: null,
      },
      createdAt: new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString(),
    };
    const fresh: GrowthEvent = { ...stale, id: 'gev_fresh_fixture', createdAt: new Date().toISOString() };
    store.upsert('audit', stale);
    store.upsert('audit', fresh);

    const removed = sweepGrowthEvents();

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(store.byId('audit', 'gev_stale_fixture')).toBeUndefined();
    expect(store.byId('audit', 'gev_fresh_fixture')).toBeDefined();
  });
});

describe('growth event payload bounds', () => {
  it('rejects more properties than the cap allows', async () => {
    const props: Record<string, string> = {};
    for (let i = 0; i < 13; i++) props[`k${i}`] = 'v';

    const res = await request(app).post(`${base}/analytics/events`).send({
      name: 'share_opened',
      props,
    });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized property value', async () => {
    const res = await request(app)
      .post(`${base}/analytics/events`)
      .send({ name: 'share_opened', props: { kind: 'x'.repeat(5000) } });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized property key', async () => {
    const res = await request(app)
      .post(`${base}/analytics/events`)
      .send({ name: 'share_opened', props: { ['k'.repeat(200)]: 'v' } });
    expect(res.status).toBe(400);
  });

  it('still accepts an ordinary share event', async () => {
    const res = await request(app)
      .post(`${base}/analytics/events`)
      .send({ name: 'share_opened', props: { kind: 'meal' }, attribution: { ref: 'abc' } });
    expect(res.status).toBe(202);
  });
});

describe('challenge read and peek costs', () => {
  it('does not rewrite the huddle when nothing has changed', async () => {
    const code = await createHuddle(alice);
    const first = challengeByCode(code)!.updatedAt;

    const listed = await request(app)
      .get(`${base}/challenges`)
      .set({ Authorization: `Bearer ${alice.token}` });
    expect(listed.status).toBe(200);

    expect(challengeByCode(code)!.updatedAt).toBe(first);
  });

  it('answers a public peek without scanning the ledger for every member-day', async () => {
    // A 90-day window is the worst case: the old path walked every day of it
    // for every member, and each day cost at least one full container scan.
    const code = await createHuddle(alice, 90);
    await request(app)
      .post(`${base}/challenges/join`)
      .set({ Authorization: `Bearer ${bob.token}` })
      .send({ code });

    const store = getStore();
    const spy = vi.spyOn(store, 'where');
    const peek = await request(app).get(`${base}/challenges/peek/${code}`);
    const logScans = spy.mock.calls.filter(([container]) => container === 'logs').length;
    spy.mockRestore();

    expect(peek.status).toBe(200);
    expect(peek.body.challenge.memberCount).toBe(2);
    // One lookup to resolve the code. The old path ran into the hundreds.
    expect(logScans).toBeLessThanOrEqual(2);
  });
});

describe('invite codes', () => {
  it('draws codes from the CSPRNG, not Math.random', async () => {
    const spy = vi.spyOn(Math, 'random');
    const code = await createHuddle(alice);
    const used = spy.mock.calls.length;
    spy.mockRestore();

    expect(code).toMatch(/^AQUA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(used).toBe(0);
  });

  it('issues distinct codes across many huddles', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 12; i++) codes.add(await createHuddle(alice));
    expect(codes.size).toBe(12);
  });
});
