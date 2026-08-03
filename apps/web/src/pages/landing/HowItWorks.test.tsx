// @vitest-environment jsdom
/**
 * The walkthrough's job is to be complete and in order — a step quietly lost in
 * a refactor leaves a gap between "log a meal" and "watch the trend" that no
 * reader can fill. These assert the six steps, their order, and the promises
 * that appear beside them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ isTMA: vi.fn(() => false) }));
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA }));

import HowItWorksPage from './HowItWorks';

const STEP_IDS = ['profile', 'log', 'plan', 'train', 'ask', 'trend'];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/how-it-works']}>
      <Routes>
        <Route path="/how-it-works" element={<HowItWorksPage />} />
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

describe('How it works page', () => {
  it('renders all six steps in journey order', () => {
    const { container } = renderPage();

    const rendered = [...container.querySelectorAll('main section[id]')]
      .map((section) => section.id)
      .filter((id) => STEP_IDS.includes(id));

    expect(rendered).toEqual(STEP_IDS);
  });

  it('splits every step into what you do and what the app does', () => {
    renderPage();

    expect(screen.getAllByText('What you do')).toHaveLength(STEP_IDS.length);
    expect(screen.getAllByText('What the app does')).toHaveLength(STEP_IDS.length);
  });

  it('keeps the confirm-before-logging promise beside the logging step', () => {
    renderPage();

    expect(screen.getByText(/never writes to your day on its own/i)).toBeTruthy();
  });

  it('sends readers to the reference page for the exact constants', () => {
    renderPage();

    expect(
      screen.getByRole('link', { name: /exact formulas and constants/i }).getAttribute('href'),
    ).toBe('/features#targets');
  });

  it('sends a Telegram Mini App visitor to the welcome carousel', () => {
    mocks.isTMA.mockReturnValue(true);
    renderPage();

    expect(screen.getByText('mini app welcome')).toBeTruthy();
  });
});
