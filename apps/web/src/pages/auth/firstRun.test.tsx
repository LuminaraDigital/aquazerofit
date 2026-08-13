// @vitest-environment jsdom
/**
 * REGRESSION GUARD — first-run friction and target honesty.
 *
 * Two failure modes are guarded here, and they pull against each other.
 *
 * 1. The app used to hold a brand-new account behind a four-step wellness form:
 *    nothing at all was reachable until it was finished. That is the first
 *    session people do not come back from, so an account with no profile must
 *    now land inside the product.
 *
 * 2. The obvious way to make that happen — a stand-in calorie target so the
 *    dashboard renders — would be worse than the friction it removes. Targets
 *    are derived from real measurements and clamped to a safety floor; a
 *    typical-looking number captioned "your target" is a health claim about
 *    somebody the system has never measured. Surfaces that exist to compare
 *    logs against a target must say they are not set up instead.
 *
 * The third case is the one that has to stay boring: an account that already
 * has a profile should not be able to tell any of this happened.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WellnessProfile } from '@aquazerofit/shared';

const COMPLETE_PROFILE: WellnessProfile = {
  userId: 'u1',
  weightKg: 78,
  heightCm: 180,
  age: 34,
  sex: 'male',
  goal: 'lose',
  activityLevel: 'moderate',
  exerciseExperience: 'intermediate',
  dietaryPreferences: [],
  allergies: ['peanuts'],
  equipment: ['dumbbells'],
  unitPreference: 'metric',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const mocks = vi.hoisted(() => ({
  profile: { current: null as WellnessProfile | null },
}));

vi.mock('../../lib/api', () => ({
  tokenStore: { isAuthenticated: true },
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    code = 'UNKNOWN';
    status = 500;
  },
}));

vi.mock('../../lib/telegram', () => ({
  isTMA: () => false,
  getTelegramInitData: () => undefined,
  haptic: vi.fn(),
}));

vi.mock('../../lib/queries', () => ({
  useProfile: () => ({
    data: mocks.profile.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useMe: () => ({ data: { displayName: 'Sam Rivers' } }),
  useTargets: () => ({ data: null, isLoading: true }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateConsents: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAuthActions: () => ({ login: vi.fn(), register: vi.fn(), telegramLogin: vi.fn() }),
}));

// Real pages are replaced by markers: this suite is about which surface the
// router chooses, not about what those surfaces render.
vi.mock('../dashboard/Dashboard', () => ({ default: () => <div>dashboard surface</div> }));
vi.mock('../nutrition/Nutrition', () => ({ default: () => <div>nutrition surface</div> }));
vi.mock('../progress/Progress', () => ({ default: () => <div>progress surface</div> }));
vi.mock('../../components/layout/AppLayout', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    AppLayout: () => (
      <div>
        <Outlet />
        <nav aria-label="Primary">bottom nav</nav>
      </div>
    ),
  };
});

const { default: App } = await import('../../App');
// /setup is the one lazy route this suite renders for real (the essentials
// form is the thing under test). Pre-warm its module: under full-suite
// parallel load a cold transform of Setup's dependency graph can exceed
// findBy*'s 1s timeout, leaving the Suspense spinner on screen — a flake,
// not a regression.
await import('./Setup');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  mocks.profile.current = null;
  cleanup();
});

describe('an account with no wellness profile', () => {
  it('lands in the app at / rather than in a form', async () => {
    renderAt('/');

    expect(await screen.findByRole('heading', { name: /hey, sam/i })).toBeDefined();
    // Things that work with no measurements at all.
    expect(screen.getByRole('link', { name: /browse workouts/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /ask the coach/i })).toBeDefined();
    // The essentials form is offered, never imposed.
    expect(screen.queryByLabelText(/^age$/i)).toBeNull();
  });

  it('offers the essentials as a link instead of a redirect', async () => {
    renderAt('/');

    const cta = await screen.findByRole('link', { name: /set up my targets/i });
    expect(cta.getAttribute('href')).toBe('/setup');
  });

  it('still lands in the app on the legacy /onboarding path Telegram auto-login uses', async () => {
    renderAt('/onboarding');

    expect(await screen.findByRole('heading', { name: /hey, sam/i })).toBeDefined();
    expect(screen.queryByLabelText(/^age$/i)).toBeNull();
  });

  it('shows the honest not-set-up state on nutrition, never an invented target', async () => {
    renderAt('/nutrition');

    expect(await screen.findByRole('heading', { name: /daily targets/i })).toBeDefined();
    expect(screen.getByText(/not set up yet/i)).toBeDefined();
    // The surface that would have shown numbers is not rendered at all, and no
    // digits are printed anywhere in its place.
    expect(screen.queryByText('nutrition surface')).toBeNull();
    expect(screen.queryByText(/\d/)).toBeNull();
  });

  it('keeps the bottom nav on a gated surface so it is not a dead end', async () => {
    renderAt('/progress');

    expect(await screen.findByText(/not set up yet/i)).toBeDefined();
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeDefined();
    expect(screen.queryByText('progress surface')).toBeNull();
  });

  it('sends the user back where they came from after setting the essentials up', async () => {
    renderAt('/progress');

    const cta = await screen.findByRole('link', { name: /set up my targets/i });
    expect(cta.getAttribute('href')).toBe(`/setup?next=${encodeURIComponent('/progress')}`);
  });

  it('asks for exactly the six inputs the calculator reads at /setup', async () => {
    renderAt('/setup');

    expect(await screen.findByLabelText(/^age$/i)).toBeDefined();
    expect(screen.getByLabelText(/height \(cm\)/i)).toBeDefined();
    expect(screen.getByLabelText(/weight \(kg\)/i)).toBeDefined();
    expect(screen.getByRole('radiogroup', { name: /sex/i })).toBeDefined();
    expect(screen.getByRole('radiogroup', { name: /^goal$/i })).toBeDefined();
    expect(screen.getByRole('radiogroup', { name: /typical activity/i })).toBeDefined();
    // Deferred to Settings — asking for them here is what made the old flow long.
    expect(screen.queryByText(/equipment at home/i)).toBeNull();
    expect(screen.queryByText(/dietary preferences/i)).toBeNull();
    // Consent is still explicit and still opt-in.
    expect(
      (screen.getByLabelText(/wellness data processing/i) as HTMLInputElement).checked,
    ).toBe(false);
  });
});

describe('an account that already has a wellness profile', () => {
  it('gets the dashboard at / exactly as before', async () => {
    mocks.profile.current = COMPLETE_PROFILE;
    renderAt('/');

    expect(await screen.findByText('dashboard surface')).toBeDefined();
    expect(screen.queryByText(/not set up yet/i)).toBeNull();
  });

  it('reaches the target-dependent surfaces untouched', async () => {
    mocks.profile.current = COMPLETE_PROFILE;
    renderAt('/nutrition');

    expect(await screen.findByText('nutrition surface')).toBeDefined();
    expect(screen.queryByText(/set up my targets/i)).toBeNull();
  });
});
