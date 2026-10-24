// @vitest-environment jsdom
/**
 * The plan page exists because the weekly-insight footnote had nowhere to send
 * a free-tier user. Two things about it are worth failing a build over.
 *
 * First, it must state the account's real position  -  the tier and the credit
 * balance  -  rather than a value proposition, so the numbers come from the API
 * fixture and are asserted as rendered.
 *
 * Second, and the reason this file is emphatic about it: a purchase control
 * appears only when the deployment can actually take a payment, with Stripe's
 * price on it. Otherwise there is no purchase control at all, and nothing here
 * ever changes `tier`. A button wired to nothing is worse than an honest
 * sentence, and a self-serve tier flip with no payment behind it would be a
 * vulnerability rather than a placeholder.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CREDIT_COSTS, FREE_TIER_DAILY_CREDITS, MAX_BANKED_CREDITS } from '@aquazerofit/shared';
import type { BillingConfig, Entitlements } from '@/lib/queries';

const mocks = vi.hoisted(() => ({
  useEntitlements: vi.fn(),
  useBillingConfig: vi.fn(),
  startCheckout: vi.fn(),
  startStars: vi.fn(() => Promise.resolve({ invoiceLink: 'https://t.me/invoice/test', stars: 417 })),
  // The sync hook's state for the session in the URL; idle unless a case says otherwise.
  syncCheckout: vi.fn(
    (_sessionId: string | null): { isError: boolean; isSuccess: boolean; data?: { tier: string } } => ({
      isError: false,
      isSuccess: false,
    }),
  ),
  isTMA: vi.fn(() => false),
  canPayWithStars: vi.fn(() => false),
  openStarsInvoice: vi.fn(
    (): Promise<'paid' | 'cancelled' | 'failed' | 'pending'> => Promise.resolve('cancelled'),
  ),
}));
vi.mock('@/lib/queries', () => ({
  queryKeys: { entitlements: ['entitlements'] },
  useEntitlements: mocks.useEntitlements,
  useBillingConfig: mocks.useBillingConfig,
  useStartStripeCheckout: () => ({ mutate: mocks.startCheckout, isPending: false, isError: false }),
  useStripeCheckoutSync: mocks.syncCheckout,
  useStartStarsSubscription: () => ({
    mutateAsync: mocks.startStars,
    isPending: false,
    isError: false,
  }),
}));
vi.mock('@/lib/telegram', () => ({
  isTMA: mocks.isTMA,
  canPayWithStars: mocks.canPayWithStars,
  openStarsInvoice: mocks.openStarsInvoice,
}));

import Plan from './Plan';

const FREE: Entitlements = {
  tier: 'free',
  dailyCredits: FREE_TIER_DAILY_CREDITS,
  creditsRemaining: 12,
  costs: { ...CREDIT_COSTS },
  premiumLanes: ['insightBatch'],
};

const PREMIUM: Entitlements = { ...FREE, tier: 'premium', creditsRemaining: 47 };

const NO_STRIPE: BillingConfig = { stripe: { available: false, price: null } };
const STRIPE: BillingConfig = {
  stripe: { available: true, price: { amount: 999, currency: 'aud', interval: 'month' } },
};

interface QueryState {
  data?: Entitlements;
  isLoading?: boolean;
  isError?: boolean;
}

function renderWith(state: QueryState, billing: BillingConfig = NO_STRIPE, url = '/plan') {
  mocks.useEntitlements.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...state,
  });
  mocks.useBillingConfig.mockReturnValue({ data: billing, isLoading: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/plan" element={<Plan />} />
          <Route path="/progress" element={<p>progress</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.isTMA.mockReturnValue(false);
  mocks.canPayWithStars.mockReturnValue(false);
  mocks.openStarsInvoice.mockResolvedValue('cancelled');
  mocks.syncCheckout.mockReset();
  mocks.syncCheckout.mockImplementation(() => ({ isError: false, isSuccess: false }));
});

describe('plan page  -  free tier', () => {
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

  it('says the purchase step is not available instead of faking one when payment is not configured', () => {
    const { container } = renderWith({ data: FREE });

    expect(screen.getByRole('heading', { name: /upgrading is not available here yet/i })).toBeTruthy();
    expect(screen.getByText(/you cannot buy premium from this screen yet/i)).toBeTruthy();

    // No checkout affordance of any kind  -  not even a disabled one.
    for (const role of ['button', 'link'] as const) {
      expect(
        screen.queryByRole(role, { name: /upgrade|buy|subscribe|checkout|go premium|pay/i }),
      ).toBeNull();
    }
    // And nothing that could POST a tier change: the page owns no form.
    expect(container.querySelector('form')).toBeNull();
  });
});

describe('plan page  -  premium tier', () => {
  it('shows the position and what is switched on, not a sales page', () => {
    renderWith({ data: PREMIUM });

    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('47')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /what premium gives you/i })).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();

    expect(screen.queryByText(/upgrading is not available/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull();
  });

  it('is never offered a second subscription, even where checkout is available', () => {
    renderWith({ data: PREMIUM }, STRIPE);

    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull();
  });

  it('does not offer Stars to an account that is already premium', () => {
    mocks.isTMA.mockReturnValue(true);
    mocks.canPayWithStars.mockReturnValue(true);
    renderWith(
      { data: PREMIUM },
      { stars: { available: true, price: 417, periodSeconds: 2_592_000 } },
    );

    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull();
  });

  it('still prices credits, because credits are spent on premium too', () => {
    renderWith({ data: PREMIUM });

    expect(screen.getByRole('heading', { name: /what each AI action costs/i })).toBeTruthy();
    expect(screen.getByText('Weekly insight')).toBeTruthy();
  });
});

describe('plan page  -  non-content states', () => {
  it('shows skeletons while the entitlements request is in flight', () => {
    const { container } = renderWith({ isLoading: true });

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText(/upgrading is not available/i)).toBeNull();
  });

  it('offers a retry rather than an empty page when the request fails', () => {
    renderWith({ isError: true });

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });
});

describe('plan page  -  Stripe checkout', () => {
  it("offers Subscribe with Stripe's price on the button, and opens checkout when pressed", () => {
    renderWith({ data: FREE }, STRIPE);

    const subscribe = screen.getByRole('button', { name: /subscribe for .*9\.99 \/ month/i });
    expect(screen.queryByText(/upgrading is not available/i)).toBeNull();

    fireEvent.click(subscribe);
    expect(mocks.startCheckout).toHaveBeenCalledTimes(1);
  });

  it('keeps Stripe out of the Telegram Mini App, where Telegram requires Stars', () => {
    mocks.isTMA.mockReturnValueOnce(true);
    renderWith({ data: FREE }, STRIPE);

    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull();
    expect(screen.getByRole('heading', { name: /upgrading is not available here yet/i })).toBeTruthy();
  });

  it('settles the session Stripe sends the buyer back with', () => {
    renderWith({ data: FREE }, STRIPE, '/plan?checkout=success&session_id=cs_test_abc');

    expect(mocks.syncCheckout).toHaveBeenCalledWith('cs_test_abc');
    expect(screen.getByRole('status').textContent).toMatch(/confirming your payment/i);
  });

  it('says premium is on once the server has confirmed the payment', () => {
    mocks.syncCheckout.mockReturnValue({ isError: false, isSuccess: true, data: { tier: 'premium' } });
    renderWith({ data: FREE }, STRIPE, '/plan?checkout=success&session_id=cs_test_abc');

    expect(screen.getByRole('status').textContent).toMatch(/payment received. premium is on/i);
  });

  it('says so plainly when the payment could not be confirmed, rather than spinning', () => {
    mocks.syncCheckout.mockReturnValue({ isError: true, isSuccess: false });
    renderWith({ data: FREE }, STRIPE, '/plan?checkout=success&session_id=cs_test_abc');

    expect(screen.getByRole('status').textContent).toMatch(/could not confirm this checkout yet/i);
  });

  it('opens a Stars invoice in the Mini App at the price the API sent', async () => {
    mocks.isTMA.mockReturnValue(true);
    mocks.canPayWithStars.mockReturnValue(true);
    mocks.openStarsInvoice.mockResolvedValue('paid');
    const stars: BillingConfig = {
      stripe: { available: true, price: { amount: 999, currency: 'aud', interval: 'month' } },
      stars: { available: true, price: 417, periodSeconds: 2_592_000 },
    };
    renderWith({ data: FREE }, stars);

    expect(screen.queryByRole('button', { name: /9\.99/i })).toBeNull();
    expect(screen.getAllByText(/30 days/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /subscribe for 417 stars/i }));

    expect(await screen.findByText(/payment received/i)).toBeTruthy();
    expect(mocks.startStars).toHaveBeenCalledTimes(1);
    expect(mocks.openStarsInvoice).toHaveBeenCalledWith('https://t.me/invoice/test');
  });

  it('keeps the not-available card when Stars has no price, even inside Telegram', () => {
    mocks.isTMA.mockReturnValue(true);
    mocks.canPayWithStars.mockReturnValue(true);
    renderWith({ data: FREE }, { stars: { available: false, price: null, periodSeconds: null } });

    expect(screen.getByRole('heading', { name: /upgrading is not available here yet/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull();
  });

  it('says nothing was charged when the buyer backs out of checkout', () => {
    renderWith({ data: FREE }, STRIPE, '/plan?checkout=cancelled');

    expect(screen.getByRole('status').textContent).toMatch(/nothing was charged/i);
    expect(mocks.syncCheckout.mock.calls.every(([sessionId]) => sessionId === null)).toBe(true);
  });
});
