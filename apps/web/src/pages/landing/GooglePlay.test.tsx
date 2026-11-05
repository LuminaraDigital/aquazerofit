// @vitest-environment jsdom
/**
 * The Android app is live on Google Play, so the page must link the listing,
 * and it must lead to the policy URL Play Console declares.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { marketingRoute } from '../../lib/site';

const mocks = vi.hoisted(() => ({ isTMA: vi.fn(() => false) }));
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA }));

import GooglePlayPage from './GooglePlay';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/google-play']}>
      <Routes>
        <Route path="/google-play" element={<GooglePlayPage />} />
        <Route path="/welcome" element={<p>mini app welcome</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.isTMA.mockReturnValue(false);
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

describe('Google Play page', () => {
  it('is in the marketing manifest, so it is crawlable', () => {
    expect(marketingRoute('/google-play')).toBeDefined();
  });

  it('says the app is on Google Play and links the listing', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /now on google play/i })).toBeTruthy();
    const badges = screen.getAllByRole('link', { name: /get it on google play/i });
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.getAttribute('href')).toBe(
        'https://play.google.com/store/apps/details?id=fit.aquazero.app',
      );
    }
  });

  it('no longer describes the app as unreleased', () => {
    renderPage();

    expect(screen.queryByText(/coming soon|available soon|in development/i)).toBeNull();
    expect(marketingRoute('/google-play')!.title).not.toMatch(/coming soon/i);
  });

  it('links the Play privacy policy', () => {
    const { container } = renderPage();

    expect(container.querySelectorAll('a[href="/google-play/privacy-policy"]').length).toBeGreaterThan(0);
  });

  it('sends a Telegram Mini App visitor to the welcome carousel', () => {
    mocks.isTMA.mockReturnValue(true);
    renderPage();

    expect(screen.getByText('mini app welcome')).toBeTruthy();
  });
});
