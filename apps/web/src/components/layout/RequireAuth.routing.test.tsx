// @vitest-environment jsdom
/**
 * Where the three audiences go, now that `/` is both the marketing front door
 * and the app's home.
 *
 * This is the decision the landing page used to make about itself. It moved
 * here because a page rendered *at* `/` cannot redirect `/` to `/`, and because
 * the rule was only ever half-true where it lived: it governed one route while
 * the guard governed every other one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  tokenStore: { isAuthenticated: false },
  // Resolved restore: no refresh cookie in these tests, so session restore
  // settles to false and the guard renders unauthenticated.
  restoreSession: vi.fn(async () => false),
  isTMA: vi.fn(() => false),
  startParam: null as string | null,
  useProfile: vi.fn(() => ({
    data: { id: 'p1' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
  // Firebase disabled unless a case turns it on.
  firebase: { isLoading: false, firebaseEnabled: false },
}));

vi.mock('../../lib/api', () => ({
  tokenStore: mocks.tokenStore,
  restoreSession: mocks.restoreSession,
}));
vi.mock('../../lib/telegram', () => ({
  isTMA: mocks.isTMA,
  getTelegramStartParam: () => mocks.startParam,
}));
vi.mock('../../lib/queries', () => ({ useProfile: mocks.useProfile }));
vi.mock('../../lib/AuthProvider', () => ({
  useFirebaseAuth: () => ({
    ...mocks.firebase,
    firebaseUser: null,
    idToken: null,
    signInEmail: vi.fn(),
    registerEmail: vi.fn(),
    resetPassword: vi.fn(),
    signOutFirebase: vi.fn(),
    mapError: (err: unknown) => String(err),
  }),
}));

import { RequireAuth } from './RequireAuth';

function app(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireAuth publicIndex={<p>marketing landing</p>} />}>
          <Route path="/" element={<p>app home</p>} />
          <Route path="/settings" element={<p>app settings</p>} />
          <Route path="/plan" element={<p>plan page</p>} />
        </Route>
        <Route path="/welcome" element={<p>mini app welcome</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderAt(path: string) {
  return render(app(path));
}

beforeEach(() => {
  mocks.tokenStore.isAuthenticated = false;
  mocks.startParam = null;
  mocks.isTMA.mockReturnValue(false);
  mocks.firebase.isLoading = false;
  mocks.firebase.firebaseEnabled = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RequireAuth front door', () => {
  it('serves the marketing page in place at / with no redirect for cold traffic', async () => {
    renderAt('/');

    // Session restore (restoreSession) settles first, then the marketing page.
    await waitFor(() => expect(screen.getByText('marketing landing')).toBeTruthy());
  });

  it('sends a signed-in visitor to the app at the same URL', () => {
    mocks.tokenStore.isAuthenticated = true;
    renderAt('/');

    expect(screen.getByText('app home')).toBeTruthy();
    expect(screen.queryByText('marketing landing')).toBeNull();
  });

  it('sends a Telegram Mini App visitor to the welcome carousel, not to marketing', async () => {
    mocks.isTMA.mockReturnValue(true);
    renderAt('/');

    await waitFor(() => expect(screen.getByText('mini app welcome')).toBeTruthy());
    expect(screen.queryByText('marketing landing')).toBeNull();
  });

  it('opens /plan when a signed-in Mini App launch used startapp=plan', async () => {
    mocks.tokenStore.isAuthenticated = true;
    mocks.startParam = 'plan';
    renderAt('/');

    await waitFor(() => expect(screen.getByText('plan page')).toBeTruthy());
  });

  it('opens /plan when a signed-in Mini App launch used startapp=upgrade', async () => {
    mocks.tokenStore.isAuthenticated = true;
    mocks.startParam = 'upgrade';
    renderAt('/');

    await waitFor(() => expect(screen.getByText('plan page')).toBeTruthy());
  });

  it('still redirects a guarded route rather than rendering marketing under its URL', async () => {
    renderAt('/settings');

    // Redirected to `/`, which then renders marketing. One hop, and the
    // address bar never claims /settings is a marketing page.
    await waitFor(() => expect(screen.getByText('marketing landing')).toBeTruthy());
    expect(screen.queryByText('app settings')).toBeNull();
  });

  /*
   * With Firebase on, the guard first waits for it. A Telegram or cookie
   * session is restored only after that, and the guard must hold until it is,
   * not redirect in the render where Firebase finishes.
   */
  it('restores a cookie session once Firebase settles, before deciding the visitor is signed out', async () => {
    mocks.firebase.isLoading = true;
    mocks.firebase.firebaseEnabled = true;
    mocks.restoreSession.mockImplementationOnce(async () => {
      mocks.tokenStore.isAuthenticated = true;
      return true;
    });
    const view = renderAt('/settings');
    expect(screen.queryByText('app settings')).toBeNull();

    mocks.firebase.isLoading = false;
    view.rerender(app('/settings'));

    await waitFor(() => expect(screen.getByText('app settings')).toBeTruthy());
    expect(screen.queryByText('marketing landing')).toBeNull();
  });
});
