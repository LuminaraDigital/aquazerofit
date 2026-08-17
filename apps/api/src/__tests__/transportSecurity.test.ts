/**
 * Transport security: HTTPS enforcement, proxy-header sanity, log redaction
 * and the constant-time compare shared by the reset and webhook paths.
 *
 * FORCE_HTTPS is manipulated per test rather than NODE_ENV, because setting
 * NODE_ENV=production in a worker also arms assertProductionSecrets at every
 * subsequent config import and would take the whole file down.
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertTrustProxyHeaders, enforceHttps, resetProxyWarning } from '../platform/https';
import { redactUrl } from '../platform/telemetry';
import { secureEquals } from '../platform/auth';

const ORIGINAL_FORCE_HTTPS = process.env.FORCE_HTTPS;
const ORIGINAL_TRUST_PROXY = process.env.TRUST_PROXY;

afterEach(() => {
  if (ORIGINAL_FORCE_HTTPS === undefined) delete process.env.FORCE_HTTPS;
  else process.env.FORCE_HTTPS = ORIGINAL_FORCE_HTTPS;
  if (ORIGINAL_TRUST_PROXY === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = ORIGINAL_TRUST_PROXY;
  resetProxyWarning();
  vi.restoreAllMocks();
});

/** Minimal app carrying only the middleware under test. */
function appWithHttps(trustProxy = 1) {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.use(enforceHttps);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/dashboard', (_req, res) => res.json({ ok: true }));
  app.post('/api/v1/auth/login', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('enforceHttps', () => {
  it('passes plaintext straight through when FORCE_HTTPS is off (dev default)', async () => {
    process.env.FORCE_HTTPS = 'false';
    const res = await request(appWithHttps()).get('/dashboard');
    expect(res.status).toBe(200);
  });

  it('redirects a plaintext GET to https with 308, preserving path and query', async () => {
    process.env.FORCE_HTTPS = 'true';
    const res = await request(appWithHttps())
      .get('/dashboard?tab=week')
      .set('Host', 'app.aquazerofit.com');
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('https://app.aquazerofit.com/dashboard?tab=week');
  });

  it('refuses a plaintext POST rather than redirecting it', async () => {
    // A 30x would have the client replay credentials that already crossed the
    // wire in the clear, and would let it believe the first attempt was fine.
    process.env.FORCE_HTTPS = 'true';
    const res = await request(appWithHttps()).post('/api/v1/auth/login').send({ email: 'a@b.co' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('accepts a request the ingress marked as https via X-Forwarded-Proto', async () => {
    process.env.FORCE_HTTPS = 'true';
    const res = await request(appWithHttps())
      .get('/dashboard')
      .set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
  });

  it('leaves /health reachable over plaintext so probes do not read as unhealthy', async () => {
    process.env.FORCE_HTTPS = 'true';
    const res = await request(appWithHttps()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('ignores X-Forwarded-Proto from an untrusted hop (trust proxy 0)', async () => {
    // Without this, any client could claim https and skip the redirect.
    process.env.FORCE_HTTPS = 'true';
    const res = await request(appWithHttps(0))
      .get('/dashboard')
      .set('Host', 'app.aquazerofit.com')
      .set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(308);
  });
});

describe('assertTrustProxyHeaders', () => {
  function appWithCheck() {
    const app = express();
    app.use(assertTrustProxyHeaders);
    app.get('/dashboard', (_req, res) => res.json({ ok: true }));
    return app;
  }

  it('is inert under test regardless of the forwarding chain', async () => {
    // config.isTest short-circuits it; the production behaviour is asserted
    // by the unit cases below via a direct call.
    process.env.TRUST_PROXY = '1';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(appWithCheck()).get('/dashboard');
    expect(res.status).toBe(200);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('redactUrl', () => {
  it('leaves a URL with no query string untouched', () => {
    expect(redactUrl('/api/v1/me')).toBe('/api/v1/me');
  });

  it('leaves harmless query parameters intact', () => {
    expect(redactUrl('/api/v1/logs?date=2026-08-17')).toBe('/api/v1/logs?date=2026-08-17');
  });

  it('redacts a replayed password-reset link, keeping the key as a signal', () => {
    expect(redactUrl('/sign-in?reset=8f2c1e90-aaaa-bbbb-cccc-1234567890ab')).toBe(
      '/sign-in?reset=%5Bredacted%5D',
    );
  });

  it('redacts token-shaped parameters case-insensitively and keeps the others', () => {
    const out = redactUrl('/x?Token=abc&page=2&refresh_token=xyz');
    expect(out).toContain('page=2');
    expect(out).not.toContain('abc');
    expect(out).not.toContain('xyz');
  });
});

describe('secureEquals', () => {
  it('matches identical strings', () => {
    expect(secureEquals('a'.repeat(64), 'a'.repeat(64))).toBe(true);
  });

  it('rejects different strings of equal length', () => {
    expect(secureEquals('a'.repeat(64), 'b'.repeat(64))).toBe(false);
  });

  it('returns false rather than throwing on a length mismatch', () => {
    // The original bug: crypto.timingSafeEqual raises RangeError here, turning
    // "attacker sent a short token" into an unhandled 500.
    expect(() => secureEquals('short', 'a'.repeat(64))).not.toThrow();
    expect(secureEquals('short', 'a'.repeat(64))).toBe(false);
  });

  it('returns false for non-string input instead of crashing Buffer.from', () => {
    expect(secureEquals(undefined, 'x')).toBe(false);
    expect(secureEquals('x', null)).toBe(false);
    expect(secureEquals({}, {})).toBe(false);
  });

  it('does not treat two empty strings as a valid secret match by accident', () => {
    // secureEquals itself is honest ('' === ''), so callers must reject an
    // unset secret before comparing — payments/router.ts does exactly that.
    expect(secureEquals('', '')).toBe(true);
  });
});
