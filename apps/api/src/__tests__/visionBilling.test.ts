/**
 * Vision credit hygiene: TTL sweep must release stale reservations, and confirm
 * must re-derive macros from the food catalog (never trust client values).
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { confirmVisionSchema, CREDIT_COSTS, FREE_TIER_DAILY_CREDITS } from '@aquazerofit/shared';
import { creditLedger } from '../modules/ai/creditLedger';
import { sweepVisionArtifacts } from '../modules/vision/router';
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
const dataDir = createIsolatedDataDir('azf-vision-bill-');
bindIsolatedDataDir(dataDir);
clearProviderEnv();

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';
const PASSWORD = 'CorrectHorse9Battery';
const DATE = '2026-07-31';

let token = '';
let userId = '';

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
});

beforeAll(async () => {
  bindIsolatedDataDir(dataDir);

  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'vision-billing@example.com', password: PASSWORD });
  expect(reg.status).toBe(201);
  token = reg.body.accessToken as string;
  userId = reg.body.user.id as string;
  await getStore().flush();
});

afterAll(async () => {
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

describe('confirmVisionSchema', () => {
  it('accepts client-supplied macros that the confirm handler ignores at runtime', () => {
    const parsed = confirmVisionSchema.safeParse({
      mealType: 'lunch',
      localDate: DATE,
      items: [
        {
          foodId: 'food-chicken-breast',
          name: 'Chicken Breast (grilled)',
          grams: 150,
          kcal: 5000,
          proteinG: 500,
          carbsG: 500,
          fatG: 500,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('sweepVisionArtifacts', () => {
  it('releases an unreleased reservation when deleting a stale non-confirmed job', async () => {
    const reservationId = await creditLedger.reserve(userId, 'mealPhoto');
    const balanceAfterReserve = await creditLedger.balance(userId);
    expect(balanceAfterReserve).toBe(FREE_TIER_DAILY_CREDITS - CREDIT_COSTS.mealPhoto);

    const staleCompletedAt = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const jobId = 'vj-sweep-stale-test';
    getStore().upsert('ai', {
      id: jobId,
      userId,
      type: 'cvJob',
      status: 'succeeded',
      mealType: 'lunch',
      predictions: [],
      ai: null,
      createdAt: staleCompletedAt,
      completedAt: staleCompletedAt,
      reservationId,
    });

    const swept = await sweepVisionArtifacts();
    expect(swept).toBeGreaterThanOrEqual(1);
    expect(getStore().byId('ai', jobId)).toBeUndefined();
    expect(await creditLedger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);
  });
});

describe('vision confirm macro recalculation', () => {
  const jobId = 'vj-confirm-macros-test';

  beforeAll(async () => {
    bindIsolatedDataDir(dataDir);
    getStore().upsert('ai', {
      id: jobId,
      userId,
      type: 'cvJob',
      status: 'succeeded',
      mealType: 'lunch',
      predictions: [
        {
          name: 'Chicken Breast (grilled)',
          foodId: 'food-chicken-breast',
          estimatedGrams: 150,
          confidence: 0.9,
          kcal: 247.5,
          proteinG: 46.5,
          carbsG: 0,
          fatG: 5.4,
        },
      ],
      ai: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    await getStore().flush();
  });

  it('ignores client-supplied macros and derives nutrition from foodId + grams', async () => {
    const res = await request(app)
      .post(`${base}/meal-photos/${jobId}/confirm`)
      .set(auth())
      .send({
        mealType: 'lunch',
        localDate: DATE,
        items: [
          {
            foodId: 'food-chicken-breast',
            name: 'Chicken Breast (grilled)',
            grams: 150,
            kcal: 5000,
            proteinG: 500,
            carbsG: 500,
            fatG: 500,
          },
        ],
      });
    expect(res.status).toBe(201);
    const item = res.body.mealLog.items[0];
    expect(item.kcal).toBe(247.5);
    expect(item.proteinG).toBe(46.5);
    expect(item.carbsG).toBe(0);
    expect(item.fatG).toBe(5.4);
    expect(res.body.mealLog.totalKcal).toBe(247.5);
  });

  it('rejects an unknown foodId', async () => {
    const unknownJobId = 'vj-confirm-unknown-food';
    getStore().upsert('ai', {
      id: unknownJobId,
      userId,
      type: 'cvJob',
      status: 'succeeded',
      mealType: 'lunch',
      predictions: [],
      ai: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    const res = await request(app)
      .post(`${base}/meal-photos/${unknownJobId}/confirm`)
      .set(auth())
      .send({
        mealType: 'lunch',
        localDate: DATE,
        items: [
          {
            foodId: 'food-does-not-exist',
            name: 'Mystery Food',
            grams: 100,
            kcal: 1,
            proteinG: 1,
            carbsG: 1,
            fatG: 1,
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
