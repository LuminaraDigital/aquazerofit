/**
 * Dual auth: Firebase ID token path + legacy JWT fallback.
 * Firebase Admin is mocked so the suite stays offline / keyless.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-firebase-auth-'));
process.env.AZF_DATA_DIR = dataDir;

const verifyFirebaseIdToken = vi.fn();
vi.mock('../platform/firebaseAdmin', () => ({
  isFirebaseAdminConfigured: () => true,
  verifyFirebaseIdToken: (...args: unknown[]) => verifyFirebaseIdToken(...args),
  getFirebaseAuth: () => null,
  resetFirebaseAdminForTests: () => undefined,
}));

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

beforeAll(() => {
  verifyFirebaseIdToken.mockReset();
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('Firebase ID token auth', () => {
  it('hydrates a local user via POST /auth/firebase/session', async () => {
    verifyFirebaseIdToken.mockResolvedValueOnce({
      uid: 'fb-uid-1',
      email: 'firebase.user@example.com',
      emailVerified: true,
      name: 'Firebase User',
    });

    const res = await request(app)
      .post(`${base}/auth/firebase/session`)
      .set('Authorization', 'Bearer fake-firebase-id-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'firebase.user@example.com',
      displayName: 'Firebase User',
      emailVerified: true,
      hasPassword: false,
    });
  });

  it('accepts a Firebase ID token on a protected route', async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: 'fb-uid-1',
      email: 'firebase.user@example.com',
      emailVerified: true,
      name: 'Firebase User',
    });

    const me = await request(app)
      .get(`${base}/me`)
      .set('Authorization', 'Bearer fake-firebase-id-token');

    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('firebase.user@example.com');
  });

  it('falls back to legacy JWT when Firebase verification fails', async () => {
    verifyFirebaseIdToken.mockRejectedValueOnce(new Error('invalid firebase token'));

    // Register via legacy path to mint a real access JWT.
    const reg = await request(app)
      .post(`${base}/auth/register`)
      .send({
        email: 'legacy.jwt@example.com',
        password: 'CorrectHorse9Battery',
        displayName: 'Legacy',
      });
    expect(reg.status).toBe(201);
    const accessToken = reg.body.accessToken as string;

    verifyFirebaseIdToken.mockRejectedValueOnce(new Error('invalid firebase token'));
    const me = await request(app)
      .get(`${base}/me`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('legacy.jwt@example.com');
  });
});

describe('legacy JWT still works with Admin "configured"', () => {
  it('opens /me with a previously issued access token', async () => {
    verifyFirebaseIdToken.mockRejectedValue(new Error('not a firebase token'));
    const login = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: 'legacy.jwt@example.com', password: 'CorrectHorse9Battery' });
    expect(login.status).toBe(200);
    const me = await request(app)
      .get(`${base}/me`)
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
  });
});
