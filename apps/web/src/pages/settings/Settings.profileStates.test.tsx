// @vitest-environment jsdom
/**
 * REGRESSION GUARD — Settings used to early-return an error page whenever the
 * profile was falsy. Since the onboarding gate was removed, "signed in with no
 * wellness profile" is a supported state, so that early return turned a normal
 * account into an error screen — and because it returned before the rest of
 * the page, it also took sign-out, the consent switches, data export and
 * account deletion with it.
 *
 * Those four are not UX niceties: they are how a user leaves the product and
 * exercises their data rights, and none of them depend on knowing the user's
 * height. This file pins that they render in all three states — profile
 * loaded, profile legitimately absent, and request failed — and that only the
 * last one is presented as a failure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  profile: {
    /** 'loaded' | 'absent' | 'failed' */
    state: 'loaded' as 'loaded' | 'absent' | 'failed',
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
vi.mock('../../lib/telegram', () => ({ haptic: vi.fn(), isTMA: () => false }));
vi.mock('../../lib/queries', () => ({
  useProfile: () => ({
    data: mocks.profile.state === 'loaded' ? mocks.profile.data : null,
    isLoading: false,
    isError: mocks.profile.state === 'failed',
    refetch: mocks.refetch,
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

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The controls a user must never lose, whatever their profile state. */
function expectAccountControlsPresent(): void {
  expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined();
  expect(screen.getByRole('switch', { name: 'AI personalisation' })).toBeDefined();
  expect(screen.getByRole('switch', { name: 'Wellness data processing' })).toBeDefined();
  expect(screen.getByRole('button', { name: /export my data/i })).toBeDefined();
  expect(screen.getByRole('button', { name: /delete my account/i })).toBeDefined();
  // And the consent deep link still has somewhere to land.
  expect(document.getElementById(PRIVACY_CONSENTS_ANCHOR)).not.toBeNull();
}

beforeEach(() => {
  mocks.profile.state = 'loaded';
  Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView'];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('profile loaded', () => {
  it('renders the profile summary alongside the account controls', () => {
    renderSettings();

    expect(screen.getByRole('button', { name: /edit biometric data/i })).toBeDefined();
    expect(screen.getByText('Dietary preferences')).toBeDefined();
    expect(screen.getByText('Allergies')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expectAccountControlsPresent();
  });
});

describe('no wellness profile yet', () => {
  beforeEach(() => {
    mocks.profile.state = 'absent';
  });

  it('invites the user to set targets up instead of claiming a failure', () => {
    renderSettings();

    const setUp = screen.getByRole('link', { name: /set up my targets/i });
    expect(setUp.getAttribute('href')).toBe('/setup?next=%2Fsettings');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/could not load/i)).toBeNull();
  });

  it('keeps sign-out, consents, export and deletion reachable', () => {
    renderSettings();
    expectAccountControlsPresent();
  });

  it('hides the profile-backed preferences rather than offering writes that cannot land', () => {
    renderSettings();

    expect(screen.queryByText('Dietary preferences')).toBeNull();
    expect(screen.queryByText('Allergies')).toBeNull();
    expect(screen.getByRole('link', { name: /set it up/i }).getAttribute('href')).toBe(
      '/setup?next=%2Fsettings',
    );
    // Notifications do not depend on the profile, so they stay.
    expect(screen.getByText('Notifications & reminders')).toBeDefined();
  });
});

describe('the profile request failed', () => {
  beforeEach(() => {
    mocks.profile.state = 'failed';
  });

  it('scopes the error to the profile section and offers a retry', () => {
    renderSettings();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/could not load your wellness profile/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
    // A genuine failure is not dressed up as a setup invitation.
    expect(screen.queryByRole('link', { name: /set up my targets/i })).toBeNull();
  });

  it('keeps sign-out, consents, export and deletion reachable', () => {
    renderSettings();
    expectAccountControlsPresent();
  });
});
