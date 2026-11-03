/**
 * Meal-recommendation billing when the gateway degrades to offline templates
 * after real provider failure, or in production with no provider configured:
 * credits must be released, not committed.
 *
 * Same stance the chat lane enforces (chatDegradedBilling.test.ts) — a user who
 * asked for a model-ranked suggestion and received a deterministic template
 * instead has not consumed the thing they paid for.
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { CREDIT_COSTS } from '@aquazerofit/shared';
import { creditLedger } from '../modules/ai/creditLedger';
import { resetProviderCircuits } from '../modules/ai/gateway';
import { config } from '../platform/config';
import {
  bindIsolatedDataDir,
  clearProviderEnv,
  createIsolatedDataDir,
  pinIsolatedDataDir,
  saveProviderEnv,
  teardownIsolatedDataDir,
} from './helpers/integrationIsolation';

const savedAzfDataDir = process.env.AZF_DATA_DIR;
const savedProviderEnv = saveProviderEnv();
const dataDir = createIsolatedDataDir('azf-rec-degraded-');
bindIsolatedDataDir(dataDir);
clearProviderEnv();
// A credentialed provider is what separates "everything real failed" (degraded)
// from the designed keyless path, where the offline engine IS the product.
process.env.GROQ_API_KEY = 'test-key';

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

let token = '';
let userId = '';

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
});

beforeAll(async () => {
  bindIsolatedDataDir(dataDir);
  resetProviderCircuits();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: async () => ({ error: 'upstream unavailable' }),
    })),
  );

  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'rec-degraded@example.com', password: 'CorrectHorse9Battery' });
  expect(reg.status).toBe(201);
  token = reg.body.accessToken as string;
  userId = reg.body.user.id as string;

  // aiPersonalisation ON is what routes this request through the model path
  // rather than the consent-off deterministic fallback.
  const consents = await request(app).put(`${base}/me/consents`).set(auth()).send({
    wellnessDataProcessing: true,
    aiPersonalisation: true,
    anonymisedAnalytics: false,
    reminders: false,
  });
  expect(consents.status).toBe(200);
  await getStore().flush();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetProviderCircuits();
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

it('releases the meal-recommendation reservation when meta.degraded is true', async () => {
  await creditLedger.grantDailyIfNeeded(userId);
  const before = await creditLedger.balance(userId);

  const res = await request(app)
    .post(`${base}/recommendations/meals`)
    .set(auth())
    .send({ mealType: 'lunch', localDate: '2026-07-31' });
  expect(res.status).toBe(201);
  expect(res.body.recommendation).toBeDefined();

  // The user still gets a usable suggestion — they just are not charged for it.
  const after = await creditLedger.balance(userId);
  expect(after).toBe(before);

  const ledger = getStore().where('ledger', (d) => (d as { userId?: string }).userId === userId);
  const reserveTx = ledger.find((d) => (d as { reason?: string }).reason === 'reserve:mealRecommendation');
  expect(reserveTx).toBeDefined();
  const reservationId = (reserveTx as { reservationId?: string }).reservationId;
  expect(reservationId).toBeTypeOf('string');

  const settlement = ledger.filter((d) => (d as { reservationId?: string }).reservationId === reservationId);
  expect(settlement.some((d) => (d as { kind?: string }).kind === 'release')).toBe(true);
  expect(settlement.some((d) => (d as { kind?: string }).kind === 'commit')).toBe(false);
  expect(CREDIT_COSTS.mealRecommendation).toBe(2);
});

/*
 * Production with no provider key at all: no real model was ever in play, so
 * the gateway used to call the template answer undegraded and this lane
 * charged for it. In production that output is now degraded ('no_provider')
 * and the hold is released exactly as for a provider outage.
 */
it('releases the reservation in production when no provider is configured at all', async () => {
  const savedKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  // Production as the gateway reads it. NODE_ENV itself would also arm the
  // JWT and HTTPS boot guards, which have nothing to do with billing.
  vi.spyOn(config, 'isProduction', 'get').mockReturnValue(true);
  try {
    await creditLedger.grantDailyIfNeeded(userId);
    const before = await creditLedger.balance(userId);

    const res = await request(app)
      .post(`${base}/recommendations/meals`)
      .set(auth())
      .send({ mealType: 'dinner', localDate: '2026-07-31' });
    expect(res.status).toBe(201);
    expect(res.body.recommendation.ai.provider).toBe('mock');

    expect(await creditLedger.balance(userId)).toBe(before);
    const ledger = getStore().where('ledger', (d) => (d as { userId?: string }).userId === userId);
    const reservationId = (
      ledger.filter((d) => (d as { reason?: string }).reason === 'reserve:mealRecommendation').at(-1) as {
        reservationId?: string;
      }
    ).reservationId;
    const settlement = ledger.filter((d) => (d as { reservationId?: string }).reservationId === reservationId);
    expect(settlement.some((d) => (d as { kind?: string }).kind === 'release')).toBe(true);
    expect(settlement.some((d) => (d as { kind?: string }).kind === 'commit')).toBe(false);
    expect(res.body.recommendation.ai.degradedReason).toBe('no_provider');
  } finally {
    vi.restoreAllMocks();
    if (savedKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = savedKey;
  }
});
