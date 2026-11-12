/**
 * New accounts made from Firebase identities are capped like Telegram ones.
 *
 * Firebase email/password sign-up needs only the public web API key: no
 * captcha, no App Check. Any verified ID token for an unknown uid provisions
 * a local user, from /auth/firebase/session, /auth/firebase/token, or any
 * authenticated route through requireAuth. /auth/register sits behind
 * Turnstile and Telegram behind per-IP and per-subnet caps; this path had
 * neither. The same caps now count new Firebase accounts (only new ones:
 * a returning identity is never refused), keyed on the client address the
 * Worker vouches for, not the shared edge.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-firebase-caps-'));
process.env.AZF_DATA_DIR = dataDir;
const SECRET = 'provision-caps-origin-secret-0123456789abcdef';
process.env.ORIGIN_SHARED_SECRET = SECRET;

vi.mock('../platform/firebaseAdmin', () => ({
  isFirebaseAdminConfigured: () => true,
  verifyFirebaseIdToken: async (token: string) =>
    token.startsWith('idt:') ? { uid: token.slice(4), email: `${token.slice(4)}@example.com`, emailVerified: false } : null,
  getFirebaseAuth: () => null,
  resetFirebaseAdminForTests: () => undefined,
  removeFirebaseIdentity: async () => undefined,
  FIREBASE_ACCOUNT_DELETE_FAILED: 'firebase_account_delete_failed',
}));

const { createApp } = await import('../app');
const { config } = await import('../platform/config');
const { resetNewAccountLimits } = await import('../modules/auth/service');
const app = createApp();
const base = '/api/v1';

beforeEach(() => resetNewAccountLimits());

afterAll(() => {
  delete process.env.ORIGIN_SHARED_SECRET;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let n = 0;
const freshUid = () => `cap-uid-${Date.now()}-${n++}`;

function session(uid: string, ip: string) {
  return request(app)
    .post(`${base}/auth/firebase/session`)
    .set('authorization', `Bearer idt:${uid}`)
    .set('x-origin-shared-secret', SECRET)
    .set('cf-connecting-ip', ip);
}

describe('new Firebase accounts', () => {
  it('stops one address minting accounts past the per-minute cap', async () => {
    const limit = config.telegramSignupPerIpPerMinute;
    for (let i = 0; i < limit; i += 1) expect((await session(freshUid(), '203.0.113.50')).status).toBe(200);
    expect((await session(freshUid(), '203.0.113.50')).status).toBe(429);
    expect((await session(freshUid(), '198.51.100.50')).status).toBe(200);
  });

  it('never refuses an identity that already has an account', async () => {
    const limit = config.telegramSignupPerIpPerMinute;
    const returning = freshUid();
    expect((await session(returning, '203.0.113.60')).status).toBe(200);
    for (let i = 1; i < limit; i += 1) await session(freshUid(), '203.0.113.60');
    expect((await session(freshUid(), '203.0.113.60')).status).toBe(429);
    expect((await session(returning, '203.0.113.60')).status).toBe(200);
  });

  it('caps accounts made through requireAuth as well', async () => {
    const limit = config.telegramSignupPerIpPerMinute;
    for (let i = 0; i < limit; i += 1) await session(freshUid(), '203.0.113.70');
    const res = await request(app)
      .get(`${base}/me`)
      .set('authorization', `Bearer idt:${freshUid()}`)
      .set('x-origin-shared-secret', SECRET)
      .set('cf-connecting-ip', '203.0.113.70');
    expect(res.status).toBe(429);
  });
});
