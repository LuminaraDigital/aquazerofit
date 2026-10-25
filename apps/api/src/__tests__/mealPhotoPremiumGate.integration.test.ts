/**
 * Freemium split on the HTTP boundary.
 *
 * A free account cannot start a meal-photo job (visionPrimary). The same
 * account can still talk to the coach, and running out of credits on that
 * lane is 402, not the premium 403. A premium account can upload a photo.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CREDIT_COSTS, type User } from '@aquazerofit/shared';
import { creditLedger } from '../modules/ai/creditLedger';
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
const dataDir = createIsolatedDataDir('azf-photo-gate-');
bindIsolatedDataDir(dataDir);
clearProviderEnv();

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';
const PASSWORD = 'CorrectHorse9Battery';

let freeToken = '';
let freeUserId = '';
let premiumToken = '';
let sessionId = '';
const written: string[] = [];

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
  clearProviderEnv();
});

beforeAll(async () => {
  bindIsolatedDataDir(dataDir);
  const free = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'photo-gate-free@example.com', password: PASSWORD });
  expect(free.status).toBe(201);
  freeToken = free.body.accessToken as string;
  freeUserId = free.body.user.id as string;

  const premium = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'photo-gate-premium@example.com', password: PASSWORD });
  expect(premium.status).toBe(201);
  premiumToken = premium.body.accessToken as string;
  const premiumUser = getStore().byId<User>('users', premium.body.user.id as string);
  expect(premiumUser).toBeTruthy();
  getStore().upsert('users', { ...premiumUser!, tier: 'premium' });

  const session = await request(app).post(`${base}/chat/sessions`).set(auth(freeToken)).send({});
  expect(session.status).toBe(201);
  sessionId = session.body.session.id as string;
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  for (const file of written) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* the job may already have deleted it */
    }
  }
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

async function jpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 32, height: 24, channels: 3, background: { r: 180, g: 90, b: 40 } },
  })
    .jpeg()
    .toBuffer();
}

function mealPhotoHolds(userId: string): number {
  return getStore().where(
    'ledger',
    (d) =>
      (d as { userId?: string }).userId === userId &&
      (d as { reason?: string }).reason === 'reserve:mealPhoto',
  ).length;
}

describe('meal-photo premium gate', () => {
  it('refuses a free account before any credit is held', async () => {
    const holdsBefore = mealPhotoHolds(freeUserId);
    const res = await request(app)
      .post(`${base}/meal-photos`)
      .set(auth(freeToken))
      .field('mealType', 'lunch')
      .attach('photo', await jpeg(), { filename: 'lunch.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.message).toBe('This feature is part of AquaZeroFit Premium.');
    expect(mealPhotoHolds(freeUserId)).toBe(holdsBefore);
    expect(res.body.jobId).toBeUndefined();
  });

  it('accepts the same upload from a premium account', async () => {
    const res = await request(app)
      .post(`${base}/meal-photos`)
      .set(auth(premiumToken))
      .field('mealType', 'lunch')
      .attach('photo', await jpeg(), { filename: 'lunch.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(202);
    expect(typeof res.body.jobId).toBe('string');
    const job = getStore().byId<{
      id: string;
      imagePath?: string;
      imageVariants?: { path: string }[];
    }>('ai', res.body.jobId as string);
    if (job?.imagePath) written.push(job.imagePath);
    for (const variant of job?.imageVariants ?? []) written.push(variant.path);
  });
});

describe('coach chat stays on the free credit meter', () => {
  it('answers a free account that still has credits', async () => {
    const res = await request(app)
      .post(`${base}/chat/sessions/${sessionId}/messages`)
      .set(auth(freeToken))
      .send({ content: 'What should I eat after training?' });

    expect(res.status).toBe(200);
    expect(res.body.code).not.toBe('FORBIDDEN');
    expect(res.text).toContain('"type":"done"');
  });

  it('answers 402, not 403, once the free allowance is spent', async () => {
    await creditLedger.grantDailyIfNeeded(freeUserId, 'free');
    const balance = await creditLedger.balance(freeUserId);
    getStore().upsert('ledger', {
      id: `ct-drain-${freeUserId}`,
      userId: freeUserId,
      type: 'creditTransaction',
      kind: 'commit',
      amount: -balance,
      reservationId: `res-drain-${freeUserId}`,
      reason: 'commit:chatTurn',
      createdAt: new Date().toISOString(),
    });
    expect(await creditLedger.balance(freeUserId)).toBe(0);
    expect(CREDIT_COSTS.chatTurn).toBe(1);

    const res = await request(app)
      .post(`${base}/chat/sessions/${sessionId}/messages`)
      .set(auth(freeToken))
      .send({ content: 'One more question about dinner.' });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('CREDITS_INSUFFICIENT');
  });
});
