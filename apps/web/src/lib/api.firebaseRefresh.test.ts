// @vitest-environment jsdom
/**
 * Firebase is the first of three ways a session is restored. When its SDK
 * cannot be loaded that is a miss like any other, and the refresh cookie and
 * Telegram launch data still get their turn.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({
  isFirebaseAuthEnabled: () => true,
  loadFirebaseSdk: vi.fn(() => Promise.reject(new Error('Failed to fetch dynamically imported module'))),
}));

import { restoreSession, tokenStore } from './api';

afterEach(() => {
  tokenStore.clear();
  vi.unstubAllGlobals();
});

describe('session restore when the Firebase SDK fails to load', () => {
  it('still restores the session from the refresh cookie', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/auth/refresh')
        ? new Response(JSON.stringify({ accessToken: 'cookie-access', refreshToken: 'rotated', user: { id: 'usr_web' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response('{}', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreSession()).resolves.toBe(true);
    expect(tokenStore.access).toBe('cookie-access');
  });
});
