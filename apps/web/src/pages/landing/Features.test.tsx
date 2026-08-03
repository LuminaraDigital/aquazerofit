// @vitest-environment jsdom
/**
 * The point of /features is that its numbers come from the shared constants
 * rather than from copy, so the test that matters is the one asserting the
 * page renders the safety-relevant values the application actually uses. If a
 * calorie floor or a memory cap changes and this page does not follow, that is
 * a stale claim about a health product, and it should fail the build.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  ACTIVITY_FACTORS,
  FREE_TIER_DAILY_CREDITS,
  KCAL_FLOOR,
  MEMORY_MAX_FACTS_CONFIRMED,
  WATER_ML_PER_KG,
} from '@aquazerofit/shared';

const mocks = vi.hoisted(() => ({ isTMA: vi.fn(() => false) }));
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA }));

import FeaturesPage from './Features';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/features']}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
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

describe('Features page', () => {
  it('renders every documented section', () => {
    const { container } = renderPage();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/every feature/i);
    for (const id of ['nutrition', 'targets', 'training', 'coach', 'progress', 'platform']) {
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
    }
  });

  it('states the calorie floors the target calculator actually enforces', () => {
    renderPage();

    const row = screen.getByRole('row', { name: /calorie floor — female/i });
    expect(within(row).getByText(`${KCAL_FLOOR.female.toLocaleString()} kcal`)).toBeTruthy();

    const male = screen.getByRole('row', { name: /calorie floor — male/i });
    expect(within(male).getByText(`${KCAL_FLOOR.male.toLocaleString()} kcal`)).toBeTruthy();
  });

  it('states the activity factors, hydration rate and memory caps from source', () => {
    renderPage();

    expect(screen.getByText(`× ${ACTIVITY_FACTORS.veryActive}`)).toBeTruthy();
    expect(screen.getByText(`${WATER_ML_PER_KG} ml per kg of bodyweight`)).toBeTruthy();
    expect(screen.getByText(`up to ${MEMORY_MAX_FACTS_CONFIRMED}`)).toBeTruthy();
    expect(screen.getByText(String(FREE_TIER_DAILY_CREDITS))).toBeTruthy();
  });

  it('keeps the wellness boundary on the page', () => {
    renderPage();

    expect(screen.getAllByText(/does not provide medical diagnosis/i).length).toBeGreaterThan(0);
  });

  it('sends a Telegram Mini App visitor to the welcome carousel', () => {
    mocks.isTMA.mockReturnValue(true);
    renderPage();

    expect(screen.getByText('mini app welcome')).toBeTruthy();
  });
});
