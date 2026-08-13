/**
 * REGRESSION GUARD — an account with no wellness profile is a supported state,
 * and it is never papered over with a made-up target.
 *
 * The client now opens the app before asking for anything, which means the API
 * is routinely queried for an account that has supplied no measurements. Two
 * properties have to hold for that to be safe.
 *
 * The first is that "no inputs" answers 404 rather than a plausible-looking
 * default. Everything the target calculator returns is traceable to a value the
 * user gave it and is clamped to a safety floor; a typical intake captioned
 * "your target" would be a health claim about somebody the system has never
 * measured, and it would be indistinguishable from a real one downstream.
 *
 * The second is that supplying the essentials is not itself a consent. The
 * profile write and the consent write are separate calls, and saving a profile
 * must leave every consent flag exactly where it was.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-firstrun-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { computeTargets } = await import('../modules/me/targets');
const app = createApp();
const base = '/api/v1';

/** Exactly the six fields the calculator reads, plus conservative defaults. */
const ESSENTIALS = {
  weightKg: 74,
  heightCm: 171,
  age: 31,
  sex: 'female' as const,
  goal: 'lose' as const,
  activityLevel: 'light' as const,
  unitPreference: 'metric' as const,
  exerciseExperience: 'beginner' as const,
  equipment: ['none' as const],
  dietaryPreferences: [],
  allergies: [],
};

let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'firstrun@example.com', password: 'CorrectHorse9Battery' });
  expect(reg.status).toBe(201);
  token = reg.body.accessToken as string;
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('a registered account that has not supplied its essentials', () => {
  it('is usable: GET /me answers, and reports that no profile exists', async () => {
    const me = await request(app).get(`${base}/me`).set(auth());
    expect(me.status).toBe(200);
    expect(me.body.user.hasProfile).toBe(false);
  });

  it('reads its (absent) profile as an explicit null rather than an error', async () => {
    const profile = await request(app).get(`${base}/me/profile`).set(auth());
    expect(profile.status).toBe(200);
    expect(profile.body.profile).toBeNull();
  });

  it('gets no targets at all — not a default one', async () => {
    const targets = await request(app).get(`${base}/me/targets`).set(auth());
    expect(targets.status).toBe(404);
    expect(JSON.stringify(targets.body)).not.toMatch(/kcalTarget/);
    expect(targets.body.message).toMatch(/height, weight, age and activity/i);
  });

  it('gets no fabricated daily ring either', async () => {
    const daily = await request(app)
      .get(`${base}/analytics/nutrition/daily`)
      .query({ date: '2026-08-04' })
      .set(auth());
    expect(daily.status).toBe(404);
    expect(daily.body.kcalTarget).toBeUndefined();
  });

  it('has every consent off while it waits', async () => {
    const consents = await request(app).get(`${base}/me/consents`).set(auth());
    expect(consents.status).toBe(200);
    expect(consents.body.consents.wellnessDataProcessing).toBe(false);
    expect(consents.body.consents.aiPersonalisation).toBe(false);
  });
});

describe('supplying the essentials later', () => {
  it('computes targets from the supplied values and nothing else', async () => {
    const saved = await request(app).put(`${base}/me/profile`).set(auth()).send(ESSENTIALS);
    expect(saved.status).toBe(200);

    const expected = computeTargets({
      userId: saved.body.profile.userId as string,
      ...ESSENTIALS,
      updatedAt: saved.body.profile.updatedAt as string,
    });
    expect(saved.body.targets.kcalTarget).toBe(expected.kcalTarget);
    expect(saved.body.targets.proteinG).toBe(expected.proteinG);
    expect(saved.body.targets.waterMl).toBe(expected.waterMl);

    const targets = await request(app).get(`${base}/me/targets`).set(auth());
    expect(targets.status).toBe(200);
    expect(targets.body.targets.kcalTarget).toBe(expected.kcalTarget);
  });

  it('does not grant any consent as a side effect of writing the profile', async () => {
    const consents = await request(app).get(`${base}/me/consents`).set(auth());
    expect(consents.body.consents.wellnessDataProcessing).toBe(false);
    expect(consents.body.consents.aiPersonalisation).toBe(false);
    expect(consents.body.consents.anonymisedAnalytics).toBe(false);
    expect(consents.body.consents.reminders).toBe(false);
  });

  it('opens the daily ring once the essentials exist', async () => {
    const daily = await request(app)
      .get(`${base}/analytics/nutrition/daily`)
      .query({ date: '2026-08-04' })
      .set(auth());
    expect(daily.status).toBe(200);
    expect(daily.body.kcalTarget).toBeGreaterThan(0);
  });
});
