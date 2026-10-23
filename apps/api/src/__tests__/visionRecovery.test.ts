/**
 * Restart recovery for meal-photo vision jobs.
 *
 * A restart mid-analysis kills the processJob timer, so a job left queued or
 * processing must either be re-queued (photo still on disk) or failed with its
 * credit returned (photo lost) — never left as a permanent spinner holding a
 * reservation until the 24-hour sweep.
 */
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CREDIT_COSTS, FREE_TIER_DAILY_CREDITS } from '@aquazerofit/shared';
import { creditLedger } from '../modules/ai/creditLedger';
import { recoverStuckVisionJobs, sweepVisionArtifacts } from '../modules/vision/router';
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
const dataDir = createIsolatedDataDir('azf-vision-recovery-');
bindIsolatedDataDir(dataDir);
clearProviderEnv();

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const photoDir = path.join(dataDir, 'uploads');

type Job = { status?: string; error?: string };
let userId = '';

function photo(name: string): string {
  fs.mkdirSync(photoDir, { recursive: true });
  const file = path.join(photoDir, name);
  fs.writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  return file;
}

function stuckJob(id: string, fields: Record<string, unknown>): void {
  getStore().upsert('ai', {
    id,
    userId,
    type: 'cvJob',
    status: 'queued',
    mealType: 'lunch',
    predictions: [],
    ai: null,
    createdAt: new Date().toISOString(),
    ...fields,
  });
}

const job = (id: string) => getStore().byId<Job & { id: string }>('ai', id);

async function waitFor(pred: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!pred()) {
    if (Date.now() >= deadline) throw new Error('waitFor: timed out');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
});

beforeAll(async () => {
  const reg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'vision-recovery@example.com', password: 'CorrectHorse9Battery' });
  expect(reg.status).toBe(201);
  userId = reg.body.user.id as string;
  await getStore().flush();
});

afterAll(async () => {
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

describe('recoverStuckVisionJobs', () => {
  it('re-queues a job whose photo survived, and processJob runs it to completion', async () => {
    stuckJob('vj-recovery-requeue', { imagePath: photo('vj-recovery-requeue.jpg') });

    const result = await recoverStuckVisionJobs();

    expect(result).toEqual({ requeued: 1, failed: 0 });
    // Wait for a terminal state, not just "past queued": a job still
    // processing would be counted again by the next test's recovery call.
    const terminal = () => ['succeeded', 'failed'].includes(job('vj-recovery-requeue')?.status ?? '');
    await waitFor(terminal, 15_000);
  }, 20_000);

  it.each(['queued', 'processing'])('fails a %s job whose photo is gone and returns its credit', async (status) => {
    const reservationId = await creditLedger.reserve(userId, 'mealPhoto');
    expect(await creditLedger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS - CREDIT_COSTS.mealPhoto);
    const id = `vj-recovery-lost-${status}`;
    stuckJob(id, { status, imagePath: path.join(photoDir, `${id}.jpg`), reservationId });

    const result = await recoverStuckVisionJobs();

    expect(result).toEqual({ requeued: 0, failed: 1 });
    expect(job(id)?.status).toBe('failed');
    expect(job(id)?.error).toMatch(/restart/);
    expect(await creditLedger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);
  });

  it('leaves terminal jobs alone', async () => {
    const statuses = ['succeeded', 'failed', 'confirmed'];
    for (const status of statuses) stuckJob(`vj-term-${status}`, { status, completedAt: new Date().toISOString() });

    expect(await recoverStuckVisionJobs()).toEqual({ requeued: 0, failed: 0 });
    for (const status of statuses) expect(job(`vj-term-${status}`)?.status).toBe(status);
  });

  it('terminates a job on the next boot when the last one died between release and the failed write', async () => {
    const reservationId = await creditLedger.reserve(userId, 'mealPhoto');
    const id = 'vj-recovery-retry-after-release';
    stuckJob(id, { imagePath: path.join(photoDir, `${id}.jpg`), reservationId });
    // The crash point: the release landed, the failed status never did.
    await creditLedger.release(reservationId);
    expect(job(id)?.status).toBe('queued');

    expect((await recoverStuckVisionJobs()).failed).toBe(1);

    expect(job(id)?.status).toBe('failed');
    // The second release is a no-op, not a second refund.
    expect(await creditLedger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);
  });

  it('re-stamps createdAt so the boot sweep does not reclaim a job stuck past the 2-hour cutoff', async () => {
    const id = 'vj-recovery-old-requeue';
    stuckJob(id, {
      imagePath: photo(`${id}.jpg`),
      createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    });

    expect((await recoverStuckVisionJobs()).requeued).toBe(1);
    await sweepVisionArtifacts();

    expect(job(id)).toBeDefined();
    // Let the re-queued analysis finish so it cannot outlive the store teardown.
    await waitFor(() => ['succeeded', 'failed'].includes(job(id)?.status ?? ''), 15_000);
  }, 20_000);
});
