/**
 * Password reset flow integration (supertest against createApp(), isolated
 * data dir via AZF_DATA_DIR): enumeration-safe request, happy-path confirm
 * (rehash + full session revocation), expired/invalid/weak-password rejects.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-pwreset-'));
process.env.AZF_DATA_DIR = dataDir;
process.env.EXPOSE_DEV_TOKENS = 'true';

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

const EMAIL = 'reset-me@example.com';
const PASSWORD = 'OriginalPass9word';
const NEW_PASSWORD = 'BrandNewPass7word';

const NEUTRAL_MESSAGE = 'If that account exists, reset instructions have been issued.';

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('password reset', () => {
  it('request + confirm happy path: rehashes and revokes all sessions', async () => {
    await request(app)
      .post(`${base}/auth/register`)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(201);
    const login = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const oldRefresh = login.body.refreshToken as string;

    const req1 = await request(app)
      .post(`${base}/auth/password-reset/request`)
      .send({ email: EMAIL });
    expect(req1.status).toBe(202);
    expect(req1.body.message).toBe(NEUTRAL_MESSAGE);
    // Dev transport: token echoed in the body (config.isDev) for testability.
    expect(req1.body.devToken).toBeTypeOf('string');

    const confirm = await request(app)
      .post(`${base}/auth/password-reset/confirm`)
      .send({ token: req1.body.devToken, newPassword: NEW_PASSWORD });
    expect(confirm.status).toBe(200);
    expect(confirm.body.message).toBeTypeOf('string');

    // Old password no longer works; new one does.
    await request(app)
      .post(`${base}/auth/login`)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(401);
    await request(app)
      .post(`${base}/auth/login`)
      .send({ email: EMAIL, password: NEW_PASSWORD })
      .expect(200);

    // Every pre-reset refresh token family is revoked.
    const refresh = await request(app)
      .post(`${base}/auth/refresh`)
      .send({ refreshToken: oldRefresh });
    expect(refresh.status).toBe(401);

    // Single use: the consumed token cannot be replayed.
    const replay = await request(app)
      .post(`${base}/auth/password-reset/confirm`)
      .send({ token: req1.body.devToken, newPassword: 'AnotherPass5word' });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an expired token with VALIDATION_FAILED', async () => {
    const req1 = await request(app)
      .post(`${base}/auth/password-reset/request`)
      .send({ email: EMAIL })
      .expect(202);
    const token = req1.body.devToken as string;

    // Force expiry on the freshly minted (unused) token doc.
    const store = getStore();
    const doc = store.findOne<{ id: string; type: string; usedAt: string | null }>(
      'users',
      (d) => (d as { type?: string }).type === 'passwordResetToken' && (d as { usedAt?: string | null }).usedAt === null,
    );
    expect(doc).toBeDefined();
    store.upsert('users', { ...doc!, expiresAt: new Date(Date.now() - 60_000).toISOString() });

    const confirm = await request(app)
      .post(`${base}/auth/password-reset/confirm`)
      .send({ token, newPassword: 'YetAnotherPass3x' });
    expect(confirm.status).toBe(400);
    expect(confirm.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a weak new password via the shared passwordSchema', async () => {
    const res = await request(app)
      .post(`${base}/auth/password-reset/confirm`)
      .send({ token: 'whatever-token-value', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('is enumeration-safe: unknown email gets the identical 202 message', async () => {
    const res = await request(app)
      .post(`${base}/auth/password-reset/request`)
      .send({ email: 'nobody-here@example.com' });
    expect(res.status).toBe(202);
    expect(res.body.message).toBe(NEUTRAL_MESSAGE);
  });
});
