/**
 * GET /me/entitlements — what this account can do, and what is left today.
 *
 * The properties under test are the ones the plan surface reads literally. A
 * brand-new account must not report a zero balance (the daily grant is lazy, so
 * a naive read reports "you have nothing" to someone who simply has not started
 * yet), and nothing here may offer a way to change `tier` — a self-serve tier
 * flip with no payment behind it is an entitlement any caller could grant
 * themselves.
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CREDIT_COSTS, FREE_TIER_DAILY_CREDITS } from '@aquazerofit/shared';
import {
  bindIsolatedDataDir,
  createIsolatedDataDir,
  pinIsolatedDataDir,
  saveProviderEnv,
  teardownIsolatedDataDir,
} from './helpers/integrationIsolation';

const savedAzfDataDir = process.env.AZF_DATA_DIR;
const savedProviderEnv = saveProviderEnv();
const dataDir = createIsolatedDataDir('azf-entitle-');
bindIsolatedDataDir(dataDir);

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

let token = '';
let userId = '';

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
});

beforeAll(async () => {
  bindIsolatedDataDir(dataDir);
  const res = await request(app).post(`${base}/auth/register`).send({
    email: 'entitlements@example.com',
    password: 'CorrectHorse9Battery',
    displayName: 'Ent',
  });
  expect(res.status).toBe(201);
  token = res.body.accessToken as string;
  userId = res.body.user.id as string;
  await getStore().flush();
});

afterAll(async () => {
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('GET /me/entitlements', () => {
  it('reports a usable balance for an account that has never called an AI lane', async () => {
    const res = await request(app).get(`${base}/me/entitlements`).set(auth());
    expect(res.status).toBe(200);
    // The regression this guards: reading balance() without triggering the lazy
    // daily grant reported 0 for every fresh account.
    expect(res.body.creditsRemaining).toBe(FREE_TIER_DAILY_CREDITS);
    expect(res.body.tier).toBe('free');
    expect(res.body.dailyCredits).toBe(FREE_TIER_DAILY_CREDITS);
    expect(res.body.costs).toEqual(CREDIT_COSTS);
    expect(res.body.premiumLanes).toContain('insightBatch');
  });

  it('is idempotent — repeated reads do not stack daily grants', async () => {
    await request(app).get(`${base}/me/entitlements`).set(auth());
    await request(app).get(`${base}/me/entitlements`).set(auth());
    const res = await request(app).get(`${base}/me/entitlements`).set(auth());
    expect(res.body.creditsRemaining).toBe(FREE_TIER_DAILY_CREDITS);

    const grants = getStore().where(
      'ledger',
      (d) =>
        (d as { userId?: string }).userId === userId &&
        (d as { reason?: string }).reason === 'dailyGrant',
    );
    expect(grants).toHaveLength(1);
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`${base}/me/entitlements`);
    expect(res.status).toBe(401);
  });

  it('offers no route that changes tier', async () => {
    // Whatever the plan page grows into, it must never be able to do this.
    for (const method of ['post', 'put', 'patch'] as const) {
      const res = await request(app)
        [method](`${base}/me/entitlements`)
        .set(auth())
        .send({ tier: 'premium' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    const after = await request(app).get(`${base}/me/entitlements`).set(auth());
    expect(after.body.tier).toBe('free');
  });
});
