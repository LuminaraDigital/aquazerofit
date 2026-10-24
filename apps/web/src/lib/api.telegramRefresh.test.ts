// @vitest-environment jsdom
/**
 * Inside web.telegram.org the refresh cookie is SameSite=Lax, so it is not
 * sent. A failed cookie refresh must re-run Telegram initData auth. It must
 * not do that in an ordinary browser, and a successful cookie refresh must
 * not be replaced by a second sign-in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, restoreSession, tokenStore } from './api';

const INIT_DATA = 'auth_date=1&hash=abc&user=%7B%22id%22%3A1%7D';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installTelegram(initData: string | null): void {
  if (!initData) {
    delete window.Telegram;
    return;
  }
  window.Telegram = {
    WebApp: {
      initData,
      ready() {},
      expand() {},
    },
  };
}

afterEach(() => {
  tokenStore.clear();
  delete window.Telegram;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Telegram refresh fallback', () => {
  it('re-runs initData auth when cookie refresh fails inside Telegram', async () => {
    installTelegram(INIT_DATA);
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return jsonResponse({ code: 'AUTH_INVALID', message: 'Refresh token required' }, 401);
      }
      if (String(url).endsWith('/auth/telegram')) {
        return jsonResponse({
          accessToken: 'tg-access',
          refreshToken: 'tg-refresh-not-stored',
          user: { id: 'usr_tg' },
        });
      }
      return jsonResponse({ code: 'INTERNAL', message: 'unexpected' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreSession()).resolves.toBe(true);
    expect(tokenStore.access).toBe('tg-access');
    expect(tokenStore.refresh).toBeNull();

    const telegramCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/auth/telegram'));
    expect(telegramCall).toBeTruthy();
    const init = telegramCall?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ initData: INIT_DATA });
    expect(init?.credentials).toBeUndefined();
  });

  it('does not call Telegram auth when the refresh cookie works', async () => {
    installTelegram(INIT_DATA);
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return jsonResponse({
          accessToken: 'cookie-access',
          refreshToken: 'rotated',
          user: { id: 'usr_web' },
        });
      }
      return jsonResponse({ code: 'INTERNAL', message: 'unexpected' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreSession()).resolves.toBe(true);
    expect(tokenStore.access).toBe('cookie-access');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/auth/telegram'))).toBe(false);
  });

  it('does not call Telegram auth outside Telegram', async () => {
    installTelegram(null);
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ code: 'AUTH_INVALID', message: 'Refresh token required' }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreSession()).resolves.toBe(false);
    expect(tokenStore.access).toBeNull();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/auth/telegram'))).toBe(false);
  });

  it('recovers a 401 inside Telegram by signing in with initData', async () => {
    installTelegram(INIT_DATA);
    tokenStore.set({ accessToken: 'expired-access' });
    let meCalls = 0;
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith('/me')) {
        meCalls += 1;
        if (meCalls === 1) return jsonResponse({ code: 'AUTH_INVALID', message: 'expired' }, 401);
        return jsonResponse({ user: { id: 'usr_tg' } });
      }
      if (path.endsWith('/auth/refresh')) {
        return jsonResponse({ code: 'AUTH_INVALID', message: 'Refresh token required' }, 401);
      }
      if (path.endsWith('/auth/telegram')) {
        return jsonResponse({
          accessToken: 'fresh-access',
          refreshToken: 'body-only',
          user: { id: 'usr_tg' },
        });
      }
      return jsonResponse({ code: 'INTERNAL', message: 'unexpected' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    const body = await api<{ user: { id: string } }>('/me');
    expect(body.user.id).toBe('usr_tg');
    expect(tokenStore.access).toBe('fresh-access');
    expect(meCalls).toBe(2);
  });
});
