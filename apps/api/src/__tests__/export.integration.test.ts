/**
 * Integration tests for /export/diary and /logs/copy-previous endpoints.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-export-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

let token = '';

beforeAll(async () => {
  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'exportuser@example.com', password: 'CorrectHorse9Battery' });
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

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('Export diary endpoint GET /api/v1/export/diary', () => {
  it('requires authentication', async () => {
    const res = await request(app).get(`${base}/export/diary`);
    expect(res.status).toBe(401);
  });

  it('rejects invalid format query param with 400 Bad Request', async () => {
    const res = await request(app)
      .get(`${base}/export/diary?format=invalidformat`)
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('exports diary data in JSON format by default', async () => {
    // Seed a meal log and water log
    await request(app)
      .post(`${base}/meal-logs`)
      .set(auth())
      .send({
        mealType: 'breakfast',
        localDate: '2026-08-10',
        items: [
          {
            name: 'Oats with Milk',
            grams: 250,
            kcal: 300,
            proteinG: 12,
            carbsG: 45,
            fatG: 6,
            fiberG: 5,
            sugarG: 8,
            sodiumMg: 120,
            potassiumMg: 350,
            calciumMg: 200,
            ironMg: 2,
          },
        ],
      });

    await request(app)
      .post(`${base}/water-logs`)
      .set(auth())
      .send({ amountMl: 500, localDate: '2026-08-10' });

    const res = await request(app).get(`${base}/export/diary`).set(auth());

    expect(res.status).toBe(200);
    expect(res.body.format).toBe('json');
    expect(res.body.userId).toBeDefined();
    expect(res.body.exportedAt).toBeDefined();
    expect(res.body.totals).toBeDefined();
    expect(res.body.totals.totalKcal).toBeGreaterThanOrEqual(300);
    expect(res.body.totals.totalProteinG).toBeGreaterThanOrEqual(12);
    expect(res.body.totals.totalFiberG).toBeGreaterThanOrEqual(5);
    expect(res.body.totals.totalWaterMl).toBeGreaterThanOrEqual(500);
    expect(res.body.mealLogs).toHaveLength(1);
    expect(res.body.waterLogs).toHaveLength(1);
  });

  it('exports diary data in CSV format when format=csv', async () => {
    const res = await request(app)
      .get(`${base}/export/diary?format=csv`)
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment; filename="diary-export.csv"');
    expect(res.text).toContain('Date,Entry Type,Meal Type,Item Name');
    expect(res.text).toContain('Oats with Milk');
    expect(res.text).toContain('Water');
  });

  it('filters export by date when date query param is provided', async () => {
    const res = await request(app)
      .get(`${base}/export/diary?date=2026-08-10&format=json`)
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.mealLogs).toHaveLength(1);
    expect(res.body.mealLogs[0].localDate).toBe('2026-08-10');

    const emptyRes = await request(app)
      .get(`${base}/export/diary?date=2020-01-01&format=json`)
      .set(auth());

    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.mealLogs).toHaveLength(0);
  });
});

describe('Copy previous day endpoint POST /api/v1/logs/copy-previous', () => {
  it('requires authentication', async () => {
    const res = await request(app).post(`${base}/logs/copy-previous`);
    expect(res.status).toBe(401);
  });

  it('duplicates yesterday meal entries to today', async () => {
    const sourceDate = '2026-08-11';
    const targetDate = '2026-08-12';

    // Seed meal log for sourceDate
    await request(app)
      .post(`${base}/meal-logs`)
      .set(auth())
      .send({
        mealType: 'lunch',
        localDate: sourceDate,
        items: [
          { name: 'Grilled Salmon', grams: 200, kcal: 416, proteinG: 40, carbsG: 0, fatG: 26 },
          { name: 'Quinoa', grams: 150, kcal: 180, proteinG: 6, carbsG: 32, fatG: 3 },
        ],
      });

    // Copy previous day's meals targeting targetDate
    const copyRes = await request(app)
      .post(`${base}/logs/copy-previous`)
      .set(auth())
      .send({ localDate: targetDate });

    expect(copyRes.status).toBe(201);
    expect(copyRes.body.copiedCount).toBe(1);
    expect(copyRes.body.date).toBe(targetDate);
    expect(copyRes.body.sourceDate).toBe(sourceDate);
    expect(copyRes.body.logs).toHaveLength(1);
    expect(copyRes.body.logs[0].mealType).toBe('lunch');
    expect(copyRes.body.logs[0].localDate).toBe(targetDate);

    // Verify day view for targetDate
    const dayRes = await request(app)
      .get(`${base}/meal-logs?date=${targetDate}`)
      .set(auth());

    expect(dayRes.status).toBe(200);
    expect(dayRes.body.meals.lunch).toHaveLength(1);
    expect(dayRes.body.meals.lunch[0].items[0].name).toBe('Grilled Salmon');
  });

  it('returns 0 copiedCount when yesterday has no meals', async () => {
    const targetDate = '2025-01-01';
    const copyRes = await request(app)
      .post(`${base}/logs/copy-previous`)
      .set(auth())
      .send({ localDate: targetDate });

    expect(copyRes.status).toBe(201);
    expect(copyRes.body.copiedCount).toBe(0);
    expect(copyRes.body.logs).toHaveLength(0);
  });
});
