/**
 * Client reading of which paid rail is still running.
 *
 * `activeBillingSources` is the current API. When it is absent, a premium
 * account falls back to the latest rail, which is all an older API reports.
 */
export function hasActivePlaySubscription(
  entitlements:
    | {
        tier?: string;
        billingSource?: 'play' | 'stripe' | 'stars' | 'admin' | null;
        activeBillingSources?: Array<'play' | 'stripe' | 'stars' | 'admin'> | null;
      }
    | null
    | undefined,
): boolean {
  if (!entitlements) return false;
  if (entitlements.activeBillingSources) {
    return entitlements.activeBillingSources.includes('play');
  }
  return entitlements.tier === 'premium' && entitlements.billingSource === 'play';
}
