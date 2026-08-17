/**
 * The bot-protection WIRE CONTRACT, asserted end to end through the router.
 *
 * This file exists because the client and the server here ship separately —
 * a browser bundle cached on someone's phone talks to whatever the API is
 * today — so a mismatch does not fail loudly at build time. It fails either
 * silently (an unchallenged registration form) or brutally (a form nobody can
 * submit). These assertions are copied from the responses the live deployment
 * at aquazerofit.com actually returns; if you change a message or a field name
 * here, change the web client in the same commit.
 *
 * Both keys are set/unset per test rather than at module load: config reads the
 * environment through getters, so each case gets the deployment shape it wants
 * without a separate worker.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-captcha-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;
const ORIGINAL_SITE = process.env.TURNSTILE_SITE_KEY;

function challenged(): void {
  process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  process.env.TURNSTILE_SITE_KEY = '0xTESTSITEKEY';
}

/** Stand in for Cloudflare's siteverify so no test touches the network. */
function stubSiteVerify(success: boolean) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success, 'error-codes': success ? [] : ['invalid-input-response'] }),
  } as Response);
}

beforeEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET;
  if (ORIGINAL_SITE === undefined) delete process.env.TURNSTILE_SITE_KEY;
  else process.env.TURNSTILE_SITE_KEY = ORIGINAL_SITE;
  vi.restoreAllMocks();
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('GET /auth/captcha', () => {
  it('is public — the browser reads it before anyone has an account', async () => {
    const res = await request(app).get(`${base}/auth/captcha`);
    expect(res.status).toBe(200);
  });

  it('reports disabled on a deployment with no keys', async () => {
    const res = await request(app).get(`${base}/auth/captcha`);
    expect(res.body).toEqual({ enabled: false });
  });

  it('publishes the site key on a challenged deployment', async () => {
    challenged();
    const res = await request(app).get(`${base}/auth/captcha`);
    expect(res.body).toEqual({ enabled: true, siteKey: '0xTESTSITEKEY' });
  });

  it('never leaks the secret', async () => {
    challenged();
    const res = await request(app).get(`${base}/auth/captcha`);
    expect(JSON.stringify(res.body)).not.toContain('test-secret');
  });
});

describe('unchallenged deployment', () => {
  it('registers without a captchaToken, exactly as before bot protection existed', async () => {
    const res = await request(app).post(`${base}/auth/register`).send({
      email: 'no-captcha@example.com',
      password: 'CorrectHorse9Battery',
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
  });
});

describe('challenged deployment', () => {
  it('refuses registration with no token, naming captchaToken as the field', async () => {
    challenged();
    const res = await request(app).post(`${base}/auth/register`).send({
      email: 'needs-captcha@example.com',
      password: 'CorrectHorse9Battery',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.fieldErrors.captchaToken).toBe('Verification challenge is required.');
  });

  it('refuses registration when Cloudflare rejects the token', async () => {
    challenged();
    stubSiteVerify(false);
    const res = await request(app).post(`${base}/auth/register`).send({
      email: 'bad-captcha@example.com',
      password: 'CorrectHorse9Battery',
      captchaToken: 'a-token-cloudflare-dislikes',
    });
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.captchaToken).toBe('Verification failed.');
  });

  it('registers once Cloudflare accepts the token', async () => {
    challenged();
    stubSiteVerify(true);
    const res = await request(app).post(`${base}/auth/register`).send({
      email: 'good-captcha@example.com',
      password: 'CorrectHorse9Battery',
      captchaToken: 'a-token-cloudflare-likes',
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('guards password-reset request too — it mails an address the caller chose', async () => {
    challenged();
    const res = await request(app)
      .post(`${base}/auth/password-reset/request`)
      .send({ email: 'someone@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.captchaToken).toBeTruthy();
  });

  it('leaves sign-in unchallenged — the lockout and IP lane already cover it', async () => {
    challenged();
    stubSiteVerify(true);
    await request(app).post(`${base}/auth/register`).send({
      email: 'signin-unchallenged@example.com',
      password: 'CorrectHorse9Battery',
      captchaToken: 'ok',
    });
    vi.restoreAllMocks();

    // No captchaToken, and no siteverify stub: a challenged login would fail
    // closed here. It must succeed.
    const res = await request(app).post(`${base}/auth/login`).send({
      email: 'signin-unchallenged@example.com',
      password: 'CorrectHorse9Battery',
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('stays OFF when only the secret is set, rather than locking registration', async () => {
    // Half-configured is the failure that looks deliberate. Registration must
    // still work; the boot warning is what tells the operator to finish.
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    const res = await request(app).post(`${base}/auth/register`).send({
      email: 'half-configured@example.com',
      password: 'CorrectHorse9Battery',
    });
    expect(res.status).toBe(201);
  });
});
