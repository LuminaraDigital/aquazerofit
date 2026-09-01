// @vitest-environment jsdom
/**
 * These pages make binding statements, so the assertions here are about
 * honesty rather than layout:
 *
 *  - while operator details are missing, every page must SAY it is a draft,
 *    because a legal document that looks finished and is not is the worst
 *    possible failure mode for this file;
 *  - the retention periods quoted must match the constants the server enforces;
 *  - the disclosures the project's own privacy review made mandatory before
 *    launch (the Open Food Facts barcode transfer) must be present.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MEMORY_REJECTED_RETENTION_DAYS, RANGES } from '@aquazerofit/shared';

const mocks = vi.hoisted(() => ({ isTMA: vi.fn(() => false) }));
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA }));

import PrivacyPage from './Privacy';
import TermsPage from './Terms';
import SupportPage from './Support';
import AccountDeletionPage from './AccountDeletion';
import { isPublished, OPERATOR } from './operator';

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
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

describe('legal pages', () => {
  it('declare themselves a draft until every operator fact is supplied', () => {
    // Guard the guard: if this ever fails, the pages are publishable and the
    // draft assertions below need revisiting deliberately, not deleted.
    expect(isPublished()).toBe(false);

    for (const [path, element] of [
      ['/privacy', <PrivacyPage key="p" />],
      ['/terms', <TermsPage key="t" />],
      ['/support', <SupportPage key="s" />],
      ['/account/deletion', <AccountDeletionPage key="d" />],
    ] as const) {
      renderAt(path, element);
      expect(screen.getByText(/draft — not yet in force/i)).toBeTruthy();
      cleanup();
    }
  });

  it('marks missing operator facts visibly rather than leaving a blank', () => {
    expect(OPERATOR.legalName).toBeNull();
    renderAt('/privacy', <PrivacyPage />);

    expect(screen.getAllByText(/\[operator legal name\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[governing jurisdiction\]/i).length).toBeGreaterThan(0);
  });
});

describe('privacy notice', () => {
  it('quotes retention periods the server actually enforces', () => {
    renderAt('/privacy', <PrivacyPage />);

    expect(screen.getByText(`${MEMORY_REJECTED_RETENTION_DAYS} days, then erased.`)).toBeTruthy();
    expect(screen.getByText(/24 hours after the analysis finishes/i)).toBeTruthy();
    expect(screen.getByText(/30 days, then purged automatically/i)).toBeTruthy();
  });

  it('discloses the Open Food Facts barcode transfer', () => {
    // Required before launch by docs/research/security-privacy-review.md §6.
    renderAt('/privacy', <PrivacyPage />);

    expect(screen.getAllByText(/Open Food Facts/).length).toBeGreaterThan(0);
    expect(screen.getByText(/scanned that product/i)).toBeTruthy();
  });

  it('states the minimum age the profile accepts', () => {
    renderAt('/privacy', <PrivacyPage />);

    expect(
      screen.getByText(new RegExp(`accepts ages from\\s+${RANGES.age.min}`, 'i')),
    ).toBeTruthy();
  });
});

/**
 * Play requires a public URL where an account can be deleted without the app
 * installed, and requires it to state what deletion actually does. These
 * assertions are against the semantics in apps/api/src/modules/me/service.ts —
 * two steps, a 30-day grace period, an anonymised remainder — because a page
 * that describes a different flow than the code runs is the failure mode this
 * requirement exists to prevent.
 */
describe('account deletion page', () => {
  it('gives the in-app route and the browser route', () => {
    renderAt('/account/deletion', <AccountDeletionPage />);

    expect(screen.getAllByText(/Settings/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /deleting from a browser/i })).toBeTruthy();
  });

  it('describes the two-step deletion and the grace period the server enforces', () => {
    renderAt('/account/deletion', <AccountDeletionPage />);

    expect(screen.getByText(/30-day grace period starts/i)).toBeTruthy();
    expect(screen.getByText(/erased immediately/i)).toBeTruthy();
    expect(screen.getByText(/every six hours/i)).toBeTruthy();
  });

  it('says what survives deletion, and links the retention table', () => {
    const { container } = renderAt('/account/deletion', <AccountDeletionPage />);

    expect(screen.getAllByText(/anonymised/i).length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/privacy#retention"]')).toBeTruthy();
  });

  it('offers the export before the irreversible step', () => {
    renderAt('/account/deletion', <AccountDeletionPage />);

    expect(screen.getByText(/Export my data/)).toBeTruthy();
  });
});

describe('terms of use', () => {
  it('separates the software licence from the service terms', () => {
    renderAt('/terms', <TermsPage />);

    expect(screen.getByText(/governs the/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /the software licence/i })).toBeTruthy();
  });

  it('does not promise paid plans the service cannot take payment for', () => {
    renderAt('/terms', <TermsPage />);

    expect(screen.getByText(/credits are not sold/i)).toBeTruthy();
  });
});

describe('support page', () => {
  it('leads with the crisis signpost', () => {
    const { container } = renderAt('/support', <SupportPage />);

    const sections = [...container.querySelectorAll('main section[id]')].map((s) => s.id);
    expect(sections[0]).toBe('urgent');
    expect(screen.getByText(/contact Lifeline/i)).toBeTruthy();
  });

  it('sends a Telegram Mini App visitor to the welcome carousel', () => {
    mocks.isTMA.mockReturnValue(true);
    renderAt('/support', <SupportPage />);

    expect(screen.getByText('mini app welcome')).toBeTruthy();
  });
});
