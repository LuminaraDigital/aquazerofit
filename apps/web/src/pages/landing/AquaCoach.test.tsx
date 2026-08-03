// @vitest-environment jsdom
/**
 * This page publishes the coach's boundaries, which makes it the one page on
 * the site where a silent content regression is a safety problem rather than a
 * marketing one. These assert that the four refusal categories and the exact
 * crisis signpost the application returns are on the page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  CHAT_HISTORY_MAX_TURNS,
  CRISIS_SIGNPOST,
  MEMORY_EXTRACTION_MAX_FACTS_PER_TURN,
} from '@aquazerofit/shared';

const mocks = vi.hoisted(() => ({ isTMA: vi.fn(() => false) }));
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA }));

import AquaCoachPage from './AquaCoach';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/aqua-coach']}>
      <Routes>
        <Route path="/aqua-coach" element={<AquaCoachPage />} />
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

describe('Aqua Coach page', () => {
  it('publishes every classifier label the guardrails apply', () => {
    renderPage();

    // Scoped to the guardrail table: the labels also appear as badges on the
    // example exchanges, and this assertion is about the published contract.
    const table = within(screen.getByRole('table', { name: /safety classifier/i }));
    for (const label of ['crisis', 'medical', 'extremeDiet', 'outOfScope', 'safe']) {
      expect(table.getByText(label)).toBeTruthy();
    }
  });

  it('quotes the crisis signpost exactly as the application returns it', () => {
    renderPage();

    expect(screen.getByText(CRISIS_SIGNPOST)).toBeTruthy();
  });

  it('states the grounding window and memory extraction cap from source', () => {
    renderPage();

    const history = screen.getByRole('row', { name: /conversation history carried/i });
    expect(within(history).getByText(`last ${CHAT_HISTORY_MAX_TURNS} exchanges`)).toBeTruthy();

    expect(screen.getByText(`at most ${MEMORY_EXTRACTION_MAX_FACTS_PER_TURN}`)).toBeTruthy();
  });

  it('labels the scripted exchanges as illustrative, not captures', () => {
    renderPage();

    expect(screen.getByText(/illustrative exchanges/i)).toBeTruthy();
  });

  it('sends a Telegram Mini App visitor to the welcome carousel', () => {
    mocks.isTMA.mockReturnValue(true);
    renderPage();

    expect(screen.getByText('mini app welcome')).toBeTruthy();
  });
});
