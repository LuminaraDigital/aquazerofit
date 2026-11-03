/**
 * Food photo training: the labelled photograph is kept only under its own
 * opt-in, never gates scanning, and disappears on withdrawal, expiry and
 * account deletion.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FOOD_PHOTO_SAMPLE_RETENTION_DAYS, type Food, type VisionJob } from '@aquazerofit/shared';
import {
  bindIsolatedDataDir,
  clearProviderEnv,
  createIsolatedDataDir,
  pinIsolatedDataDir,
  saveProviderEnv,
  teardownIsolatedDataDir,
} from './helpers/integrationIsolation';

const savedAzfDataDir = process.env.AZF_DATA_DIR;
const savedUploadsDir = process.env.UPLOADS_DIR;
const savedProviderEnv = saveProviderEnv();
const dataDir = createIsolatedDataDir('azf-food-photo-');
const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-food-photo-uploads-'));
bindIsolatedDataDir(dataDir);
clearProviderEnv();
process.env.UPLOADS_DIR = uploadsDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { sweepVisionArtifacts } = await import('../modules/vision/router');
const { purgeUser } = await import('../modules/me/service');
type Sample = import('../modules/vision/trainingSamples').FoodPhotoSample;

const app = createApp();
const base = '/api/v1';
const PASSWORD = 'CorrectHorse9Battery';
const CONSENTS_OFF = {
  wellnessDataProcessing: true,
  aiPersonalisation: false,
  anonymisedAnalytics: false,
  reminders: false,
};

let foodId = '';
let accounts = 0;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
  clearProviderEnv();
  process.env.UPLOADS_DIR = uploadsDir;
});

beforeAll(() => {
  bindIsolatedDataDir(dataDir);
  foodId = getStore().where<Food>('content', (d) => (d as Food & { type?: string }).type === 'food')[0]!.id;
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (savedUploadsDir === undefined) delete process.env.UPLOADS_DIR;
  else process.env.UPLOADS_DIR = savedUploadsDir;
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

async function register(): Promise<{ token: string; userId: string }> {
  accounts += 1;
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: `food-photo-${accounts}@example.com`, password: PASSWORD });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

async function setTraining(token: string, foodPhotoTraining: boolean) {
  const res = await request(app)
    .put(`${base}/me/consents`)
    .set(auth(token))
    .send({ ...CONSENTS_OFF, foodPhotoTraining });
  expect(res.status).toBe(200);
  return res;
}

/** Upload, wait for the background job, confirm. Returns the job before confirm. */
async function scanAndConfirm(token: string): Promise<VisionJob> {
  const photo = await sharp({
    create: { width: 32, height: 24, channels: 3, background: { r: 180, g: 90, b: 40 } },
  })
    .jpeg()
    .toBuffer();
  const upload = await request(app)
    .post(`${base}/meal-photos`)
    .set(auth(token))
    .field('mealType', 'lunch')
    .attach('photo', photo, { filename: 'lunch.jpg', contentType: 'image/jpeg' });
  expect(upload.status).toBe(202);

  const jobId = upload.body.jobId as string;
  let job = getStore().byId<VisionJob>('ai', jobId)!;
  for (let i = 0; i < 40 && job.status !== 'succeeded'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    job = getStore().byId<VisionJob>('ai', jobId)!;
  }
  expect(job.status).toBe('succeeded');
  const original = structuredClone(job);

  const confirmed = await request(app)
    .post(`${base}/meal-photos/${jobId}/confirm`)
    .set(auth(token))
    .send({
      mealType: 'lunch',
      localDate: '2026-10-31',
      items: [{ foodId, name: 'Corrected name', grams: 150, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }],
    });
  expect(confirmed.status).toBe(201);
  return original;
}

const samplesOf = (userId: string) =>
  getStore().where<Sample>('ai', (d) => {
    const doc = d as unknown as Sample;
    return doc.type === 'foodPhotoSample' && doc.userId === userId;
  });

describe('food photo training', () => {
  it('keeps nothing without the opt-in, and the scan still works', async () => {
    const { token, userId } = await register();
    await scanAndConfirm(token);
    expect(samplesOf(userId)).toEqual([]);
  });

  it('keeps the photograph, the guess and the confirmed label under the opt-in', async () => {
    const { token, userId } = await register();
    await setTraining(token, true);
    const job = await scanAndConfirm(token);

    const [sample] = samplesOf(userId);
    expect(sample).toBeTruthy();
    expect(sample!.confirmed).toEqual([{ foodId, name: 'Corrected name', grams: 150 }]);
    expect(sample!.predictions).toEqual(job.predictions);
    expect(sample!.aiDegraded).toBe(false);
    expect(sample!.consentUpdatedAt).toBeTruthy();
    expect(fs.existsSync(sample!.imagePath)).toBe(true);
    expect(fs.existsSync(job.imagePath)).toBe(false);
  });

  it('keeps the stored choice when a client omits the field', async () => {
    const { token, userId } = await register();
    await setTraining(token, true);
    await scanAndConfirm(token);

    const res = await request(app).put(`${base}/me/consents`).set(auth(token)).send(CONSENTS_OFF);
    expect(res.status).toBe(200);
    expect(res.body.consents.foodPhotoTraining).toBe(true);
    expect(samplesOf(userId)).toHaveLength(1);
  });

  it('erases documents and files on withdrawal', async () => {
    const { token, userId } = await register();
    await setTraining(token, true);
    await scanAndConfirm(token);
    const [sample] = samplesOf(userId);

    await setTraining(token, false);
    expect(samplesOf(userId)).toEqual([]);
    expect(fs.existsSync(sample!.imagePath)).toBe(false);
  });

  it('expires a sample at the published retention limit, not before', async () => {
    const { token, userId } = await register();
    await setTraining(token, true);
    await scanAndConfirm(token);
    const [sample] = samplesOf(userId);
    const dayMs = 24 * 3600 * 1000;
    const createdAt = new Date(sample!.createdAt).getTime();

    await sweepVisionArtifacts(createdAt + (FOOD_PHOTO_SAMPLE_RETENTION_DAYS - 1) * dayMs);
    expect(samplesOf(userId)).toHaveLength(1);

    await sweepVisionArtifacts(createdAt + (FOOD_PHOTO_SAMPLE_RETENTION_DAYS + 1) * dayMs);
    expect(samplesOf(userId)).toEqual([]);
    expect(fs.existsSync(sample!.imagePath)).toBe(false);
  });

  it('erases sample files and every in-flight photo encoding on account deletion', async () => {
    const { token, userId } = await register();
    await setTraining(token, true);
    await scanAndConfirm(token);
    const [sample] = samplesOf(userId);

    const webp = path.join(uploadsDir, 'vj-purge-test.webp');
    fs.writeFileSync(webp, 'webp');
    const jpg = path.join(uploadsDir, 'vj-purge-test.jpg');
    fs.writeFileSync(jpg, 'jpg');
    getStore().upsert('ai', {
      id: 'vj-purge-test',
      userId,
      type: 'cvJob',
      status: 'succeeded',
      imagePath: jpg,
      imageVariants: [{ path: webp, mime: 'image/webp' }, { path: jpg, mime: 'image/jpeg' }],
    });

    await purgeUser(userId);
    expect(samplesOf(userId)).toEqual([]);
    expect(fs.existsSync(sample!.imagePath)).toBe(false);
    expect(fs.existsSync(webp)).toBe(false);
    expect(fs.existsSync(jpg)).toBe(false);
  });
});
