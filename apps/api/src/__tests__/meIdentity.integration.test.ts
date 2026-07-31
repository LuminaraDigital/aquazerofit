/**
 * Identity mutation integration (supertest, isolated AZF_DATA_DIR):
 * PATCH /me displayName + timezone roundtrip reflected in GET /me,
 * validation bounds, and the auth requirement.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-identity-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

let token = '';

beforeAll(async () => {
  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'identity@example.com', password: 'CorrectHorse9Battery', displayName: 'Original Name' });
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

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('PATCH /me', () => {
  it('updates displayName and the change is reflected in GET /me', async () => {
    const patched = await request(app)
      .patch(`${base}/me`)
      .set(auth())
      .send({ displayName: 'Updated Name' });
    expect(patched.status).toBe(200);
    expect(patched.body.user.displayName).toBe('Updated Name');

    const me = await request(app).get(`${base}/me`).set(auth());
    expect(me.status).toBe(200);
    expect(me.body.user.displayName).toBe('Updated Name');
  });

  it('sets an optional IANA timezone and keeps displayName untouched', async () => {
    const patched = await request(app)
      .patch(`${base}/me`)
      .set(auth())
      .send({ timezone: 'Australia/Sydney' });
    expect(patched.status).toBe(200);
    expect(patched.body.user.timezone).toBe('Australia/Sydney');
    expect(patched.body.user.displayName).toBe('Updated Name');

    const me = await request(app).get(`${base}/me`).set(auth());
    expect(me.body.user.timezone).toBe('Australia/Sydney');
  });

  it('rejects an invalid timezone name', async () => {
    const res = await request(app)
      .patch(`${base}/me`)
      .set(auth())
      .send({ timezone: 'Not/AZone' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a 0-char displayName (whitespace trims to empty)', async () => {
    for (const bad of ['', '   ']) {
      const res = await request(app).patch(`${base}/me`).set(auth()).send({ displayName: bad });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    }
  });

  it('rejects a 61-char displayName', async () => {
    const res = await request(app)
      .patch(`${base}/me`)
      .set(auth())
      .send({ displayName: 'x'.repeat(61) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('requires authentication', async () => {
    const res = await request(app).patch(`${base}/me`).send({ displayName: 'Nope' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });
});
