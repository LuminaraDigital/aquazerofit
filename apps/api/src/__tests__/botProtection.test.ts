/**
 * Cloudflare Turnstile enforcement on the two unauthenticated write surfaces.
 *
 * The verifier is reached over fetch, which is stubbed here: these tests are
 * about the decision this codebase makes from Cloudflare's answer, not about
 * Cloudflare. The behaviours that matter are that an unconfigured deployment
 * stays completely open (dev, tests, offline demo), that a HALF-configured one
 * also stays open rather than locking every real person out of registration,
 * and that a configured one fails closed when the verifier is unreachable.
 *
 * The wire contract asserted here mirrors the deployment at aquazerofit.com —
 * body-carried `captchaToken`, rejections as VALIDATION_FAILED with a
 * `fieldErrors.captchaToken` key. See platform/botProtection.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import {
  assertHuman,
  captchaConfig,
  captchaTokenOf,
  integrityTokenOf,
  isAndroidClient,
  verifyPlayIntegrity,
  verifyTurnstileToken,
} from '../platform/botProtection';
import { config } from '../platform/config';
import type { AppError } from '../platform/errors';

const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;
const ORIGINAL_SITE = process.env.TURNSTILE_SITE_KEY;
const MOBILE_KEYS = [
  'AUTH_ALLOW_CAPTCHALESS_MOBILE',
  'PLAY_INTEGRITY_ENABLED',
  'PLAY_INTEGRITY_PACKAGE_NAME',
] as const;
const ORIGINAL_MOBILE = Object.fromEntries(
  MOBILE_KEYS.map((k) => [k, process.env[k]]),
) as Record<(typeof MOBILE_KEYS)[number], string | undefined>;

/** Enforcement needs BOTH keys — see config.botProtectionEnabled. */
function configureTurnstile(): void {
  process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  process.env.TURNSTILE_SITE_KEY = '0xTESTSITEKEY';
}

/** Minimal Express-request stand-in carrying only what botProtection reads. */
function fakeRequest(opts: { headers?: Record<string, string>; body?: unknown; ip?: string } = {}) {
  const headers = opts.headers ?? {};
  return {
    ip: opts.ip ?? '203.0.113.7',
    body: opts.body,
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function stubVerify(payload: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 502,
    json: async () => payload,
  } as Response);
}

beforeEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
  for (const k of MOBILE_KEYS) delete process.env[k];
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET;
  if (ORIGINAL_SITE === undefined) delete process.env.TURNSTILE_SITE_KEY;
  else process.env.TURNSTILE_SITE_KEY = ORIGINAL_SITE;
  for (const k of MOBILE_KEYS) {
    if (ORIGINAL_MOBILE[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_MOBILE[k];
  }
  vi.restoreAllMocks();
});

describe('captchaConfig (GET /auth/captcha)', () => {
  it('reports disabled with no keys, so the client renders nothing', () => {
    expect(captchaConfig()).toEqual({ enabled: false });
  });

  it('publishes the site key once both keys are set', () => {
    configureTurnstile();
    expect(captchaConfig()).toEqual({ enabled: true, siteKey: '0xTESTSITEKEY' });
  });

  it('stays disabled with a secret but no site key, rather than locking the form', () => {
    // The worst possible configuration: the server would demand a token that
    // the client — told `enabled: false` — never renders a widget to produce,
    // so no real person could register while everything looked correct.
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    expect(captchaConfig()).toEqual({ enabled: false });
  });

  it('stays disabled with a site key but no secret, since nothing could verify', () => {
    process.env.TURNSTILE_SITE_KEY = '0xTESTSITEKEY';
    expect(captchaConfig()).toEqual({ enabled: false });
  });
});

describe('captchaTokenOf', () => {
  it('reads the body field, which is the wire contract', () => {
    expect(captchaTokenOf(fakeRequest({ body: { captchaToken: 'tok-1' } }))).toBe('tok-1');
  });

  it("falls back to Cloudflare's header name for non-browser callers", () => {
    expect(captchaTokenOf(fakeRequest({ headers: { 'cf-turnstile-response': 'tok-2' } }))).toBe(
      'tok-2',
    );
  });

  it('prefers the body over the header when both are present', () => {
    expect(
      captchaTokenOf(
        fakeRequest({
          body: { captchaToken: 'body-wins' },
          headers: { 'cf-turnstile-response': 'header-loses' },
        }),
      ),
    ).toBe('body-wins');
  });

  it('returns an empty string when the request carries no token at all', () => {
    expect(captchaTokenOf(fakeRequest({ body: {} }))).toBe('');
    expect(captchaTokenOf(fakeRequest())).toBe('');
  });
});

describe('assertHuman when unconfigured', () => {
  it('passes every request through and never calls the verifier', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(assertHuman(fakeRequest(), 'register')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('also passes through when only one key is set (half-finished setup)', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    await expect(assertHuman(fakeRequest({ body: {} }), 'register')).resolves.toBeUndefined();
  });
});

describe('assertHuman when configured', () => {
  beforeEach(configureTurnstile);

  it('allows a request whose token Cloudflare accepts', async () => {
    stubVerify({ success: true });
    await expect(
      assertHuman(fakeRequest({ body: { captchaToken: 'good' } }), 'register'),
    ).resolves.toBeUndefined();
  });

  it('rejects a missing token before making any network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(assertHuman(fakeRequest({ body: {} }), 'register')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fieldErrors: { captchaToken: 'Verification challenge is required.' } },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a rejection as a captchaToken field error, not a bare 400', async () => {
    // This key is the ONLY thing letting the client tell "solve the challenge
    // again" from "fix your email" — both arrive as VALIDATION_FAILED.
    stubVerify({ success: false, 'error-codes': ['invalid-input-response'] });
    await expect(
      assertHuman(fakeRequest({ body: { captchaToken: 'bad' } }), 'register'),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fieldErrors: { captchaToken: 'Verification failed.' } },
    });
  });

  it('refuses a token Cloudflare has already spent', async () => {
    stubVerify({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    await expect(
      assertHuman(fakeRequest({ body: { captchaToken: 'replayed' } }), 'register'),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('fails closed when the verifier is unreachable, with copy that blames nobody', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    const err = (await assertHuman(fakeRequest({ body: { captchaToken: 'good' } }), 'register').catch(
      (e: AppError) => e,
    )) as AppError;
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.message).toMatch(/try again in a moment/i);
  });

  it('fails closed on a non-2xx from siteverify', async () => {
    stubVerify({}, false);
    await expect(
      assertHuman(fakeRequest({ body: { captchaToken: 'good' } }), 'password-reset'),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('sends the secret and the client address to siteverify', async () => {
    const spy = stubVerify({ success: true });
    await assertHuman(fakeRequest({ body: { captchaToken: 'good' }, ip: '198.51.100.4' }), 'register');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain('secret=test-secret');
    expect(body).toContain('response=good');
    expect(body).toContain('remoteip=198.51.100.4');
  });
});

// ---------------------------------------------------------------------------
// Native Android registration path
// ---------------------------------------------------------------------------
//
// The Android app cannot render a Turnstile widget. The escape hatch below is
// a GLOBAL bypass — `X-Client` is a header anybody can type — so the tests
// that matter are the negative ones: it is off unless explicitly switched on,
// it does not extend to a caller that did not claim to be Android, and the
// Play Integrity seam cannot make the gate weaker than it already is.

describe('isAndroidClient / integrityTokenOf', () => {
  it('recognises the client header case-insensitively', () => {
    expect(isAndroidClient(fakeRequest({ headers: { 'x-client': 'android' } }))).toBe(true);
    expect(isAndroidClient(fakeRequest({ headers: { 'x-client': ' Android ' } }))).toBe(true);
  });

  it('is false for every other caller, including one that sent nothing', () => {
    expect(isAndroidClient(fakeRequest())).toBe(false);
    expect(isAndroidClient(fakeRequest({ headers: { 'x-client': 'web' } }))).toBe(false);
    expect(isAndroidClient(fakeRequest({ headers: { 'x-client': 'android-ish' } }))).toBe(false);
  });

  it('reads the integrity token from the body, beside captchaToken', () => {
    expect(integrityTokenOf(fakeRequest({ body: { integrityToken: ' tok ' } }))).toBe('tok');
    expect(integrityTokenOf(fakeRequest({ body: { captchaToken: 'c' } }))).toBe('');
    expect(integrityTokenOf(fakeRequest())).toBe('');
  });
});

describe('verifyPlayIntegrity (seam, config-gated off)', () => {
  it('reports not-configured when the feature is off', async () => {
    await expect(verifyPlayIntegrity('any-token')).resolves.toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });

  it('stays off when the flag is set but the package name is not', () => {
    // A verdict validated against the wrong package is not a check, so both
    // halves are required before anything runs.
    process.env.PLAY_INTEGRITY_ENABLED = 'true';
    expect(config.playIntegrityEnabled).toBe(false);
  });

  it('reports missing-token once configured but handed nothing', async () => {
    process.env.PLAY_INTEGRITY_ENABLED = 'true';
    process.env.PLAY_INTEGRITY_PACKAGE_NAME = 'fit.aquazero.app';
    expect(config.playIntegrityEnabled).toBe(true);
    await expect(verifyPlayIntegrity('')).resolves.toEqual({ ok: false, reason: 'missing-token' });
  });

  it('never passes a caller on its own while the decoder is unwired', async () => {
    process.env.PLAY_INTEGRITY_ENABLED = 'true';
    process.env.PLAY_INTEGRITY_PACKAGE_NAME = 'fit.aquazero.app';
    const result = await verifyPlayIntegrity('a-token-nothing-has-checked');
    expect(result.ok).toBe(false);
  });
});

describe('assertHuman on the mobile path', () => {
  beforeEach(configureTurnstile);

  it('lets an Android client through with no captcha when the flag is set', async () => {
    process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE = 'true';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(
      assertHuman(fakeRequest({ headers: { 'x-client': 'android' }, body: {} }), 'register'),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still demands a captcha from an Android client when the flag is unset', async () => {
    // The default. Turnstile keys configured and no flag means the gate holds,
    // whatever header the caller typed.
    await expect(
      assertHuman(fakeRequest({ headers: { 'x-client': 'android' }, body: {} }), 'register'),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fieldErrors: { captchaToken: 'Verification challenge is required.' } },
    });
  });

  it('never exempts a non-android client, even with the flag set', async () => {
    process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE = 'true';
    const callers: Record<string, string>[] = [{}, { 'x-client': 'web' }, { 'x-client': 'ios' }];
    for (const headers of callers) {
      await expect(assertHuman(fakeRequest({ headers, body: {} }), 'register')).rejects.toMatchObject(
        { code: 'VALIDATION_FAILED' },
      );
    }
  });

  it('applies to password reset as well as register', async () => {
    process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE = 'true';
    await expect(
      assertHuman(fakeRequest({ headers: { 'x-client': 'android' }, body: {} }), 'password-reset'),
    ).resolves.toBeUndefined();
  });

  it('still verifies a captcha token an Android client did supply', async () => {
    // The flag waives a challenge that cannot be solved; it does not waive one
    // that was attempted and failed.
    process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE = 'true';
    stubVerify({ success: false, 'error-codes': ['invalid-input-response'] });
    await expect(
      assertHuman(
        fakeRequest({ headers: { 'x-client': 'android' }, body: { captchaToken: 'bad' } }),
        'register',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('falls through to Turnstile when an integrity token cannot be verified', async () => {
    // The seam must never be a way in. An unconfigured or failing verdict
    // leaves the caller facing exactly the gate they would have faced anyway.
    process.env.PLAY_INTEGRITY_ENABLED = 'true';
    process.env.PLAY_INTEGRITY_PACKAGE_NAME = 'fit.aquazero.app';
    await expect(
      assertHuman(
        fakeRequest({ headers: { 'x-client': 'android' }, body: { integrityToken: 'tok' } }),
        'register',
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fieldErrors: { captchaToken: 'Verification challenge is required.' } },
    });
  });

  it('accepts an integrity-token request that also solves the captcha', async () => {
    process.env.PLAY_INTEGRITY_ENABLED = 'true';
    process.env.PLAY_INTEGRITY_PACKAGE_NAME = 'fit.aquazero.app';
    stubVerify({ success: true });
    await expect(
      assertHuman(
        fakeRequest({
          headers: { 'x-client': 'android' },
          body: { integrityToken: 'tok', captchaToken: 'good' },
        }),
        'register',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('config.authAllowCaptchalessMobile', () => {
  it('is off unless explicitly enabled', () => {
    expect(config.authAllowCaptchalessMobile).toBe(false);
    process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE = 'false';
    expect(config.authAllowCaptchalessMobile).toBe(false);
    process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE = 'yes';
    expect(config.authAllowCaptchalessMobile).toBe(false);
  });

  it('accepts the two spellings an operator would reach for', () => {
    process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE = 'true';
    expect(config.authAllowCaptchalessMobile).toBe(true);
    process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE = '1';
    expect(config.authAllowCaptchalessMobile).toBe(true);
  });
});

describe('verifyTurnstileToken', () => {
  it('is a no-op success when no secret is configured', async () => {
    await expect(verifyTurnstileToken('anything')).resolves.toEqual({ ok: true });
  });

  it('reports the reason Cloudflare gave so the rejection is diagnosable', async () => {
    configureTurnstile();
    stubVerify({ success: false, 'error-codes': ['invalid-input-secret'] });
    await expect(verifyTurnstileToken('tok')).resolves.toEqual({
      ok: false,
      reason: 'invalid-input-secret',
    });
  });
});
