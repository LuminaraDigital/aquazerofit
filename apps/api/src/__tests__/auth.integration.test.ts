/**
 * Auth flow integration (supertest against createApp(), isolated data dir
 * via AZF_DATA_DIR): register, duplicate email, login, refresh rotation,
 * reuse -> family revocation, logout, and the seeded demo account.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-auth-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

const EMAIL = 'tester@example.com';
const PASSWORD = 'CorrectHorse9Battery';

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('register / login', () => {
  it('registers a new account and returns tokens + public user', async () => {
    const res = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: EMAIL, password: PASSWORD, displayName: 'Tester' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.refreshToken).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({
      email: EMAIL,
      displayName: 'Tester',
      role: 'user',
      hasProfile: false,
    });
  });

  it('rejects a duplicate email with CONFLICT', async () => {
    const res = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('rejects a weak password with the validation envelope', async () => {
    const res = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: 'weak@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('rejects a wrong password with AUTH_INVALID', async () => {
    const res = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: EMAIL, password: 'WrongPassword1234' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID');
  });

  it('logs in and the access token opens protected routes', async () => {
    const res = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    const me = await request(app)
      .get(`${base}/me/profile`)
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.profile).toBeNull();
  });

  it('rejects protected routes without a token', async () => {
    const res = await request(app).get(`${base}/me/profile`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });
});

describe('refresh rotation + family revocation', () => {
  it('rotates the refresh token and revokes the family on reuse', async () => {
    const login = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: EMAIL, password: PASSWORD });
    const original = login.body.refreshToken as string;

    // Rotate: old token is consumed, a new one is issued.
    const first = await request(app).post(`${base}/auth/refresh`).send({ refreshToken: original });
    expect(first.status).toBe(200);
    const rotated = first.body.refreshToken as string;
    expect(rotated).not.toBe(original);

    // Reuse of the consumed token = theft signal -> whole family revoked.
    const reuse = await request(app).post(`${base}/auth/refresh`).send({ refreshToken: original });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('AUTH_INVALID');

    // The rotated descendant is dead too (same family).
    const descendant = await request(app)
      .post(`${base}/auth/refresh`)
      .send({ refreshToken: rotated });
    expect(descendant.status).toBe(401);
  });

  it('logout revokes the refresh family', async () => {
    const login = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: EMAIL, password: PASSWORD });
    const token = login.body.refreshToken as string;

    const out = await request(app).post(`${base}/auth/logout`).send({ refreshToken: token });
    expect(out.status).toBe(204);

    const after = await request(app).post(`${base}/auth/refresh`).send({ refreshToken: token });
    expect(after.status).toBe(401);
  });

  it('logout kills the whole family, not just the presented token (rotated descendant dies too)', async () => {
    // login t0 → rotate to t1 → logout presenting the already-consumed t0:
    // family revocation must reach t1, which was never presented to logout.
    const login = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: EMAIL, password: PASSWORD });
    const t0 = login.body.refreshToken as string;

    const rotated = await request(app).post(`${base}/auth/refresh`).send({ refreshToken: t0 });
    expect(rotated.status).toBe(200);
    const t1 = rotated.body.refreshToken as string;

    const out = await request(app).post(`${base}/auth/logout`).send({ refreshToken: t0 });
    expect(out.status).toBe(204);

    const descendant = await request(app).post(`${base}/auth/refresh`).send({ refreshToken: t1 });
    expect(descendant.status).toBe(401);
    expect(descendant.body.code).toBe('AUTH_INVALID');
  });
});

describe('seeded demo account', () => {
  it('signs in with the documented demo credentials and has a full profile', async () => {
    const res = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: 'demo@aquazero.fit', password: 'AquaZeroDemo!2026' });
    expect(res.status).toBe(200);
    expect(res.body.user.hasProfile).toBe(true);

    const targets = await request(app)
      .get(`${base}/me/targets`)
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(targets.status).toBe(200);
    expect(targets.body.targets.kcalTarget).toBeGreaterThan(1500);
  });
});
