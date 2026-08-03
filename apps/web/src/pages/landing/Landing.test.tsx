// @vitest-environment jsdom
/**
 * The landing page is the web front door, so the three audiences it has to
 * separate are worth pinning: anonymous browsers see the page, signed-in users
 * are sent to the app, and Telegram gets the Mini App welcome instead (its
 * silent auto-login lives there — landing a Mini App user here would strand
 * them on a marketing page).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  tokenStore: { isAuthenticated: false },
  isTMA: vi.fn(() => false),
}));

vi.mock('../../lib/api', () => ({ tokenStore: mocks.tokenStore }));
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA }));

import Landing from './Landing';

function renderAt() {
  return render(
    <MemoryRouter initialEntries={['/landing']}>
      <Routes>
        <Route path="/landing" element={<Landing />} />
        <Route path="/" element={<p>app dashboard</p>} />
        <Route path="/welcome" element={<p>mini app welcome</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.tokenStore.isAuthenticated = false;
  mocks.isTMA.mockReturnValue(false);
  // jsdom implements neither. Returning a null WebGL context is also the real
  // no-WebGL path, so this asserts the page renders without its canvases.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => null,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Landing', () => {
  it('renders the hero and both entry points for an anonymous web visitor', () => {
    renderAt();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/aquazerofit/i);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/your day, measured/i);
    expect(screen.getByRole('link', { name: /start free/i }).getAttribute('href')).toBe(
      '/sign-in?mode=register',
    );
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
  });

  it('links to the dedicated product pages from the footer', () => {
    renderAt();

    const footer = screen.getByRole('contentinfo');
    const expected: Array<[RegExp, string]> = [
      [/^features$/i, '/features'],
      [/^how it works$/i, '/how-it-works'],
      [/^aqua coach$/i, '/aqua-coach'],
      [/^safety$/i, '/safety'],
    ];

    for (const [name, href] of expected) {
      expect(within(footer).getByRole('link', { name }).getAttribute('href')).toBe(href);
    }
  });

  it('states the wellness boundary rather than implying clinical advice', () => {
    renderAt();

    expect(screen.getAllByText(/does not provide medical diagnosis/i).length).toBeGreaterThan(0);
  });

  it('sends an authenticated visitor to the app instead of the marketing page', () => {
    mocks.tokenStore.isAuthenticated = true;
    renderAt();

    expect(screen.getByText('app dashboard')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('sends a Telegram Mini App visitor to the welcome carousel', () => {
    mocks.isTMA.mockReturnValue(true);
    renderAt();

    expect(screen.getByText('mini app welcome')).toBeTruthy();
  });
});
