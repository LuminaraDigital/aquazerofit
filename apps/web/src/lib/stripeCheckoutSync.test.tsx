// @vitest-environment jsdom
/**
 * The return from Stripe Checkout, through the real hook and inside
 * StrictMode, the way main.tsx renders it.
 *
 * The plan page test mocks this hook, which is how a first version shipped to
 * a browser stuck on "Confirming your payment…": it fired a mutation from an
 * effect, StrictMode's dev remount detached the mutation's observer, and the
 * server's answer never reached the page. Every case here goes through a real
 * QueryClient so that class of bug fails here rather than in a browser.
 */
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({
  api,
  ApiError: class extends Error {},
  tokenStore: { isAuthenticated: true },
}));
vi.mock('./AuthProvider', () => ({ toAuthResponseStub: vi.fn(), useFirebaseAuth: vi.fn() }));

import { useStripeCheckoutSync } from './queries';

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StrictMode>
  );
}

afterEach(() => {
  cleanup();
  api.mockReset();
});

describe('useStripeCheckoutSync', () => {
  it("reaches the server's answer under StrictMode, from a single request", async () => {
    api.mockResolvedValue({ tier: 'premium', premiumUntil: '2026-11-24T00:00:00.000Z' });

    const { result } = renderHook(() => useStripeCheckoutSync('cs_test_1'), { wrapper: harness() });

    await waitFor(() => expect(result.current.data?.tier).toBe('premium'));
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/billing/stripe/sync', {
      method: 'POST',
      body: { sessionId: 'cs_test_1' },
    });
  });

  it('surfaces a failure instead of hanging on the pending state', async () => {
    api.mockRejectedValue(new Error('PAYMENT_UNAVAILABLE'));

    const { result } = renderHook(() => useStripeCheckoutSync('cs_test_1'), { wrapper: harness() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('asks nothing when there is no session to settle', async () => {
    const { result } = renderHook(() => useStripeCheckoutSync(null), { wrapper: harness() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(api).not.toHaveBeenCalled();
  });
});
