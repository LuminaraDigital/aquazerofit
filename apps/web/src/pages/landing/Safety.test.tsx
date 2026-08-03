// @vitest-environment jsdom
/**
 * The safety page makes the product's strongest claims, so the assertions that
 * matter are the ones that would catch it drifting into marketing: the floors
 * must match the constants the calculator enforces, and the section admitting
 * what the product is *not* must still be there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { KCAL_FLOOR, MEAL_PHOTO_MAX_BYTES } from '@aquazerofit/shared';

const mocks = vi.hoisted(() => ({ isTMA: vi.fn(() => false) }));
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA }));

import SafetyPage from './Safety';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/safety']}>
      <Routes>
        <Route path="/safety" element={<SafetyPage />} />
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

describe('Safety page', () => {
  it('renders each documented area', () => {
    const { container } = renderPage();

    for (const id of [
      'invariants',
      'numbers',
      'allergens',
      'data',
      'security',
      'limits',
      'openness',
    ]) {
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
    }
  });

  it('quotes the calorie floors the calculator actually enforces', () => {
    renderPage();

    const female = screen.getByRole('row', { name: /calorie floor — female/i });
    expect(within(female).getByText(`${KCAL_FLOOR.female.toLocaleString()} kcal`)).toBeTruthy();

    const male = screen.getByRole('row', { name: /calorie floor — male/i });
    expect(within(male).getByText(`${KCAL_FLOOR.male.toLocaleString()} kcal`)).toBeTruthy();
  });

  it('states the upload limit from the shared constant', () => {
    renderPage();

    const upload = screen.getByRole('row', { name: /maximum upload/i });
    const mib = Math.round(MEAL_PHOTO_MAX_BYTES / (1024 * 1024));
    expect(within(upload).getByText(`${mib} MB`)).toBeTruthy();
  });

  it('keeps the section describing what the product is not', () => {
    renderPage();

    expect(screen.getByText(/not a medical device/i)).toBeTruthy();
    expect(screen.getByText(/a photograph cannot weigh your dinner/i)).toBeTruthy();
  });

  it('points vulnerability reports at the private security policy', () => {
    renderPage();

    expect(screen.getByRole('link', { name: /security policy/i }).getAttribute('href')).toMatch(
      /SECURITY\.md$/,
    );
  });

  it('sends a Telegram Mini App visitor to the welcome carousel', () => {
    mocks.isTMA.mockReturnValue(true);
    renderPage();

    expect(screen.getByText('mini app welcome')).toBeTruthy();
  });
});
