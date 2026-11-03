// @vitest-environment jsdom
/**
 * CONTRACT GUARD — /mobile/captcha is half of an agreement with a client that
 * ships separately (the Android WebView challenge). Nothing in this repository
 * type-checks the other half, so the shape of the bridge is asserted here:
 * the query parameter that goes in, and the two callbacks that come out.
 *
 * The case worth the most is the one nobody exercises on purpose: the page
 * opened in an ordinary browser, with no `window.AzfCaptcha` at all. That URL
 * is public and will be visited. It has to explain itself and stop, not throw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { TurnstileRenderOptions } from '../../lib/turnstile';

const mocks = vi.hoisted(() => ({
  fetchCaptchaConfig: vi.fn(),
  rendered: [] as TurnstileRenderOptions[],
}));

vi.mock('../../lib/turnstile', () => ({
  fetchCaptchaConfig: mocks.fetchCaptchaConfig,
  loadTurnstile: () =>
    Promise.resolve({
      render: (_el: HTMLElement, opts: TurnstileRenderOptions) => {
        mocks.rendered.push(opts);
        return 'widget-1';
      },
      reset: vi.fn(),
      remove: vi.fn(),
    }),
}));

import MobileCaptcha from './MobileCaptcha';

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/mobile/captcha${search}`]}>
      <Routes>
        <Route path="/mobile/captcha" element={<MobileCaptcha />} />
      </Routes>
    </MemoryRouter>,
  );
}

function installHost() {
  const host = { onToken: vi.fn(), onError: vi.fn() };
  window.AzfCaptcha = host;
  return host;
}

/** Wait for the widget to mount and hand back the options it was rendered with. */
async function widgetOptions(): Promise<TurnstileRenderOptions> {
  await screen.findByTestId('turnstile-widget');
  // The render call happens in the same microtask chain as the effect above.
  await act(async () => {});
  const opts = mocks.rendered.at(-1);
  if (!opts) throw new Error('Turnstile was never rendered');
  return opts;
}

beforeEach(() => {
  mocks.rendered.length = 0;
  mocks.fetchCaptchaConfig.mockReset();
  mocks.fetchCaptchaConfig.mockResolvedValue({ enabled: true, siteKey: 'site-key' });
  delete window.AzfCaptcha;
  document.head.querySelector('meta[name="robots"]')?.remove();
});

afterEach(cleanup);

describe('/mobile/captcha with no native host', () => {
  it('explains itself instead of throwing', async () => {
    expect(() => renderAt('?action=register')).not.toThrow();
    expect(await screen.findByText(/part of signing up in the AquaZeroFit mobile app/i))
      .toBeDefined();
  });

  it('issues no challenge, because there is nobody to hand the token to', async () => {
    renderAt('');
    await act(async () => {});
    expect(mocks.rendered).toHaveLength(0);
    expect(mocks.fetchCaptchaConfig).not.toHaveBeenCalled();
  });
});

describe('/mobile/captcha with a native host', () => {
  it('passes the requested action through to Turnstile', async () => {
    installHost();
    renderAt('?action=password-reset');
    expect((await widgetOptions()).action).toBe('password-reset');
  });

  it('falls back to register for a missing or unknown action', async () => {
    installHost();
    renderAt('');
    expect((await widgetOptions()).action).toBe('register');
    cleanup();

    mocks.rendered.length = 0;
    installHost();
    renderAt('?action=delete-everything');
    expect((await widgetOptions()).action).toBe('register');
  });

  it('hands a solved token to the host exactly once', async () => {
    const host = installHost();
    renderAt('?action=register');
    const opts = await widgetOptions();

    await act(async () => {
      opts.callback('solved-token');
    });

    expect(host.onToken).toHaveBeenCalledTimes(1);
    expect(host.onToken).toHaveBeenCalledWith('solved-token');
    expect(host.onError).not.toHaveBeenCalled();
    expect(screen.getByTestId('captcha-delivered')).toBeDefined();
  });

  it('reports an expiry and a widget error rather than going quiet', async () => {
    const host = installHost();
    renderAt('?action=register');
    const opts = await widgetOptions();

    await act(async () => {
      opts['expired-callback']?.();
    });
    expect(host.onError).toHaveBeenCalledWith('expired');

    await act(async () => {
      opts['error-callback']?.();
    });
    expect(host.onError).toHaveBeenCalledWith('error');
    // '' is a cleared token, never a token.
    expect(host.onToken).not.toHaveBeenCalled();
  });

  it('tells the host when the deployment is not challenged at all', async () => {
    // Otherwise the host waits on a blank page: a keyless deployment renders no
    // widget, and "unsolved" and "nothing to solve" look identical from Kotlin.
    const host = installHost();
    mocks.fetchCaptchaConfig.mockResolvedValue({ enabled: false });
    renderAt('?action=register');

    await act(async () => {});
    expect(host.onError).toHaveBeenCalledWith('unavailable');
    expect(mocks.rendered).toHaveLength(0);
  });

  it('survives a host whose bridge throws', async () => {
    // @JavascriptInterface methods are native code and can raise; a throw here
    // used to be an unmounted page rather than a logged failure on their side.
    window.AzfCaptcha = {
      onToken: () => {
        throw new Error('bridge exploded');
      },
    };
    renderAt('?action=register');
    const opts = await widgetOptions();

    await act(async () => {
      opts.callback('solved-token');
    });
    expect(screen.getByTestId('captcha-delivered')).toBeDefined();
  });

  it('marks the document noindex', async () => {
    installHost();
    renderAt('?action=register');
    await act(async () => {});
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow',
    );
  });
});
