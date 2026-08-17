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
  verifyTurnstileToken,
} from '../platform/botProtection';
import type { AppError } from '../platform/errors';

const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;
const ORIGINAL_SITE = process.env.TURNSTILE_SITE_KEY;

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
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET;
  if (ORIGINAL_SITE === undefined) delete process.env.TURNSTILE_SITE_KEY;
  else process.env.TURNSTILE_SITE_KEY = ORIGINAL_SITE;
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
