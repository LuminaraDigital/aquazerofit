/**
 * Logging integration (supertest, isolated AZF_DATA_DIR): meal log CRUD with
 * Idempotency-Key replay, grouped day view, water totals, weight upsert per
 * local date, and the daily analytics DTO fed by those logs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-logs-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';
const DATE = '2026-07-20';

let token = '';

beforeAll(async () => {
  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'logs@example.com', password: 'CorrectHorse9Battery' });
  token = reg.body.accessToken as string;
  const profile = await request(app)
    .put(`${base}/me/profile`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      weightKg: 82,
      heightCm: 176,
      age: 29,
      sex: 'male',
      goal: 'lose',
      activityLevel: 'moderate',
      exerciseExperience: 'beginner',
      dietaryPreferences: [],
      allergies: [],
      equipment: ['dumbbells'],
      unitPreference: 'metric',
    });
  expect(profile.status).toBe(200);
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

const mealBody = {
  mealType: 'lunch',
  localDate: DATE,
  items: [
    { foodId: 'food-chicken-breast', name: 'Chicken Breast', grams: 150, kcal: 247.5, proteinG: 46.5, carbsG: 0, fatG: 5.4 },
    { name: 'Brown Rice', grams: 200, kcal: 224, proteinG: 4.6, carbsG: 47, fatG: 1.6 },
  ],
};

describe('meal logs', () => {
  let createdId = '';

  it('creates a meal log and computes totals server-side', async () => {
    const res = await request(app)
      .post(`${base}/meal-logs`)
      .set({ ...auth(), 'Idempotency-Key': 'meal-1' })
      .send(mealBody);
    expect(res.status).toBe(201);
    createdId = res.body.log.id;
    expect(res.body.log.totalKcal).toBeCloseTo(471.5, 1);
    expect(res.body.log.totalProteinG).toBeCloseTo(51.1, 1);
    expect(res.body.log.source).toBe('manual');
  });

  it('replays the original response for the same Idempotency-Key', async () => {
    const res = await request(app)
      .post(`${base}/meal-logs`)
      .set({ ...auth(), 'Idempotency-Key': 'meal-1' })
      .send(mealBody);
    expect(res.status).toBe(201);
    expect(res.body.log.id).toBe(createdId); // no duplicate created
    expect(res.headers['idempotency-replayed']).toBe('true');
  });

  it('creates a distinct log for a different Idempotency-Key', async () => {
    const res = await request(app)
      .post(`${base}/meal-logs`)
      .set({ ...auth(), 'Idempotency-Key': 'meal-2' })
      .send({ ...mealBody, mealType: 'breakfast' });
    expect(res.status).toBe(201);
    expect(res.body.log.id).not.toBe(createdId);
  });

  it('returns the day view grouped by meal type', async () => {
    const res = await request(app).get(`${base}/meal-logs?date=${DATE}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(DATE);
    expect(res.body.meals.lunch).toHaveLength(1);
    expect(res.body.meals.breakfast).toHaveLength(1);
    expect(res.body.meals.dinner).toHaveLength(0);
    expect(res.body.totals.totalKcal).toBeCloseTo(943, 0);
  });

  it('updates a meal log and recomputes totals', async () => {
    const res = await request(app)
      .put(`${base}/meal-logs/${createdId}`)
      .set(auth())
      .send({ items: [{ name: 'Apple', grams: 180, kcal: 93.6, proteinG: 0.5, carbsG: 24.8, fatG: 0.4 }] });
    expect(res.status).toBe(200);
    expect(res.body.log.totalKcal).toBeCloseTo(93.6, 1);
  });

  it('deletes a meal log', async () => {
    const del = await request(app).delete(`${base}/meal-logs/${createdId}`).set(auth());
    expect(del.status).toBe(204);
    const day = await request(app).get(`${base}/meal-logs?date=${DATE}`).set(auth());
    expect(day.body.meals.lunch).toHaveLength(0);
  });

  it('never exposes another user\'s logs', async () => {
    const other = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: 'other@example.com', password: 'CorrectHorse9Battery' });
    const day = await request(app)
      .get(`${base}/meal-logs?date=${DATE}`)
      .set('Authorization', `Bearer ${other.body.accessToken}`);
    expect(day.body.meals.breakfast).toHaveLength(0);
  });

  // TC-NUT-07: the grams schema is positive().max(5000) — every invalid
  // portion must be rejected as VALIDATION_FAILED, never stored.
  it.each([
    ['zero', 0],
    ['negative', -50],
    ['non-numeric', 'abc'],
    ['over the 5000g cap', 6000],
    ['missing', undefined],
  ])('rejects a meal item with %s grams', async (_label, grams) => {
    const item: Record<string, unknown> = {
      name: 'Bad Portion',
      kcal: 100,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
    };
    if (grams !== undefined) item.grams = grams;
    const res = await request(app)
      .post(`${base}/meal-logs`)
      .set(auth())
      .send({ mealType: 'snack', localDate: DATE, items: [item] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    const day = await request(app).get(`${base}/meal-logs?date=${DATE}`).set(auth());
    expect(day.body.meals.snack).toHaveLength(0);
  });
});

describe('water logs', () => {
  it('accumulates one-tap increments into the day total', async () => {
    const a = await request(app)
      .post(`${base}/water-logs`)
      .set(auth())
      .send({ amountMl: 350, localDate: DATE });
    expect(a.status).toBe(201);
    const b = await request(app)
      .post(`${base}/water-logs`)
      .set(auth())
      .send({ amountMl: 500, localDate: DATE });
    expect(b.body.dayTotalMl).toBe(850);
  });

  it('honours Idempotency-Key on water logs', async () => {
    const first = await request(app)
      .post(`${base}/water-logs`)
      .set({ ...auth(), 'Idempotency-Key': 'water-1' })
      .send({ amountMl: 250, localDate: DATE });
    const replay = await request(app)
      .post(`${base}/water-logs`)
      .set({ ...auth(), 'Idempotency-Key': 'water-1' })
      .send({ amountMl: 250, localDate: DATE });
    expect(replay.body.log.id).toBe(first.body.log.id);
    const day = await request(app).get(`${base}/water-logs?date=${DATE}`).set(auth());
    expect(day.body.totalMl).toBe(1100); // 850 + 250, not 1350
  });
});

describe('weight logs', () => {
  it('upserts one canonical entry per local date', async () => {
    const first = await request(app)
      .post(`${base}/weight-logs`)
      .set(auth())
      .send({ weightKg: 82.4, localDate: DATE });
    expect(first.status).toBe(201);
    const second = await request(app)
      .post(`${base}/weight-logs`)
      .set(auth())
      .send({ weightKg: 82.1, localDate: DATE, note: 'after run' });
    expect(second.body.log.id).toBe(first.body.log.id);
    expect(second.body.log.weightKg).toBe(82.1);
    expect(second.body.log.note).toBe('after run');
  });

  it('returns range points for charts', async () => {
    await request(app)
      .post(`${base}/weight-logs`)
      .set(auth())
      .send({ weightKg: 82.0, localDate: '2026-07-21' });
    const res = await request(app)
      .get(`${base}/weight-logs?range=30d`)
      .set({ ...auth(), 'X-Timezone': 'UTC' });
    expect(res.status).toBe(200);
    const dates = res.body.points.map((p: { date: string }) => p.date);
    expect(dates).toContain(DATE);
    expect(dates).toContain('2026-07-21');
  });
});

describe('daily analytics DTO', () => {
  it('aggregates logs against targets for the ring display', async () => {
    const res = await request(app)
      .get(`${base}/analytics/nutrition/daily?date=${DATE}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.kcalTarget).toBeGreaterThan(1500);
    expect(res.body.waterMl.consumed).toBe(1100);
    expect(res.body.kcalRemaining).toBeCloseTo(res.body.kcalTarget - res.body.kcalNet, 1);
    expect(res.body.meals).toHaveProperty('breakfast');
  });
});
