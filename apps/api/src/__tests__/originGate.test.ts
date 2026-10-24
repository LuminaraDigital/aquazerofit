/**
 * Origin gate (REQUIRE_ORIGIN_SECRET, requireWorkerOrigin in platform/clientIp).
 *
 * Cloud Run ingress cannot be limited to the Cloudflare Worker, so the
 * *.run.app URL is public and a caller there skips the edge entirely. With the
 * switch on, the API itself refuses anything without the Worker's
 * X-Origin-Shared-Secret. These run against createApp() rather than a bare
 * router, because the properties that matter are about the real middleware
 * order: the gate must sit in front of every route, and the probes must still
 * be reachable around it.
 *
 * The switch defaults off so a deploy cannot refuse production traffic before
 * the operator has set the secret on both sides; the first case pins that.
 */
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { ORIGIN_SHARED_SECRET_HEADER, resetOriginRefusalLog } from '../platform/clientIp';
import { assertOriginSecretConfigured } from '../platform/config';
import { bindIsolatedDataDir, createIsolatedDataDir } from './helpers/integrationIsolation';

const KEYS = ['REQUIRE_ORIGIN_SECRET', 'ORIGIN_SHARED_SECRET'] as const;
const ORIGINAL = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])) as Record<
  string,
  string | undefined
>;
// Shaped like the documented recipe (`openssl rand -hex 32`): the boot guard
// refuses anything shorter than 32 characters.
const SECRET = 'a'.repeat(64);

// /ready reads the store, so it needs a data directory of its own.
const dataDir = createIsolatedDataDir('azf-origin-gate-');
beforeAll(() => bindIsolatedDataDir(dataDir));

afterEach(() => {
  for (const k of KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  }
  resetOriginRefusalLog();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function enforce(): void {
  process.env.REQUIRE_ORIGIN_SECRET = 'true';
  process.env.ORIGIN_SHARED_SECRET = SECRET;
}

describe('requireWorkerOrigin', () => {
  it('passes everything through while REQUIRE_ORIGIN_SECRET is off (the default)', async () => {
    delete process.env.REQUIRE_ORIGIN_SECRET;
    process.env.ORIGIN_SHARED_SECRET = SECRET;
    const res = await request(createApp()).get('/metrics');
    expect(res.status).toBe(200);
  });

  it('refuses a missing or wrong secret with the FORBIDDEN envelope', async () => {
    enforce();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const app = createApp();

    const missing = await request(app).get('/metrics');
    expect(missing.status).toBe(403);
    expect(missing.body.code).toBe('FORBIDDEN');
    expect(typeof missing.body.message).toBe('string');

    const wrong = await request(app).get('/metrics').set(ORIGIN_SHARED_SECRET_HEADER, 'guessed');
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe('FORBIDDEN');
  });

  it('refuses a provider webhook that reaches the origin directly', async () => {
    // Telegram, Stripe and Pub/Sub cannot add our header, so a webhook still
    // registered on run.app fails here rather than in the payment handler.
    enforce();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(createApp()).post('/api/v1/telegram/webhook').send({});
    expect(res.status).toBe(403);
  });

  it('lets a request carrying the Worker secret through', async () => {
    enforce();
    const res = await request(createApp()).get('/metrics').set(ORIGIN_SHARED_SECRET_HEADER, SECRET);
    expect(res.status).toBe(200);
  });

  it('leaves /health and /ready open so Cloud Run probes never see a 403', async () => {
    enforce();
    const app = createApp();
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
  });

  it('logs at most one security line a minute, carrying the suppressed count', async () => {
    enforce();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const app = createApp();
    const refusals = () =>
      warn.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.includes('origin_secret_rejected'))
        .map((line) => JSON.parse(line) as Record<string, unknown>);

    await request(app).get('/metrics');
    await request(app).get('/metrics');
    await request(app).get('/metrics').set(ORIGIN_SHARED_SECRET_HEADER, 'guessed');
    expect(refusals()).toHaveLength(1);
    expect(refusals()[0]).toMatchObject({
      kind: 'security',
      reason: 'secret_missing',
      path: '/metrics',
      refusedSinceLastLog: 1,
    });

    vi.setSystemTime(new Date('2026-10-25T00:01:00Z'));
    await request(app).get('/metrics').set(ORIGIN_SHARED_SECRET_HEADER, 'guessed');
    expect(refusals()).toHaveLength(2);
    expect(refusals()[1]).toMatchObject({ reason: 'secret_mismatch', refusedSinceLastLog: 3 });
  });
});

describe('assertOriginSecretConfigured', () => {
  it('refuses to boot with the gate on and no secret to compare against', () => {
    process.env.REQUIRE_ORIGIN_SECRET = 'true';
    delete process.env.ORIGIN_SHARED_SECRET;
    expect(() => assertOriginSecretConfigured()).toThrow(/Refusing to start.*ORIGIN_SHARED_SECRET/);
    process.env.ORIGIN_SHARED_SECRET = '   ';
    expect(() => assertOriginSecretConfigured()).toThrow(/ORIGIN_SHARED_SECRET is empty/);
  });

  it('refuses the public placeholder and anything shorter than 32 characters', () => {
    // .env.production.example is in a public repository, so its placeholder
    // admits anyone who has read it.
    process.env.REQUIRE_ORIGIN_SECRET = 'true';
    const weak = [
      'replace-with-production-only-origin-secret',
      `Replace-With-${'x'.repeat(40)}`,
      'x'.repeat(31),
    ];
    for (const value of weak) {
      process.env.ORIGIN_SHARED_SECRET = value;
      expect(() => assertOriginSecretConfigured()).toThrow(/Refusing to start: ORIGIN_SHARED_SECRET/);
    }
    // The message names the problem without echoing the value it refused.
    process.env.ORIGIN_SHARED_SECRET = 'x'.repeat(31);
    let message = '';
    try {
      assertOriginSecretConfigured();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('31 characters');
    expect(message).not.toContain('x'.repeat(31));
    process.env.ORIGIN_SHARED_SECRET = 'x'.repeat(32);
    expect(() => assertOriginSecretConfigured()).not.toThrow();
  });

  it('does not judge the secret while the gate is off', () => {
    // Off, the secret only steers rate-limit buckets; a deploy must not fail
    // over it before the operator has chosen to turn the gate on.
    delete process.env.REQUIRE_ORIGIN_SECRET;
    process.env.ORIGIN_SHARED_SECRET = 'replace-with-production-only-origin-secret';
    expect(() => assertOriginSecretConfigured()).not.toThrow();
  });

  it('boots with the gate on and a secret set, or with the gate off', () => {
    enforce();
    expect(() => assertOriginSecretConfigured()).not.toThrow();
    delete process.env.REQUIRE_ORIGIN_SECRET;
    delete process.env.ORIGIN_SHARED_SECRET;
    expect(() => assertOriginSecretConfigured()).not.toThrow();
  });
});
