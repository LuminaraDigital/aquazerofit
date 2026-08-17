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
  useProfile: vi.fn(() => ({
    data: { id: 'p1' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}));

vi.mock('../../lib/api', () => ({
  tokenStore: mocks.tokenStore,
  restoreSession: mocks.restoreSession,
}));
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA }));
vi.mock('../../lib/queries', () => ({ useProfile: mocks.useProfile }));

import { RequireAuth } from './RequireAuth';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireAuth publicIndex={<p>marketing landing</p>} />}>
          <Route path="/" element={<p>app home</p>} />
          <Route path="/settings" element={<p>app settings</p>} />
        </Route>
        <Route path="/welcome" element={<p>mini app welcome</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.tokenStore.isAuthenticated = false;
  mocks.isTMA.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RequireAuth front door', () => {
  it('serves the marketing page in place at / — no redirect for cold traffic', async () => {
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

  it('still redirects a guarded route rather than rendering marketing under its URL', async () => {
    renderAt('/settings');

    // Redirected to `/`, which then renders marketing — one hop, and the
    // address bar never claims /settings is a marketing page.
    await waitFor(() => expect(screen.getByText('marketing landing')).toBeTruthy());
    expect(screen.queryByText('app settings')).toBeNull();
  });
});
