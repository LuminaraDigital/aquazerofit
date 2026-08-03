/**
 * Buddy challenge create / join / peek integration.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-chal-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

let tokenA = '';
let tokenB = '';

beforeAll(async () => {
  const a = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'chal-a@example.com', password: 'CorrectHorse9Battery', displayName: 'Alice' });
  expect(a.status).toBe(201);
  tokenA = a.body.accessToken as string;

  const b = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'chal-b@example.com', password: 'CorrectHorse9Battery', displayName: 'Bob' });
  expect(b.status).toBe(201);
  tokenB = b.body.accessToken as string;
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('buddy challenges', () => {
  it('creates a huddle, peeks publicly, and lets a second user join', async () => {
    const created = await request(app)
      .post(`${base}/challenges`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({ kind: 'logging_streak', targetDays: 7, durationDays: 14 });
    expect(created.status).toBe(201);
    expect(created.body.challenge.code).toMatch(/^AQUA-/);
    expect(created.body.challenge.members).toHaveLength(1);

    const code = created.body.challenge.code as string;
    const peek = await request(app).get(`${base}/challenges/peek/${code}`);
    expect(peek.status).toBe(200);
    expect(peek.body.challenge.memberCount).toBe(1);

    const joined = await request(app)
      .post(`${base}/challenges/join`)
      .set({ Authorization: `Bearer ${tokenB}` })
      .send({ code });
    expect(joined.status).toBe(200);
    expect(joined.body.challenge.members).toHaveLength(2);
    expect(joined.body.challenge.status).toBe('active');

    const listB = await request(app)
      .get(`${base}/challenges`)
      .set({ Authorization: `Bearer ${tokenB}` });
    expect(listB.status).toBe(200);
    expect(listB.body.challenges.some((c: { code: string }) => c.code === code)).toBe(true);
  });

  it('accepts growth share events without auth', async () => {
    const res = await request(app)
      .post(`${base}/analytics/events`)
      .send({
        name: 'share_opened',
        props: { kind: 'meal' },
        attribution: { ref: 'abc123', utmSource: 'test' },
      });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });
});
