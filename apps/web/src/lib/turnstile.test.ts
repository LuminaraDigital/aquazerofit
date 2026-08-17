// @vitest-environment jsdom
/**
 * A deployment that answers `{ enabled: false }` — every local dev run, the
 * offline demo and the whole web suite — must behave exactly as it did before
 * bot protection existed: no script injected, no widget, no submit gate.
 *
 * The config lookup is also the piece that must never take a form down. If
 * /auth/captcha is unreachable the API is already broken and the submit will
 * fail on its own terms; blocking the form behind a challenge that can never
 * load would replace a legible error with a dead page. The server enforces
 * independently, so a client that wrongly believes it is unprotected just gets
 * its submit refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCaptchaConfig, loadTurnstile, resetTurnstileForTests } from './turnstile';

beforeEach(() => {
  resetTurnstileForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.querySelectorAll('script[src*="cloudflare"]').forEach((s) => s.remove());
});

/** Stub the one fetch that api() makes for GET /auth/captcha. */
function stubCaptcha(body: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('fetchCaptchaConfig', () => {
  it('reports disabled when the deployment has no Turnstile keys', async () => {
    stubCaptcha({ enabled: false });
    await expect(fetchCaptchaConfig()).resolves.toEqual({ enabled: false });
  });

  it('returns the site key when the deployment is challenged', async () => {
    stubCaptcha({ enabled: true, siteKey: '0xTESTKEY' });
    await expect(fetchCaptchaConfig()).resolves.toEqual({
      enabled: true,
      siteKey: '0xTESTKEY',
    });
  });

  it('treats enabled-without-a-key as disabled rather than rendering a broken widget', async () => {
    stubCaptcha({ enabled: true });
    await expect(fetchCaptchaConfig()).resolves.toEqual({ enabled: false });
  });

  it('falls back to disabled when the lookup fails, instead of blocking the form', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(fetchCaptchaConfig()).resolves.toEqual({ enabled: false });
  });

  it('survives an empty response body rather than throwing inside a render effect', async () => {
    // REGRESSION: this used to read `.enabled` off undefined and, because the
    // caller runs it in a useEffect, the throw unmounted the entire sign-in
    // form. A config lookup must never be able to take a form down.
    // SignInReset.test.tsx covers the sibling case (a suite stubbing lib/api).
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    } as Response);
    await expect(fetchCaptchaConfig()).resolves.toEqual({ enabled: false });
  });

  it('asks the server only once however many forms mount', async () => {
    const spy = stubCaptcha({ enabled: false });
    await Promise.all([fetchCaptchaConfig(), fetchCaptchaConfig(), fetchCaptchaConfig()]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('never contacts Cloudflare while the deployment is unchallenged', async () => {
    stubCaptcha({ enabled: false });
    await fetchCaptchaConfig();
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
  });
});

describe('loadTurnstile', () => {
  it('injects the explicit-render script exactly once', () => {
    void loadTurnstile();
    void loadTurnstile();
    const tags = document.querySelectorAll('script[src*="challenges.cloudflare.com"]');
    expect(tags).toHaveLength(1);
    expect(tags[0].getAttribute('src')).toContain('render=explicit');
  });
});
