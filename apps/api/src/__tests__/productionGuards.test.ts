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

  it('rejects a wildcard CORS origin in production', () => {
    setProductionEnv({ CORS_ORIGINS: 'https://app.aquazero.fit,*' });
    expect(() => assertProductionSecrets()).toThrow(/must not include "\*"/);
  });

  it('rejects a plaintext http CORS origin in production', () => {
    setProductionEnv({ CORS_ORIGINS: 'http://app.aquazero.fit' });
    expect(() => assertProductionSecrets()).toThrow(/https/);
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
