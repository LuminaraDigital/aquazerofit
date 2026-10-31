/**
 * Telegram reports a Stars invoice as paid before the webhook has always
 * updated the ledger. A short refetch loop lets Premium show up on this
 * page without a reload. The hook never writes `tier` itself.
 */
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys, type Entitlements } from './queries';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function pollPremiumEntitlement(
  queryClient: QueryClient,
  options?: {
    attempts?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<boolean> {
  const attempts = options?.attempts ?? 6;
  const delayMs = options?.delayMs ?? 1500;
  const sleep = options?.sleep ?? wait;
  for (let i = 0; i < attempts; i += 1) {
    await queryClient.refetchQueries({ queryKey: queryKeys.entitlements });
    const data = queryClient.getQueryData<Entitlements | null>(queryKeys.entitlements);
    if (data?.tier === 'premium') return true;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return false;
}
