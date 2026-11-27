// @vitest-environment jsdom
/**
 * The landing page is the cold-traffic surface. The primary actions are the
 * web app and Google Play. Telegram stays available, and its link still
 * carries attribution.
 *
 * Who is allowed to see this page at all is no longer decided here. That
 * moved to RequireAuth, and is covered in RequireAuth.routing.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('Landing', () => {
  it('renders the hero for an anonymous web visitor', () => {
    renderAt();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/aquazerofit/i);
    expect(heading.textContent).toMatch(/your day, measured/i);
    // The brand line and the headline are separate words to a screen reader,
    // not "coachingYour day".
    expect(heading.textContent).toMatch(/coaching Your day/);
  });

  it('makes the web app the primary desktop action', () => {
    renderAt();

    const web = screen.getAllByRole('link', { name: /use it in your browser/i });
    expect(web.length).toBeGreaterThan(0);
    expect(web[0].getAttribute('href')).toBe('/sign-in?mode=register');
    // Hero web link is the filled primary. Telegram on that same hero is ghost.
    const heroWeb = web.find((link) => link.dataset.variant === 'primary');
    expect(heroWeb).toBeTruthy();
    const heroTelegram = screen.getAllByRole('link', { name: /open in telegram/i })[1];
    expect(heroWeb!.compareDocumentPosition(heroTelegram) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heroTelegram.dataset.variant).toBe('ghost');
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

  it('names the browser and Google Play in the hero, and keeps Telegram', () => {
    renderAt();

    expect(screen.getByText(/start in the browser/i)).toBeTruthy();
    expect(screen.getAllByText(/google play/i).length).toBeGreaterThan(0);
    const telegram = screen.getAllByRole('link', { name: /open in telegram/i });
    expect(telegram.length).toBeGreaterThan(0);
    for (const cta of telegram) {
      expect(cta.getAttribute('href')).toMatch(/^https:\/\/t\.me\//);
    }
  });

  it('puts Google Play with the web app, ahead of Telegram, on a desktop browser', () => {
    renderAt();

    const badges = screen.getAllByRole('link', { name: /get it on google play/i });
    expect(badges.length).toBe(2);
    expect(badges[0].getAttribute('href')).toBe(
      'https://play.google.com/store/apps/details?id=fit.aquazero.app',
    );
    const heroWeb = screen.getAllByRole('link', { name: /use it in your browser/i })[0];
    const heroTelegram = screen.getAllByRole('link', { name: /open in telegram/i })[1];
    expect(heroWeb.compareDocumentPosition(badges[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(badges[0].compareDocumentPosition(heroTelegram) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heroTelegram.dataset.variant).toBe('ghost');
  });

  it('leads with Google Play on an Android phone browser', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
    );
    renderAt();

    const [badge] = screen.getAllByRole('link', { name: /get it on google play/i });
    const heroWeb = screen.getAllByRole('link', { name: /use it in your browser/i })[0];
    const heroTelegram = screen.getAllByRole('link', { name: /open in telegram/i })[1];
    expect(badge.compareDocumentPosition(heroWeb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heroWeb.compareDocumentPosition(heroTelegram) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heroTelegram.dataset.variant).toBe('ghost');
  });

  it('records which placement a Play badge click came from', () => {
    renderAt();

    const badge = screen.getAllByRole('link', { name: /get it on google play/i })[0];
    badge.addEventListener('click', (e) => e.preventDefault()); // jsdom cannot navigate
    fireEvent.click(badge);
    expect(mocks.trackGrowth).toHaveBeenCalledWith('play_store_cta_clicked', { placement: 'hero' });
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

  it('opens and closes the 14-second brand reel dialog cleanly', () => {
    renderAt();

    fireEvent.click(screen.getByRole('button', { name: /14s reel/i }));
    const dialog = screen.getByRole('dialog', { name: /14-second brand reel/i });
    expect(dialog).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog', { name: /14-second brand reel/i })).toBeNull();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('closes the mobile navigation menu on Escape (restoring focus) and outside pointerdown', () => {
    const { container } = renderAt();

    const summary = container.querySelector('summary[aria-label="Navigation menu"]') as HTMLElement;
    const details = summary.closest('details') as HTMLDetailsElement;
    expect(summary).toBeTruthy();
    expect(details).toBeTruthy();

    details.open = true;
    fireEvent(details, new Event('toggle'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);

    details.open = true;
    fireEvent(details, new Event('toggle'));
    fireEvent.pointerDown(document.body);
    expect(details.open).toBe(false);
  });
});
