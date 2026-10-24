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
  removeFirebaseIdentity: async () => undefined,
  FIREBASE_ACCOUNT_DELETE_FAILED: 'firebase_account_delete_failed',
}));

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { ensureUserFromFirebase } = await import('../modules/auth/firebaseUsers');
const { signTelegramInitData } = await import('../modules/auth/telegram');
const { resetTelegramNewAccountLimits } = await import('../modules/auth/service');
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

describe('Firebase email linking requires a verified email', () => {
  it('links a verified Firebase identity to an existing normal account', async () => {
    const reg = await request(app)
      .post(`${base}/auth/register`)
      .send({
        email: 'verified.link@example.com',
        password: 'CorrectHorse9Battery',
        displayName: 'Verified Link',
      });
    expect(reg.status).toBe(201);
    const userId = reg.body.user.id as string;

    verifyFirebaseIdToken.mockResolvedValueOnce({
      uid: 'fb-verified-link',
      email: 'verified.link@example.com',
      emailVerified: true,
      name: 'Verified Link',
    });

    const res = await request(app)
      .post(`${base}/auth/firebase/session`)
      .set('Authorization', 'Bearer verified-link-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: userId,
      email: 'verified.link@example.com',
      role: 'user',
      emailVerified: true,
    });
    expect(getStore().byId<{ id: string; firebaseUid?: string }>('users', userId)?.firebaseUid).toBe(
      'fb-verified-link',
    );
  });

  it('links a verified Firebase identity to an existing account, including an admin', async () => {
    const store = getStore();
    store.upsert('users', {
      id: 'usr_admin_link',
      email: 'admin.link@example.com',
      emailVerified: true,
      role: 'admin',
      tier: 'premium',
      displayName: 'Admin Link',
      createdAt: new Date().toISOString(),
      deletionRequestedAt: null,
    });

    verifyFirebaseIdToken.mockResolvedValueOnce({
      uid: 'fb-admin-verified',
      email: 'admin.link@example.com',
      emailVerified: true,
      name: 'Admin Link',
    });

    const res = await request(app)
      .post(`${base}/auth/firebase/session`)
      .set('Authorization', 'Bearer verified-admin-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 'usr_admin_link',
      email: 'admin.link@example.com',
      role: 'admin',
      emailVerified: true,
    });
    expect(store.byId<{ id: string; firebaseUid?: string }>('users', 'usr_admin_link')?.firebaseUid).toBe(
      'fb-admin-verified',
    );
  });

  it('rejects an unverified email that matches a normal account and does not link it', async () => {
    const reg = await request(app)
      .post(`${base}/auth/register`)
      .send({
        email: 'victim.link@example.com',
        password: 'CorrectHorse9Battery',
        displayName: 'Victim',
      });
    expect(reg.status).toBe(201);
    const victimId = reg.body.user.id as string;

    verifyFirebaseIdToken.mockResolvedValueOnce({
      uid: 'fb-attacker-unverified',
      email: 'victim.link@example.com',
      emailVerified: false,
      name: 'Attacker',
    });

    const res = await request(app)
      .post(`${base}/auth/firebase/session`)
      .set('Authorization', 'Bearer unverified-victim-token')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTH_EMAIL_UNVERIFIED');
    expect(res.body.message).toBe('Verify your email first');

    const stored = getStore().byId<{ id: string; firebaseUid?: string; role: string }>('users', victimId);
    expect(stored?.firebaseUid).toBeUndefined();
    expect(stored?.role).toBe('user');
    const rejected = getStore().where<{ id: string; userId?: string; action?: string; detail?: unknown }>(
      'audit',
      (d) => d.userId === victimId && d.action === 'firebase.link.rejected',
    );
    expect(rejected.length).toBeGreaterThan(0);
    expect(JSON.stringify(rejected)).not.toContain('victim.link@example.com');
    expect(JSON.stringify(rejected)).not.toContain('fb-attacker-unverified');

    verifyFirebaseIdToken.mockResolvedValueOnce({
      uid: 'fb-attacker-unverified',
      email: 'victim.link@example.com',
      emailVerified: false,
      name: 'Attacker',
    });
    const me = await request(app)
      .get(`${base}/me`)
      .set('Authorization', 'Bearer unverified-victim-token');
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('AUTH_EMAIL_UNVERIFIED');
  });

  it('rejects an unverified email that matches an admin and does not elevate', async () => {
    const store = getStore();
    store.upsert('users', {
      id: 'usr_admin_unverified',
      email: 'admin.unverified@example.com',
      emailVerified: true,
      role: 'admin',
      tier: 'premium',
      displayName: 'Root',
      createdAt: new Date().toISOString(),
      deletionRequestedAt: null,
    });

    const unverifiedAdmin = {
      uid: 'fb-admin-takeover',
      email: 'Admin.Unverified@example.com',
      emailVerified: false,
      name: 'Takeover',
    };
    verifyFirebaseIdToken.mockResolvedValueOnce(unverifiedAdmin);

    const session = await request(app)
      .post(`${base}/auth/firebase/session`)
      .set('Authorization', 'Bearer unverified-admin-token')
      .send({});
    expect(session.status).toBe(403);
    expect(session.body.code).toBe('AUTH_EMAIL_UNVERIFIED');
    expect(session.body.message).toBe('Verify your email first');

    verifyFirebaseIdToken.mockResolvedValueOnce(unverifiedAdmin);
    const me = await request(app)
      .get(`${base}/me`)
      .set('Authorization', 'Bearer unverified-admin-token');
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('AUTH_EMAIL_UNVERIFIED');

    const stored = store.byId<{ id: string; firebaseUid?: string; role: string; emailVerified: boolean }>(
      'users',
      'usr_admin_unverified',
    );
    expect(stored?.firebaseUid).toBeUndefined();
    expect(stored?.role).toBe('admin');
    expect(stored?.emailVerified).toBe(true);
    const squatters = store.where<{ id: string; email?: string; firebaseUid?: string }>('users', (d) => {
      return d.firebaseUid === 'fb-admin-takeover' || d.email === 'admin.unverified@example.com';
    });
    expect(squatters).toHaveLength(1);
    expect(squatters[0]?.id).toBe('usr_admin_unverified');
  });

  it('provisions a new user for an unverified identity that matches nobody', async () => {
    verifyFirebaseIdToken.mockResolvedValueOnce({
      uid: 'fb-brand-new',
      email: 'brand.new.firebase@example.com',
      emailVerified: false,
      name: 'Brand New',
    });

    const res = await request(app)
      .post(`${base}/auth/firebase/session`)
      .set('Authorization', 'Bearer brand-new-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'brand.new.firebase@example.com',
      displayName: 'Brand New',
      role: 'user',
      tier: 'free',
    });
    expect(res.body.user.role).not.toBe('admin');
    const stored = getStore().byId<{
      id: string;
      firebaseUid?: string;
      role: string;
      emailVerified: boolean;
    }>('users', res.body.user.id as string);
    expect(stored?.firebaseUid).toBe('fb-brand-new');
    expect(stored?.role).toBe('user');

    // A later unverified token for the same uid must stay on this new account
    // even if the email claim names an administrator.
    getStore().upsert('users', {
      id: 'usr_sticky_admin',
      email: 'sticky.admin@example.com',
      emailVerified: true,
      role: 'admin',
      tier: 'premium',
      displayName: 'Sticky Admin',
      createdAt: new Date().toISOString(),
      deletionRequestedAt: null,
    });
    verifyFirebaseIdToken.mockResolvedValueOnce({
      uid: 'fb-brand-new',
      email: 'sticky.admin@example.com',
      emailVerified: false,
      name: 'Brand New',
    });
    const again = await request(app)
      .post(`${base}/auth/firebase/session`)
      .set('Authorization', 'Bearer brand-new-token-again')
      .send({});
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(res.body.user.id);
    expect(again.body.user.role).toBe('user');
    expect(again.body.user.email).toBe('brand.new.firebase@example.com');
    const admin = getStore().byId<{ id: string; firebaseUid?: string; role: string }>('users', 'usr_sticky_admin');
    expect(admin?.firebaseUid).toBeUndefined();
    expect(admin?.role).toBe('admin');
  });

  it('leaves emailVerified false for a brand-new unverified identity in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const user = ensureUserFromFirebase(
        {
          uid: 'fb-prod-unverified-new',
          email: 'prod.unverified.new@example.com',
          emailVerified: false,
          name: 'Prod New',
        },
        '127.0.0.1',
      );
      expect(user.role).toBe('user');
      expect(user.tier).toBe('free');
      expect(user.emailVerified).toBe(false);
      expect(user.firebaseUid).toBe('fb-prod-unverified-new');
      expect(user.email).toBe('prod.unverified.new@example.com');

      const verified = ensureUserFromFirebase({
        uid: 'fb-prod-verified-new',
        email: 'prod.verified.new@example.com',
        emailVerified: true,
        name: 'Prod Verified',
      });
      expect(verified.role).toBe('user');
      expect(verified.emailVerified).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('does not link a verified Google sign-in onto an email a Telegram account claimed', async () => {
    resetTelegramNewAccountLimits();
    const initData = signTelegramInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'AA-takeover',
      user: JSON.stringify({ id: 770001, first_name: 'Squatter' }),
    });
    const tg = await request(app).post(`${base}/auth/telegram`).send({ initData });
    expect(tg.status).toBe(200);
    const attackerId = tg.body.user.id as string;

    const set = await request(app)
      .post(`${base}/me/credentials`)
      .set('Authorization', `Bearer ${tg.body.accessToken}`)
      .send({ email: 'Victim.Takeover@example.com', password: 'CorrectHorse9Battery' });
    expect(set.status).toBe(200);
    expect(set.body.user.email).toBe('victim.takeover@example.com');
    expect(set.body.user.emailVerified).toBe(false);

    verifyFirebaseIdToken.mockResolvedValueOnce({
      uid: 'fb-victim-google',
      email: 'victim.takeover@example.com',
      emailVerified: true,
      name: 'Victim',
    });
    const session = await request(app)
      .post(`${base}/auth/firebase/session`)
      .set('Authorization', 'Bearer victim-google-token')
      .send({});
    expect(session.status).toBe(403);
    expect(session.body.code).toBe('AUTH_EMAIL_UNVERIFIED');
    expect(session.body.message).toBe('This email is not verified on the existing account');

    const stored = getStore().byId<{
      id: string;
      email: string;
      emailVerified: boolean;
      firebaseUid?: string;
      tgId?: number;
      role: string;
    }>('users', attackerId);
    expect(stored?.firebaseUid).toBeUndefined();
    expect(stored?.emailVerified).toBe(false);
    expect(stored?.email).toBe('victim.takeover@example.com');
    expect(stored?.tgId).toBe(770001);
    expect(stored?.role).toBe('user');

    const linked = getStore().where<{ id: string; firebaseUid?: string }>('users', (d) => {
      return d.firebaseUid === 'fb-victim-google';
    });
    expect(linked).toHaveLength(0);

    const rejected = getStore().where<{ id: string; userId?: string; action?: string; detail?: { reason?: string } }>(
      'audit',
      (d) => d.userId === attackerId && d.action === 'firebase.link.rejected',
    );
    expect(rejected.some((event) => event.detail?.reason === 'account_email_unverified')).toBe(true);
    expect(JSON.stringify(rejected)).not.toContain('victim.takeover@example.com');
    expect(JSON.stringify(rejected)).not.toContain('fb-victim-google');

    verifyFirebaseIdToken.mockResolvedValueOnce({
      uid: 'fb-victim-google',
      email: 'victim.takeover@example.com',
      emailVerified: true,
      name: 'Victim',
    });
    const me = await request(app).get(`${base}/me`).set('Authorization', 'Bearer victim-google-token');
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('AUTH_EMAIL_UNVERIFIED');
    expect(getStore().byId<{ id: string; firebaseUid?: string }>('users', attackerId)?.firebaseUid).toBeUndefined();
  });

  it('refuses to link when the stored email is unverified, even if the token is verified', () => {
    getStore().upsert('users', {
      id: 'usr_unverified_stored',
      email: 'unverified.stored@example.com',
      emailVerified: false,
      role: 'user',
      tier: 'free',
      displayName: 'Unverified',
      createdAt: new Date().toISOString(),
      deletionRequestedAt: null,
    });
    expect(() =>
      ensureUserFromFirebase({
        uid: 'fb-should-not-link',
        email: 'unverified.stored@example.com',
        emailVerified: true,
        name: 'Verified Token',
      }),
    ).toThrowError(/not verified on the existing account/);
    const stored = getStore().byId<{ id: string; firebaseUid?: string; emailVerified: boolean }>(
      'users',
      'usr_unverified_stored',
    );
    expect(stored?.firebaseUid).toBeUndefined();
    expect(stored?.emailVerified).toBe(false);
  });

  it('marks a brand-new unverified identity verified outside production, same as password registration', () => {
    const user = ensureUserFromFirebase({
      uid: 'fb-dev-unverified-new',
      email: 'dev.unverified.new@example.com',
      emailVerified: false,
      name: 'Dev New',
    });
    expect(user.role).toBe('user');
    expect(user.tier).toBe('free');
    expect(user.emailVerified).toBe(true);
    expect(user.firebaseUid).toBe('fb-dev-unverified-new');
  });
});
