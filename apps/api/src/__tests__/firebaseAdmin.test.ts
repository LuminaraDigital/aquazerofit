/**
 * Firebase Admin init branches and account-erasure calls.
 * The Admin SDK is mocked, so the suite stays offline and keyless.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-fb-admin-'));
const savedDataDir = process.env.AZF_DATA_DIR;
process.env.AZF_DATA_DIR = dataDir;

const FIREBASE_ENV_KEYS = [
  'FIREBASE_SERVICE_ACCOUNT_PATH',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'GOOGLE_APPLICATION_CREDENTIALS',
] as const;

const savedFirebaseEnv = new Map<string, string | undefined>();

const sdk = vi.hoisted(() => {
  const deleteUser = vi.fn(async () => undefined);
  const revokeRefreshTokens = vi.fn(async () => undefined);
  const verifyIdToken = vi.fn();
  const initializeApp = vi.fn(() => ({ name: '[DEFAULT]' }));
  const cert = vi.fn((value: unknown) => ({ kind: 'cert' as const, value }));
  const applicationDefault = vi.fn(() => ({ kind: 'adc' as const }));
  const getApps = vi.fn(() => [] as unknown[]);
  const getAuth = vi.fn(() => ({ deleteUser, revokeRefreshTokens, verifyIdToken }));
  const logEvent = vi.fn();
  return {
    deleteUser,
    revokeRefreshTokens,
    verifyIdToken,
    initializeApp,
    cert,
    applicationDefault,
    getApps,
    getAuth,
    logEvent,
  };
});

vi.mock('firebase-admin/app', () => ({
  initializeApp: sdk.initializeApp,
  cert: sdk.cert,
  applicationDefault: sdk.applicationDefault,
  getApps: sdk.getApps,
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: sdk.getAuth,
}));

vi.mock('../platform/telemetry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../platform/telemetry')>();
  return { ...actual, logEvent: sdk.logEvent };
});

const { bindIsolatedDataDir, pinIsolatedDataDir, teardownIsolatedDataDir } = await import(
  './helpers/integrationIsolation'
);
bindIsolatedDataDir(dataDir);

const {
  FIREBASE_ACCOUNT_DELETE_FAILED,
  isFirebaseAdminConfigured,
  resetFirebaseAdminForTests,
  verifyFirebaseIdToken,
} = await import('../platform/firebaseAdmin');
const { purgeUser, requestDeletion, sweepExpiredDeletions } = await import('../modules/me/service');
const { getStore } = await import('../platform/store');

const DELETE_MESSAGE =
  'Could not delete the sign-in identity. Your account was not removed. Try again.';

function clearFirebaseEnv(): void {
  for (const key of FIREBASE_ENV_KEYS) delete process.env[key];
}

function firebaseErr(code: string): Error {
  const err = new Error(`firebase ${code}`);
  return Object.assign(err, { code });
}

function makeUser(partial: Partial<User> & Pick<User, 'id' | 'email'>): User {
  return {
    emailVerified: true,
    role: 'user',
    tier: 'free',
    displayName: 'Member',
    createdAt: new Date().toISOString(),
    deletionRequestedAt: null,
    ...partial,
  };
}

function rememberProfile(userId: string): void {
  getStore().upsert('profiles', {
    id: `profile-${userId}`,
    userId,
    type: 'wellnessProfile',
  });
}

beforeAll(() => {
  for (const key of FIREBASE_ENV_KEYS) savedFirebaseEnv.set(key, process.env[key]);
});

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
  resetFirebaseAdminForTests();
  clearFirebaseEnv();
  sdk.initializeApp.mockReset();
  sdk.initializeApp.mockImplementation(() => ({ name: '[DEFAULT]' }));
  sdk.cert.mockReset();
  sdk.cert.mockImplementation((value: unknown) => ({ kind: 'cert' as const, value }));
  sdk.applicationDefault.mockReset();
  sdk.applicationDefault.mockImplementation(() => ({ kind: 'adc' as const }));
  sdk.getApps.mockReset();
  sdk.getApps.mockReturnValue([]);
  sdk.deleteUser.mockReset();
  sdk.revokeRefreshTokens.mockReset();
  sdk.verifyIdToken.mockReset();
  sdk.deleteUser.mockResolvedValue(undefined);
  sdk.revokeRefreshTokens.mockResolvedValue(undefined);
  sdk.getAuth.mockReset();
  sdk.getAuth.mockImplementation(() => ({
    deleteUser: sdk.deleteUser,
    revokeRefreshTokens: sdk.revokeRefreshTokens,
    verifyIdToken: sdk.verifyIdToken,
  }));
  sdk.logEvent.mockReset();
});

afterAll(async () => {
  resetFirebaseAdminForTests();
  for (const key of FIREBASE_ENV_KEYS) {
    const value = savedFirebaseEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await teardownIsolatedDataDir(dataDir, savedDataDir);
});

describe('Firebase Admin init', () => {
  it('uses the key file from FIREBASE_SERVICE_ACCOUNT_PATH and does not use ADC', () => {
    const privateKey = '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n';
    const keyPath = path.join(dataDir, 'sa.json');
    fs.writeFileSync(
      keyPath,
      JSON.stringify({
        project_id: 'aquazerofit',
        client_email: 'azf-api@aquazerofit.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
    );
    process.env.GOOGLE_CLOUD_PROJECT = 'some-other-project';
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = keyPath;

    expect(isFirebaseAdminConfigured()).toBe(true);
    expect(sdk.applicationDefault).not.toHaveBeenCalled();
    expect(sdk.cert).toHaveBeenCalledWith({
      projectId: 'aquazerofit',
      clientEmail: 'azf-api@aquazerofit.iam.gserviceaccount.com',
      privateKey,
    });
    expect(sdk.initializeApp).toHaveBeenCalledWith({
      credential: {
        kind: 'cert',
        value: {
          projectId: 'aquazerofit',
          clientEmail: 'azf-api@aquazerofit.iam.gserviceaccount.com',
          privateKey,
        },
      },
      projectId: 'aquazerofit',
    });
  });

  it('uses the three JSON env fields, turning escaped newlines back into real ones', () => {
    process.env.FIREBASE_PROJECT_ID = 'aquazerofit';
    process.env.FIREBASE_CLIENT_EMAIL = 'sa@aquazerofit.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = 'line1\\nline2\\n';

    expect(isFirebaseAdminConfigured()).toBe(true);
    expect(sdk.applicationDefault).not.toHaveBeenCalled();
    expect(sdk.cert).toHaveBeenCalledWith({
      projectId: 'aquazerofit',
      clientEmail: 'sa@aquazerofit.iam.gserviceaccount.com',
      privateKey: 'line1\nline2\n',
    });
  });

  it('refuses a half-configured JSON env instead of falling through to ADC', () => {
    process.env.FIREBASE_PROJECT_ID = 'aquazerofit';
    expect(isFirebaseAdminConfigured()).toBe(false);
    expect(sdk.applicationDefault).not.toHaveBeenCalled();
    expect(sdk.cert).not.toHaveBeenCalled();
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });

  it('uses applicationDefault() when no key path or JSON env is set', () => {
    expect(isFirebaseAdminConfigured()).toBe(true);
    expect(sdk.cert).not.toHaveBeenCalled();
    expect(sdk.applicationDefault).toHaveBeenCalledTimes(1);
    expect(sdk.initializeApp).toHaveBeenCalledWith({
      credential: { kind: 'adc' },
    });
  });

  it('passes GOOGLE_CLOUD_PROJECT into the ADC app when it is set', () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'aquazerofit';
    expect(isFirebaseAdminConfigured()).toBe(true);
    expect(sdk.applicationDefault).toHaveBeenCalledTimes(1);
    expect(sdk.cert).not.toHaveBeenCalled();
    expect(sdk.initializeApp).toHaveBeenCalledWith({
      credential: { kind: 'adc' },
      projectId: 'aquazerofit',
    });
  });

  it('uses GCLOUD_PROJECT when GOOGLE_CLOUD_PROJECT is unset', () => {
    process.env.GCLOUD_PROJECT = 'aquazerofit';
    expect(isFirebaseAdminConfigured()).toBe(true);
    expect(sdk.initializeApp).toHaveBeenCalledWith({
      credential: { kind: 'adc' },
      projectId: 'aquazerofit',
    });
  });

  function fakeJwt(header: Record<string, unknown>): string {
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify({ sub: 'uid-1' })).toString('base64url');
    return `${encodedHeader}.${encodedPayload}.sig`;
  }

  it('does not initialise Admin for a legacy HS256 access token', async () => {
    const legacy = fakeJwt({ alg: 'HS256', typ: 'JWT' });
    await expect(verifyFirebaseIdToken(legacy)).resolves.toBeNull();
    expect(sdk.verifyIdToken).not.toHaveBeenCalled();
    expect(sdk.applicationDefault).not.toHaveBeenCalled();
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });

  it('treats email_verified as verified only when the claim is boolean true', async () => {
    const firebaseToken = fakeJwt({ alg: 'RS256', kid: 'key-1' });
    sdk.verifyIdToken.mockResolvedValueOnce({
      uid: 'uid-1',
      email: 'a@b.c',
      email_verified: false,
      name: 'A',
    });
    await expect(verifyFirebaseIdToken(firebaseToken)).resolves.toMatchObject({
      uid: 'uid-1',
      emailVerified: false,
    });
    expect(sdk.verifyIdToken).toHaveBeenCalledWith(firebaseToken, true);

    resetFirebaseAdminForTests();
    sdk.verifyIdToken.mockResolvedValueOnce({
      uid: 'uid-1',
      email: 'a@b.c',
      email_verified: true,
    });
    await expect(verifyFirebaseIdToken(fakeJwt({ alg: 'RS256', kid: 'key-1' }))).resolves.toMatchObject({
      emailVerified: true,
    });

    resetFirebaseAdminForTests();
    sdk.verifyIdToken.mockResolvedValueOnce({
      uid: 'uid-1',
      email_verified: 'true',
    });
    await expect(verifyFirebaseIdToken(fakeJwt({ alg: 'RS256', kid: 'key-1' }))).resolves.toMatchObject({
      emailVerified: false,
    });
  });
});

describe('account purge removes the Firebase user first', () => {
  it('revokes refresh tokens, then deletes the user, then erases local data', async () => {
    const account = makeUser({ id: 'usr_fb_ok', email: 'fb.ok@example.com', firebaseUid: 'fb-ok' });
    getStore().upsert('users', account);
    rememberProfile(account.id);
    const order: string[] = [];
    sdk.revokeRefreshTokens.mockImplementation(async () => {
      order.push('revoke');
    });
    sdk.deleteUser.mockImplementation(async () => {
      order.push('delete');
    });

    await purgeUser(account.id);

    expect(order).toEqual(['revoke', 'delete']);
    expect(sdk.revokeRefreshTokens).toHaveBeenCalledWith('fb-ok');
    expect(sdk.deleteUser).toHaveBeenCalledWith('fb-ok');
    expect(getStore().byId('users', account.id)).toBeUndefined();
    expect(getStore().byId('profiles', `profile-${account.id}`)).toBeUndefined();
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });

  it('treats auth/user-not-found as success and still finishes the local purge', async () => {
    const account = makeUser({
      id: 'usr_fb_gone',
      email: 'fb.gone@example.com',
      firebaseUid: 'fb-gone',
    });
    getStore().upsert('users', account);
    sdk.revokeRefreshTokens.mockRejectedValueOnce(firebaseErr('auth/user-not-found'));
    sdk.deleteUser.mockRejectedValueOnce(firebaseErr('auth/user-not-found'));

    await purgeUser(account.id);

    expect(sdk.deleteUser).toHaveBeenCalledWith('fb-gone');
    expect(getStore().byId('users', account.id)).toBeUndefined();
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });

  it('does not erase local data when deleteUser fails, and logs a stable code', async () => {
    const account = makeUser({
      id: 'usr_fb_fail',
      email: 'fb.fail@example.com',
      firebaseUid: 'fb-fail',
    });
    getStore().upsert('users', account);
    rememberProfile(account.id);
    sdk.deleteUser.mockRejectedValueOnce(firebaseErr('auth/internal-error'));

    await expect(purgeUser(account.id)).rejects.toMatchObject({
      code: 'INTERNAL',
      message: DELETE_MESSAGE,
    });

    expect(sdk.revokeRefreshTokens).toHaveBeenCalledWith('fb-fail');
    expect(sdk.deleteUser).toHaveBeenCalledWith('fb-fail');
    expect(getStore().byId<User>('users', account.id)?.email).toBe('fb.fail@example.com');
    expect(getStore().byId('profiles', `profile-${account.id}`)).toBeDefined();
    expect(sdk.logEvent).toHaveBeenCalledWith(
      FIREBASE_ACCOUNT_DELETE_FAILED,
      expect.objectContaining({
        failureCode: FIREBASE_ACCOUNT_DELETE_FAILED,
        step: 'deleteUser',
        firebaseCode: 'auth/internal-error',
      }),
    );
    const payload = sdk.logEvent.mock.calls[0]?.[1] as { uidHash?: string };
    expect(payload.uidHash).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify(payload)).not.toContain('fb-fail');
  });

  it('does not call deleteUser when revokeRefreshTokens fails', async () => {
    const account = makeUser({
      id: 'usr_fb_revoke',
      email: 'fb.revoke@example.com',
      firebaseUid: 'fb-revoke',
    });
    getStore().upsert('users', account);
    rememberProfile(account.id);
    sdk.revokeRefreshTokens.mockRejectedValueOnce(firebaseErr('auth/insufficient-permission'));

    await expect(purgeUser(account.id)).rejects.toMatchObject({ code: 'INTERNAL' });

    expect(sdk.deleteUser).not.toHaveBeenCalled();
    expect(getStore().byId('users', account.id)).toBeDefined();
    expect(getStore().byId('profiles', `profile-${account.id}`)).toBeDefined();
    expect(sdk.logEvent).toHaveBeenCalledWith(
      FIREBASE_ACCOUNT_DELETE_FAILED,
      expect.objectContaining({
        failureCode: FIREBASE_ACCOUNT_DELETE_FAILED,
        step: 'revokeRefreshTokens',
        firebaseCode: 'auth/insufficient-permission',
      }),
    );
  });

  it('skips Firebase when the account has no firebaseUid', async () => {
    const account = makeUser({ id: 'usr_local_only', email: 'local.only@example.com' });
    getStore().upsert('users', account);

    await purgeUser(account.id);

    expect(sdk.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(sdk.deleteUser).not.toHaveBeenCalled();
    expect(getStore().byId('users', account.id)).toBeUndefined();
  });

  it('refuses the local purge when Admin auth cannot be constructed', async () => {
    const account = makeUser({
      id: 'usr_fb_noadmin',
      email: 'fb.noadmin@example.com',
      firebaseUid: 'fb-noadmin',
    });
    getStore().upsert('users', account);
    rememberProfile(account.id);
    sdk.getAuth.mockReturnValueOnce(null as never);

    await expect(purgeUser(account.id)).rejects.toMatchObject({
      code: 'INTERNAL',
      message: DELETE_MESSAGE,
    });
    expect(getStore().byId('users', account.id)).toBeDefined();
    expect(getStore().byId('profiles', `profile-${account.id}`)).toBeDefined();
    expect(sdk.logEvent).toHaveBeenCalledWith(
      FIREBASE_ACCOUNT_DELETE_FAILED,
      expect.objectContaining({
        failureCode: FIREBASE_ACCOUNT_DELETE_FAILED,
        step: 'admin_not_configured',
      }),
    );
  });

  it('refuses the local purge when Admin init throws', async () => {
    const account = makeUser({
      id: 'usr_fb_init',
      email: 'fb.init@example.com',
      firebaseUid: 'fb-init',
    });
    getStore().upsert('users', account);
    rememberProfile(account.id);
    sdk.initializeApp.mockImplementationOnce(() => {
      throw new Error('metadata unavailable');
    });

    await expect(purgeUser(account.id)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(sdk.deleteUser).not.toHaveBeenCalled();
    expect(getStore().byId('users', account.id)).toBeDefined();
    expect(getStore().byId('profiles', `profile-${account.id}`)).toBeDefined();
    expect(sdk.logEvent).toHaveBeenCalledWith(
      FIREBASE_ACCOUNT_DELETE_FAILED,
      expect.objectContaining({
        failureCode: FIREBASE_ACCOUNT_DELETE_FAILED,
        step: 'init',
        firebaseCode: 'unknown',
      }),
    );
  });

  it('does not purge on the second delete while Firebase is failing, then purges once it succeeds', async () => {
    const account = makeUser({
      id: 'usr_fb_retry',
      email: 'fb.retry@example.com',
      firebaseUid: 'fb-retry',
    });
    getStore().upsert('users', account);
    rememberProfile(account.id);

    const flagged = await requestDeletion(account.id);
    expect(flagged.purged).toBe(false);
    expect(sdk.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(getStore().byId<User>('users', account.id)?.deletionRequestedAt).toEqual(expect.any(String));

    sdk.deleteUser.mockRejectedValueOnce(firebaseErr('auth/network-request-failed'));
    await expect(requestDeletion(account.id)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(getStore().byId<User>('users', account.id)?.deletionRequestedAt).toBe(flagged.deletionRequestedAt);
    expect(getStore().byId('profiles', `profile-${account.id}`)).toBeDefined();

    sdk.deleteUser.mockResolvedValue(undefined);
    const done = await requestDeletion(account.id);
    expect(done.purged).toBe(true);
    expect(getStore().byId('users', account.id)).toBeUndefined();
    expect(getStore().byId('profiles', `profile-${account.id}`)).toBeUndefined();
  });

  it('continues the grace sweep when one Firebase delete fails', async () => {
    const past = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
    const blocked = makeUser({
      id: 'usr_sweep_blocked',
      email: 'sweep.blocked@example.com',
      firebaseUid: 'fb-sweep-blocked',
      deletionRequestedAt: past,
    });
    const ready = makeUser({
      id: 'usr_sweep_ready',
      email: 'sweep.ready@example.com',
      deletionRequestedAt: past,
    });
    getStore().upsert('users', blocked);
    getStore().upsert('users', ready);
    rememberProfile(blocked.id);
    sdk.deleteUser.mockRejectedValueOnce(firebaseErr('auth/internal-error'));

    await expect(sweepExpiredDeletions(new Date())).resolves.toBe(1);

    expect(getStore().byId('users', blocked.id)).toBeDefined();
    expect(getStore().byId('profiles', `profile-${blocked.id}`)).toBeDefined();
    expect(getStore().byId('users', ready.id)).toBeUndefined();
    expect(sdk.logEvent).toHaveBeenCalledWith(
      FIREBASE_ACCOUNT_DELETE_FAILED,
      expect.objectContaining({ failureCode: FIREBASE_ACCOUNT_DELETE_FAILED }),
    );
  });
});
