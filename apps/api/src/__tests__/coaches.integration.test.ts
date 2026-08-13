/**
 * Coach roster: entitlement enforcement, bond accounting and reaction delivery.
 *
 * The lock test is the important one. The client renders a padlock, but the
 * padlock is decoration — if `POST /coaches/select` ever stops checking, every
 * paid coach becomes free to anyone who can send a JSON body, and nothing in
 * the UI would look different.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CoachState } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-coach-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

let token = '';
let userId = '';

beforeAll(async () => {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'coach-a@example.com', password: 'CorrectHorse9Battery', displayName: 'Ada' });
  expect(res.status).toBe(201);
  token = res.body.accessToken as string;
  userId = res.body.user.id as string;
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('coach roster', () => {
  it('serves the whole roster including locked coaches, and never leaks voice blocks', async () => {
    const res = await request(app).get(`${base}/coaches`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.activeCoachId).toBe('akin');
    expect(res.body.roster.length).toBeGreaterThanOrEqual(9);

    // Locked coaches are present — the ladder has to be visible to be climbed.
    const locked = res.body.entitlements.filter((e: { unlocked: boolean }) => !e.unlocked);
    expect(locked.length).toBeGreaterThan(0);

    // Prompt material must not reach the browser.
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('You control tone and word choice only');
    expect(res.body.roster[0]).not.toHaveProperty('voice');
  });

  it('reports a price only while a coach is actually locked', async () => {
    const res = await request(app).get(`${base}/coaches`).set(auth());
    for (const entitlement of res.body.entitlements) {
      if (entitlement.unlocked) expect(entitlement.starsPrice).toBeNull();
    }
  });
});

describe('entitlement enforcement', () => {
  it('lets a new account pick a free coach', async () => {
    const res = await request(app).post(`${base}/coaches/select`).set(auth()).send({ coachId: 'sanzo' });
    expect(res.status).toBe(200);
    expect(res.body.activeCoachId).toBe('sanzo');
  });

  it('refuses a coach the account has not unlocked', async () => {
    const res = await request(app).post(`${base}/coaches/select`).set(auth()).send({ coachId: 'ogun' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');

    // And the refusal is real: the active coach is unchanged.
    const roster = await request(app).get(`${base}/coaches`).set(auth());
    expect(roster.body.activeCoachId).toBe('sanzo');
  });

  it('rejects an unknown coach id at the schema boundary', async () => {
    const res = await request(app)
      .post(`${base}/coaches/select`)
      .set(auth())
      .send({ coachId: 'not-a-fighter' });
    expect(res.status).toBe(400);
  });

  it('honours a purchase grant regardless of level', async () => {
    const store = getStore();
    const state = store.byId<CoachState>('profiles', `coachState:${userId}`)!;
    store.upsert<CoachState>('profiles', { ...state, purchased: ['ogun'] });

    const res = await request(app).post(`${base}/coaches/select`).set(auth()).send({ coachId: 'ogun' });
    expect(res.status).toBe(200);
    expect(res.body.activeCoachId).toBe('ogun');
  });
});

describe('bond accounting', () => {
  it('settles the outgoing coach rather than transferring their bond', async () => {
    const store = getStore();
    const before = store.byId<CoachState>('profiles', `coachState:${userId}`)!;
    // Pretend the user banked XP under Ogun.
    store.upsert<CoachState>('profiles', { ...before, baselineXp: 0 });

    await request(app).post(`${base}/coaches/select`).set(auth()).send({ coachId: 'akin' });
    const after = store.byId<CoachState>('profiles', `coachState:${userId}`)!;

    expect(after.activeCoachId).toBe('akin');
    // Whatever was open under Ogun is now settled to Ogun, not carried to Akin.
    expect(Object.keys(after.accrued)).toContain('ogun');
    expect(after.accrued.akin ?? 0).toBe(0);
  });
});

describe('progression and reactions', () => {
  it('always returns at least one line, even with no activity at all', async () => {
    const res = await request(app).get(`${base}/coaches/progression`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.reactions.length).toBeGreaterThan(0);
    expect(res.body.experience.level).toBe(1);
    expect(res.body.reactions[0].coachId).toBe(res.body.activeCoachId);
  });

  it('leaves reactions pending until they are explicitly acknowledged', async () => {
    // A read must not consume a celebration: the user may never have seen it.
    const first = await request(app).get(`${base}/coaches/progression`).set(auth());
    const second = await request(app).get(`${base}/coaches/progression`).set(auth());
    expect(second.body.reactions).toEqual(first.body.reactions);

    const ack = await request(app).post(`${base}/coaches/reactions/ack`).set(auth());
    expect(ack.status).toBe(204);
  });
});

describe('purchase surface', () => {
  it('refuses to sell a coach the account already owns', async () => {
    const res = await request(app).post(`${base}/coaches/ogun/purchase`).set(auth()).send({});
    // Either already-owned (409) or payments-not-configured (503) — never a
    // path that takes money for something the user already has.
    expect([409, 503]).toContain(res.status);
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`${base}/coaches`);
    expect(res.status).toBe(401);
  });
});
