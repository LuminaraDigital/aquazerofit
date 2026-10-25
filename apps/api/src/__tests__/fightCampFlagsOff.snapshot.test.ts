/**
 * With every Fight Camp flag off, the API answers exactly as it did before
 * Fight Camp existed (AZF-P1 §10.2 DoD).
 *
 * The snapshot file was recorded by running this same file on the commits
 * Fight Camp was built on, 6a80efd and then origin/staging at 1732a90, which
 * produce identical output. Every read Fight Camp reached into
 * is in it: the Fight Record read (rollout off, and on with no Fight Camp
 * feature), the progress summary Cut Man can bridge, the coach card that
 * describes the same run, and the data export that gained an engage
 * section. A difference here is a behaviour change for people who have no
 * Fight Camp at all.
 *
 * Self-contained on purpose: it must run unchanged on the old commit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-fc-flags-off-'));
process.env.AZF_DATA_DIR = dataDir;
process.env.AZF_SEED_DEMO = 'false';
const FLAGS = Object.keys(process.env).filter((k) => k.startsWith('FC_') || k.startsWith('FIGHT_RECORD_'));
for (const key of FLAGS) delete process.env[key];

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { addDays } = await import('../platform/dates');
const app = createApp();
const base = '/api/v1';

/** Day 30 of season 1: a run with gaps, a belt reached, a week since the last miss. */
const TODAY = addDays(SEASON_ONE_STARTS_ON, 30);
const ACTIVE = [0, 1, 2, 4, 5, 6, 7, 9, 10, 11, 12, 13, 15, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 29, 30];

let token = '';
let userId = '';
const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Timezone': 'UTC' });

/** Ids and secrets that differ run to run; everything else must match. */
function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        /hash|token|secret/i.test(k) && typeof v === 'string' ? '<secret>' : normalise(v),
      ]),
    );
  }
  if (typeof value !== 'string') return value;
  if (value === userId) return '<user>';
  return value.replaceAll(userId, '<user>').replace(/\b([a-z]{2,8})[_-][0-9a-f]{8}-[0-9a-f-]{27,}\b/g, '$1_<id>');
}

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, result: true }) })));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00.000Z`));
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'flags-off@example.com', password: 'CorrectHorse9Battery', displayName: 'Rizal Noor' });
  expect(res.status).toBe(201);
  token = res.body.accessToken as string;
  userId = res.body.user.id as string;
  getStore().upsert('profiles', { id: `profile-${userId}`, type: 'wellnessProfile', userId, age: 30 });
  for (const day of ACTIVE) {
    const localDate = addDays(SEASON_ONE_STARTS_ON, day);
    getStore().upsert('logs', {
      id: `ml-flags-off-${day}`,
      userId,
      type: 'mealLog',
      mealType: 'lunch',
      items: [],
      totalKcal: 640,
      totalProteinG: 30,
      totalCarbsG: 70,
      totalFatG: 20,
      source: 'manual',
      localDate,
      loggedAt: `${localDate}T12:00:00.000Z`,
    });
  }
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const key of ['FIGHT_RECORD_ENABLED', 'FIGHT_RECORD_ROLLOUT_PERCENT', 'AZF_SEED_DEMO']) delete process.env[key];
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('every Fight Camp flag off', () => {
  it('answers the reads Fight Camp touched exactly as before Fight Camp', async () => {
    const read = async (route: string) => {
      const res = await request(app).get(`${base}${route}`).set(auth());
      expect(res.status, route).toBe(200);
      return normalise(res.body);
    };

    const fightRecordOff = await read('/fight-record');
    process.env.FIGHT_RECORD_ENABLED = 'true';
    process.env.FIGHT_RECORD_ROLLOUT_PERCENT = '100';
    const fightRecordOn = await read('/fight-record');
    const progressSummary = await read('/progress/summary');
    const progression = await read('/coaches/progression');
    const exported = await read('/me/export');

    const recorded = { fightRecordOff, fightRecordOn, progressSummary, progression, exported };
    await expect(`${JSON.stringify(recorded, null, 2)}\n`).toMatchFileSnapshot('./__snapshots__/flagsOff.api.json');
  });
});
