// @vitest-environment jsdom
/**
 * REGRESSION GUARD — the weekly insight card sends people to
 * /settings#privacy-consents to turn AI personalisation on. React Router does
 * not act on fragments, and the target section does not exist during the first
 * render (Settings shows a spinner until the profile query resolves), so the
 * interesting case is precisely the cold load: the effect runs, finds nothing,
 * and has to still be waiting when the section finally mounts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  profile: {
    loading: true,
    missing: false,
    data: {
      userId: 'u1',
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: 'unspecified',
      goal: 'maintain',
      activityLevel: 'moderate',
      exerciseExperience: 'beginner',
      dietaryPreferences: [],
      allergies: [],
      equipment: ['none'],
      unitPreference: 'metric',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
}));

vi.mock('../../lib/api', () => ({
  api: vi.fn(),
  tokenStore: { isAuthenticated: true },
  ApiError: class ApiError extends Error {},
}));
vi.mock('../../lib/telegram', () => ({
  haptic: vi.fn(),
  isTMA: () => false,
  getTelegramInitData: () => null,
}));
vi.mock('../../lib/queries', () => ({
  useSetCredentials: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLinkTelegram: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProfile: () => ({
    data: mocks.profile.loading || mocks.profile.missing ? null : mocks.profile.data,
    isLoading: mocks.profile.loading,
    isError: false,
    refetch: vi.fn(),
  }),
  useConsents: () => ({
    data: {
      wellnessDataProcessing: true,
      aiPersonalisation: false,
      anonymisedAnalytics: false,
      reminders: true,
    },
  }),
  useMe: () => ({ data: { displayName: 'Ada', email: 'ada@example.com' } }),
  useAuthActions: () => ({ logout: vi.fn() }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateConsents: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMe: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import Settings, { PRIVACY_CONSENTS_ANCHOR } from './Settings';

const HIGHLIGHT_CLASS = 'azf-hash-target';

let scrollIntoView: ReturnType<typeof vi.fn>;

function mockMotionPreference(reduced: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Link to={`/settings#${PRIVACY_CONSENTS_ANCHOR}`}>jump to consents</Link>
      <Routes>
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.profile.loading = true;
  mocks.profile.missing = false;
  mockMotionPreference(false);
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView'];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the privacy & consents deep link target', () => {
  it('exposes the exact id the rest of the app links to', () => {
    expect(PRIVACY_CONSENTS_ANCHOR).toBe('privacy-consents');
  });

  it('scrolls, highlights and focuses the section that mounts after the first render', async () => {
    const { rerender } = renderAt(`/settings#${PRIVACY_CONSENTS_ANCHOR}`);

    // Cold load: the page is still a spinner, so there is nothing to scroll to.
    expect(document.getElementById(PRIVACY_CONSENTS_ANCHOR)).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();

    mocks.profile.loading = false;
    rerender(
      <MemoryRouter initialEntries={[`/settings#${PRIVACY_CONSENTS_ANCHOR}`]}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });

    const section = document.getElementById(PRIVACY_CONSENTS_ANCHOR);
    expect(section).not.toBeNull();
    expect(section?.tagName).toBe('SECTION');
    expect(section?.className).toContain('scroll-mt-');
    expect(section?.classList.contains(HIGHLIGHT_CLASS)).toBe(true);
    expect(document.activeElement).toBe(section);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    // Not colour alone: the section names itself for assistive tech.
    expect(section?.getAttribute('aria-labelledby')).toBe('privacy-consents-heading');
    expect(document.getElementById('privacy-consents-heading')?.textContent).toMatch(/privacy/i);
  });

  it('jumps instantly when the user asked for reduced motion', async () => {
    mockMotionPreference(true);
    mocks.profile.loading = false;
    renderAt(`/settings#${PRIVACY_CONSENTS_ANCHOR}`);

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
    });
  });

  it('reacts to the hash changing while already on the page', async () => {
    mocks.profile.loading = false;
    renderAt('/settings');

    // Landed with no hash: the page is left exactly as it was.
    expect(scrollIntoView).not.toHaveBeenCalled();
    const section = document.getElementById(PRIVACY_CONSENTS_ANCHOR);
    expect(section).not.toBeNull();
    expect(section?.classList.contains(HIGHLIGHT_CLASS)).toBe(false);

    fireEvent.click(screen.getByRole('link', { name: 'jump to consents' }));

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
    expect(document.getElementById(PRIVACY_CONSENTS_ANCHOR)?.classList.contains(HIGHLIGHT_CLASS)).toBe(
      true,
    );
  });

  it('still resolves for an account that has no wellness profile yet', async () => {
    // The profileless state renders the page rather than an error, so the
    // consent controls this link exists to reach are still on it.
    mocks.profile.loading = false;
    mocks.profile.missing = true;
    renderAt(`/settings#${PRIVACY_CONSENTS_ANCHOR}`);

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
    const section = document.getElementById(PRIVACY_CONSENTS_ANCHOR);
    expect(section?.classList.contains(HIGHLIGHT_CLASS)).toBe(true);
    expect(document.activeElement).toBe(section);
    expect(screen.getByRole('switch', { name: 'AI personalisation' })).toBeDefined();
  });

  it('ignores a fragment that is not ours', async () => {
    mocks.profile.loading = false;
    renderAt('/settings#danger-zone');

    await Promise.resolve();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(
      document.getElementById(PRIVACY_CONSENTS_ANCHOR)?.classList.contains(HIGHLIGHT_CLASS),
    ).toBe(false);
  });
});
