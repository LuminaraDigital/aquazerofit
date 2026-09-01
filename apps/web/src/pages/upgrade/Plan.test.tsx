// @vitest-environment jsdom
/**
 * The plan page exists because the weekly-insight footnote had nowhere to send
 * a free-tier user. Two things about it are worth failing a build over.
 *
 * First, it must state the account's real position — the tier and the credit
 * balance — rather than a value proposition, so the numbers come from the API
 * fixture and are asserted as rendered.
 *
 * Second, and the reason this file is emphatic about it: there is no payment
 * provider in this product. So there must be no purchase control, and nothing
 * that changes `tier`. A button wired to nothing is worse than an honest
 * sentence, and a self-serve tier flip with no payment behind it would be a
 * vulnerability rather than a placeholder.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CREDIT_COSTS, FREE_TIER_DAILY_CREDITS, MAX_BANKED_CREDITS } from '@aquazerofit/shared';
import type { Entitlements } from '@/lib/queries';

const mocks = vi.hoisted(() => ({ useEntitlements: vi.fn() }));
vi.mock('@/lib/queries', () => ({ useEntitlements: mocks.useEntitlements }));

import Plan from './Plan';

const FREE: Entitlements = {
  tier: 'free',
  dailyCredits: FREE_TIER_DAILY_CREDITS,
  creditsRemaining: 12,
  costs: { ...CREDIT_COSTS },
  premiumLanes: ['insightBatch'],
};

const PREMIUM: Entitlements = { ...FREE, tier: 'premium', creditsRemaining: 47 };

interface QueryState {
  data?: Entitlements;
  isLoading?: boolean;
  isError?: boolean;
}

function renderWith(state: QueryState) {
  mocks.useEntitlements.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...state,
  });
  return render(
    <MemoryRouter initialEntries={['/plan']}>
      <Routes>
        <Route path="/plan" element={<Plan />} />
        <Route path="/progress" element={<p>progress</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('plan page — free tier', () => {
  it('leads with the account position: tier and the credits actually available', () => {
    renderWith({ data: FREE });

    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText(/AI credits available/i)).toBeTruthy();
    // The daily top-up is stated as its own number, not folded into "12 of 50".
    expect(
      screen.getByText(new RegExp(`tops your balance up by ${FREE_TIER_DAILY_CREDITS} credits`, 'i')),
    ).toBeTruthy();
  });

  /*
   * The ceiling is server-sent and optional, so the copy has two correct
   * forms and the wrong one is a lie either way round: promising unlimited
   * carry-over to a user whose balance stops at 100, or naming a ceiling to a
   * user on an older API that has none. Both branches are pinned.
   */
  it('names the carry-over ceiling when the API sends one', () => {
    renderWith({ data: { ...FREE, maxBankedCredits: MAX_BANKED_CREDITS } });

    expect(
      screen.getByText(new RegExp(`up to a maximum of ${MAX_BANKED_CREDITS}`, 'i')),
    ).toBeTruthy();
  });

  it('falls back to the unlimited carry-over wording when the API omits the ceiling', () => {
    renderWith({ data: FREE });

    expect(screen.getByText(/anything you do not spend carries over/i)).toBeTruthy();
  });

  it('describes premium from the lanes the API reports, and claims nothing more', () => {
    renderWith({ data: FREE });

    expect(screen.getByRole('heading', { name: /a coach-written weekly note/i })).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText(/that is the whole difference today/i)).toBeTruthy();
  });

  it('prices every AI action from the server cost map', () => {
    renderWith({ data: FREE });

    const chat = screen.getByText('Message to Aqua Coach').closest('div');
    expect(chat).not.toBeNull();
    expect(within(chat as HTMLElement).getByText(`${CREDIT_COSTS.chatTurn} credit`)).toBeTruthy();

    const photo = screen.getByText('Meal photo analysis').closest('div');
    expect(within(photo as HTMLElement).getByText(`${CREDIT_COSTS.mealPhoto} credits`)).toBeTruthy();
  });

  it('says the purchase step does not exist instead of faking one', () => {
    const { container } = renderWith({ data: FREE });

    expect(screen.getByRole('heading', { name: /upgrading is not available yet/i })).toBeTruthy();
    expect(screen.getByText(/payment is not built yet/i)).toBeTruthy();

    // No checkout affordance of any kind — not even a disabled one.
    for (const role of ['button', 'link'] as const) {
      expect(
        screen.queryByRole(role, { name: /upgrade|buy|subscribe|checkout|go premium|pay/i }),
      ).toBeNull();
    }
    // And nothing that could POST a tier change: the page owns no form.
    expect(container.querySelector('form')).toBeNull();
  });
});

describe('plan page — premium tier', () => {
  it('shows the position and what is switched on, not a sales page', () => {
    renderWith({ data: PREMIUM });

    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('47')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /what premium gives you/i })).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();

    expect(screen.queryByText(/upgrading is not available yet/i)).toBeNull();
    expect(screen.queryByText(/payment is not built yet/i)).toBeNull();
  });

  it('still prices credits, because credits are spent on premium too', () => {
    renderWith({ data: PREMIUM });

    expect(screen.getByRole('heading', { name: /what each AI action costs/i })).toBeTruthy();
    expect(screen.getByText('Weekly insight')).toBeTruthy();
  });
});

describe('plan page — non-content states', () => {
  it('shows skeletons while the entitlements request is in flight', () => {
    const { container } = renderWith({ isLoading: true });

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText(/upgrading is not available yet/i)).toBeNull();
  });

  it('offers a retry rather than an empty page when the request fails', () => {
    renderWith({ isError: true });

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });
});
