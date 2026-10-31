// @vitest-environment jsdom
/**
 * After Stars reports paid, the entitlements read can still say free until
 * Telegram's webhook lands. The page has to keep asking briefly.
 */
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Entitlements } from './queries';
import { queryKeys } from './queries';
import { pollPremiumEntitlement } from './pollEntitlements';

function clientWith(queryFn: () => Promise<Pick<Entitlements, 'tier'>>): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryDefaults(queryKeys.entitlements, { queryFn });
  return client;
}

describe('pollPremiumEntitlement', () => {
  it('stops once a refetch shows premium', async () => {
    let reads = 0;
    const client = clientWith(async () => {
      reads += 1;
      // The prefetch is read 1. The first poll refetch is still free; the next one is premium.
      return { tier: reads >= 3 ? 'premium' : 'free' };
    });
    await client.fetchQuery({ queryKey: queryKeys.entitlements });

    const sleep = vi.fn(async () => {});
    const premium = await pollPremiumEntitlement(client, { attempts: 4, delayMs: 10, sleep });

    expect(premium).toBe(true);
    expect(client.getQueryData<Entitlements>(queryKeys.entitlements)?.tier).toBe('premium');
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt budget while the account is still free', async () => {
    const client = clientWith(async () => ({ tier: 'free' }));
    await client.fetchQuery({ queryKey: queryKeys.entitlements });
    const sleep = vi.fn(async () => {});

    const premium = await pollPremiumEntitlement(client, { attempts: 3, delayMs: 10, sleep });

    expect(premium).toBe(false);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
