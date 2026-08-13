// @vitest-environment jsdom
/**
 * The landing page is the only cold-traffic surface in a Telegram-first
 * product, so what is pinned here is its conversion contract rather than its
 * appearance: the primary action leaves for Telegram carrying attribution with
 * it, and the browser path is offered beside it rather than buried.
 *
 * Who is allowed to see this page at all is no longer decided here — that
 * moved to RequireAuth, and is covered in RequireAuth.routing.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  tokenStore: { isAuthenticated: false },
  isTMA: vi.fn(() => false),
  trackGrowth: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/api', () => ({ tokenStore: mocks.tokenStore }));
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA }));
vi.mock('../../lib/growth', () => ({ trackGrowth: mocks.trackGrowth }));

import Landing from './Landing';

function renderAt() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
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
  it('renders the hero for an anonymous web visitor', () => {
    renderAt();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/aquazerofit/i);
    expect(heading.textContent).toMatch(/your day, measured/i);
  });

  it('makes Telegram the primary action', () => {
    renderAt();

    const ctas = screen.getAllByRole('link', { name: /open in telegram/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta.getAttribute('href')).toMatch(/^https:\/\/t\.me\//);
    }
  });

  it('carries stored attribution into the Telegram deep link', () => {
    localStorage.setItem(
      'azf_attr_v1',
      JSON.stringify({
        ref: 'abc123',
        utmSource: 'reddit',
        utmMedium: null,
        utmCampaign: null,
        challengeCode: 'HUDDLE7',
        capturedAt: new Date().toISOString(),
      }),
    );

    renderAt();

    const href = screen.getAllByRole('link', { name: /open in telegram/i })[0].getAttribute('href');
    expect(href).toContain('startapp=');
    expect(href).toContain('r-abc123');
    expect(href).toContain('c-HUDDLE7');
    expect(href).toContain('s-reddit');
  });

  it('offers the browser as a real second path, not a hidden one', () => {
    renderAt();

    const fallbacks = screen.getAllByRole('link', { name: /use it in your browser/i });
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(fallbacks[0].getAttribute('href')).toBe('/sign-in?mode=register');
    // The segment this exists for has to be told that it exists.
    expect(screen.getAllByText(/blocked/i).length).toBeGreaterThan(0);
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
});
