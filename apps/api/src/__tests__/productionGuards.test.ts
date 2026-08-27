/**
 * REGRESSION GUARD — production boot guards and proxy trust.
 *
 * These cover defects found in the pre-Azure readiness review:
 *
 *  1. `assertProductionSecrets` did not require CORS_ORIGINS, so a production
 *     boot silently fell back to the localhost dev origins — and nothing
 *     rejected an operator setting `*` or a plaintext http origin on an API
 *     that serves health data.
 *
 *  2. `config.trustProxy` did not exist. Behind an Azure ingress every request
 *     carries the proxy's socket address, so `req.ip` was identical for all
 *     callers and the per-IP rate-limit lanes became global: ten failed logins
 *     from anyone locked out the entire platform.
 *
 * config.* are getters, so each access re-reads process.env — no module cache
 * to defeat. Every test restores the original environment.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { config, assertProductionSecrets } from '../platform/config';

const KEYS = [
  'NODE_ENV',
  'CORS_ORIGINS',
  'JWT_ACCESS_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TRUST_PROXY',
  'MAIL_PROVIDER',
  'RESEND_API_KEY',
  'MAIL_FROM',
  'APP_PUBLIC_URL',
  'DATABASE_URL',
  'AUTH_ALLOW_CAPTCHALESS_MOBILE',
] as const;

const ORIGINAL = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])) as Record<
  (typeof KEYS)[number],
  string | undefined
>;

/** Minimum viable production environment; individual tests break one field. */
function setProductionEnv(overrides: Partial<Record<(typeof KEYS)[number], string>> = {}): void {
  process.env.NODE_ENV = 'production';
  process.env.JWT_ACCESS_SECRET = 'x'.repeat(64);
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  process.env.CORS_ORIGINS = 'https://app.aquazero.fit';
  // Account recovery has to be deliverable; see the mail guard below.
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.MAIL_FROM = 'AquaZeroFit <no-reply@aquazero.fit>';
  process.env.APP_PUBLIC_URL = 'https://app.aquazero.fit';
  // Durable persistence: the JSON file store is dev-only, see config.ts.
  process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/azf';
  delete process.env.MAIL_PROVIDER;
  // The captcha-less mobile bypass is closed-testing only and boot-fatal here.
  delete process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE;
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
}

afterEach(() => {
  for (const k of KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  }
});

describe('assertProductionSecrets', () => {
  it('is a no-op outside production even with nothing configured', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.CORS_ORIGINS;
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it('accepts a fully configured production environment', () => {
    setProductionEnv();
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it('refuses to boot in production without CORS_ORIGINS', () => {
    setProductionEnv();
    delete process.env.CORS_ORIGINS;
    expect(() => assertProductionSecrets()).toThrow(/CORS_ORIGINS/);
  });

  it('refuses to boot in production without JWT_ACCESS_SECRET', () => {
    setProductionEnv();
    delete process.env.JWT_ACCESS_SECRET;
    expect(() => assertProductionSecrets()).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuses to boot in production without DATABASE_URL (JSON store is dev-only)', () => {
    setProductionEnv();
    delete process.env.DATABASE_URL;
    expect(() => assertProductionSecrets()).toThrow(/DATABASE_URL/);
  });

  /**
   * The Android client cannot render a Turnstile widget, so closed testing may
   * waive the challenge for a caller sending `X-Client: android`. That header
   * is typed, not proven, which makes the waiver a global bypass of the signup
   * challenge — acceptable for a known set of testers, never for production.
   * An operator convention would not survive being forgotten; a boot failure
   * does.
   */
  it('refuses to boot in production with the captcha-less mobile bypass set', () => {
    setProductionEnv({ AUTH_ALLOW_CAPTCHALESS_MOBILE: 'true' });
    expect(() => assertProductionSecrets()).toThrow(/AUTH_ALLOW_CAPTCHALESS_MOBILE/);

    process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE = '1';
    expect(() => assertProductionSecrets()).toThrow(/AUTH_ALLOW_CAPTCHALESS_MOBILE/);
  });

  it('boots in production when the bypass is explicitly off or absent', () => {
    setProductionEnv({ AUTH_ALLOW_CAPTCHALESS_MOBILE: 'false' });
    expect(() => assertProductionSecrets()).not.toThrow();

    delete process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE;
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it('leaves the bypass usable outside production', () => {
    // It exists to make closed testing possible; the guard is about where.
    process.env.NODE_ENV = 'development';
    process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE = 'true';
    expect(() => assertProductionSecrets()).not.toThrow();
    expect(config.authAllowCaptchalessMobile).toBe(true);
  });

  it('rejects a wildcard CORS origin in production', () => {
    setProductionEnv({ CORS_ORIGINS: 'https://app.aquazero.fit,*' });
    expect(() => assertProductionSecrets()).toThrow(/must not include "\*"/);
  });

  it('rejects a plaintext http CORS origin in production', () => {
    setProductionEnv({ CORS_ORIGINS: 'http://app.aquazero.fit' });
    expect(() => assertProductionSecrets()).toThrow(/https/);
  });

  /**
   * Password reset issued a token whose only delivery path was a console line
   * gated off in production, so a locked-out user had no route back in and the
   * endpoint still answered 202. Boot now fails instead of pretending.
   */
  it('refuses to boot in production with no mail transport configured', () => {
    setProductionEnv();
    delete process.env.RESEND_API_KEY;
    expect(() => assertProductionSecrets()).toThrow(/mail transport/);
  });

  it('refuses to boot in production on the console transport', () => {
    setProductionEnv({ MAIL_PROVIDER: 'console' });
    expect(() => assertProductionSecrets()).toThrow(/mail transport/);
  });

  it('refuses to boot when the chosen provider has no API key', () => {
    setProductionEnv({ MAIL_PROVIDER: 'resend' });
    delete process.env.RESEND_API_KEY;
    expect(() => assertProductionSecrets()).toThrow(/RESEND_API_KEY/);
  });

  it('refuses to boot without a verified sender address', () => {
    setProductionEnv();
    delete process.env.MAIL_FROM;
    expect(() => assertProductionSecrets()).toThrow(/MAIL_FROM/);
  });

  it('refuses to boot without a public URL to build reset links from', () => {
    setProductionEnv();
    delete process.env.APP_PUBLIC_URL;
    expect(() => assertProductionSecrets()).toThrow(/APP_PUBLIC_URL/);
  });
});

describe('config.trustProxy', () => {
  it('trusts nothing by default outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.TRUST_PROXY;
    expect(config.trustProxy).toBe(0);
  });

  it('trusts exactly one hop by default in production (the platform ingress)', () => {
    setProductionEnv();
    delete process.env.TRUST_PROXY;
    expect(config.trustProxy).toBe(1);
  });

  it('honours an explicit override, e.g. 2 for Front Door in front of ingress', () => {
    setProductionEnv({ TRUST_PROXY: '2' });
    expect(config.trustProxy).toBe(2);
  });

  it('allows an explicit 0 to opt out', () => {
    setProductionEnv({ TRUST_PROXY: '0' });
    expect(config.trustProxy).toBe(0);
  });

  it('falls back to the default when the override is not a valid hop count', () => {
    setProductionEnv({ TRUST_PROXY: 'true' });
    expect(config.trustProxy).toBe(1);
    process.env.TRUST_PROXY = '-1';
    expect(config.trustProxy).toBe(1);
  });
});
