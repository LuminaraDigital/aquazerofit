/**
 * /fight-record over HTTP (AZF-W3-05 §4.3, §7): the rollout gate, the
 * envelope, validation, the minor gate on the one public-facing write, and
 * that both stored document types ride the existing export and erasure
 * sweeps rather than needing their own.
 *
 * The clock is pinned (Date only, so express timers are untouched) because a
 * season is a calendar span and "today" decides which one is current.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-fight-record-http-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { addDays } = await import('../platform/dates');
const app = createApp();
const base = '/api/v1';

/** Day 20 of season 1, mid-morning UTC. */
const TODAY = addDays(SEASON_ONE_STARTS_ON, 20);

let token = '';
let userId = '';
const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Timezone': 'UTC' });

function seedActiveDays(count: number): void {
  for (let i = 0; i < count; i += 1) {
    const localDate = addDays(SEASON_ONE_STARTS_ON, i);
    getStore().upsert('logs', {
      id: `ml-http-${i}`,
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
}

const beltDocs = () =>
  getStore().where<{ id: string; type?: string; userId?: string }>(
    'logs',
    (d) => d.type === 'beltAward' && d.userId === userId,
  );

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00.000Z`));
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'fight-record@example.com', password: 'CorrectHorse9Battery', displayName: 'Rizal' });
  expect(res.status).toBe(201);
  token = res.body.accessToken as string;
  userId = res.body.user.id as string;
  seedActiveDays(3);
});

afterEach(() => {
  delete process.env.FIGHT_RECORD_ENABLED;
});

afterAll(async () => {
  vi.useRealTimers();
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('/fight-record', () => {
  it('requires authentication', async () => {
    const res = await request(app).get(`${base}/fight-record`);
    expect(res.status).toBe(401);
  });

  it('answers null and writes nothing while the feature is off', async () => {
    const res = await request(app).get(`${base}/fight-record`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ fightRecord: null });
    expect(beltDocs()).toHaveLength(0);

    const put = await request(app)
      .put(`${base}/fight-record/emoji-status`)
      .set(auth())
      .send({ enabled: true });
    expect(put.status).toBe(403);
    expect(put.body.code).toBe('FORBIDDEN');
  });

  it('serves the read model in its envelope, with no identifiers or health figures', async () => {
    process.env.FIGHT_RECORD_ENABLED = 'true';
    const res = await request(app).get(`${base}/fight-record`).set(auth());
    expect(res.status).toBe(200);
    const record = res.body.fightRecord;
    expect(record.current).toMatchObject({
      season: { number: 1, startsOn: SEASON_ONE_STARTS_ON },
      activeDays: 3,
      tier: 'white',
      next: { tier: 'blue', activeDays: 12 },
    });
    expect(record.celebrate).toMatchObject({ seasonNumber: 1, tier: 'white' });
    expect(record.adult).toBe(false);
    expect(record.emojiStatus).toEqual({ available: false, enabled: false });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(userId);
    expect(body).not.toMatch(/kcal|weight|protein|carbs|fat"/i);
    expect(beltDocs()).toHaveLength(1);
  });

  it('validates and applies the acknowledgement', async () => {
    process.env.FIGHT_RECORD_ENABLED = 'true';
    const bad = await request(app).post(`${base}/fight-record/ack`).set(auth()).send({});
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');

    const { body } = await request(app).get(`${base}/fight-record`).set(auth());
    const ack = await request(app)
      .post(`${base}/fight-record/ack`)
      .set(auth())
      .send({ awardId: body.fightRecord.celebrate.id });
    expect(ack.status).toBe(204);

    const after = await request(app).get(`${base}/fight-record`).set(auth());
    expect(after.body.fightRecord.celebrate).toBeNull();
  });

  it('refuses the emoji status to an account with no profile and to a minor', async () => {
    process.env.FIGHT_RECORD_ENABLED = 'true';
    const none = await request(app)
      .put(`${base}/fight-record/emoji-status`)
      .set(auth())
      .send({ enabled: true });
    expect(none.status).toBe(403);

    getStore().upsert('profiles', {
      id: `profile-${userId}`,
      type: 'wellnessProfile',
      userId,
      age: 16,
    });
    const minor = await request(app)
      .put(`${base}/fight-record/emoji-status`)
      .set(auth())
      .send({ enabled: true });
    expect(minor.status).toBe(403);
    expect(minor.body.code).toBe('FORBIDDEN');

    const off = await request(app)
      .put(`${base}/fight-record/emoji-status`)
      .set(auth())
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ emojiStatus: { available: false, enabled: false } });
  });

  it('exports both document types and erases them with the account', async () => {
    const exported = await request(app).get(`${base}/me/export`).set(auth());
    expect(exported.status).toBe(200);
    const types = (exported.body.logs as { type: string }[]).map((d) => d.type);
    expect(types).toContain('beltAward');
    expect(types).toContain('fightRecordState');

    expect((await request(app).delete(`${base}/me`).set(auth())).body.purged).toBe(false);
    expect((await request(app).delete(`${base}/me`).set(auth())).body.purged).toBe(true);
    expect(beltDocs()).toHaveLength(0);
    expect(
      getStore().where<{ id: string; type?: string; userId?: string }>(
        'logs',
        (d) => d.type === 'fightRecordState' && d.userId === userId,
      ),
    ).toHaveLength(0);
  });
});
