// @vitest-environment jsdom
/**
 * The Android app is not on Google Play yet, so the page must say so rather
 * than link a listing that does not exist, and it must lead to the policy URL
 * Play Console declares.
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

  it('says the app is coming soon and links no store listing', () => {
    const { container } = renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /coming soon to google play/i })).toBeTruthy();
    expect(screen.getByText('Available soon')).toBeTruthy();
    expect(container.querySelector('a[href*="play.google.com"]')).toBeNull();
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
