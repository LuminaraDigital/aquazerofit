/**
 * Fire-and-forget growth telemetry. Never blocks UX; failures are silent.
 */
import type { GrowthEventName } from '@aquazerofit/shared';
import { api } from './api';
import { getAttribution } from './attribution';

export async function trackGrowth(
  name: GrowthEventName,
  props: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const attr = getAttribution();
  try {
    await api('/analytics/events', {
      method: 'POST',
      body: {
        name,
        props,
        attribution: {
          ref: attr.ref,
          utmSource: attr.utmSource,
          utmMedium: attr.utmMedium,
          utmCampaign: attr.utmCampaign,
          challengeCode: attr.challengeCode,
        },
      },
    });
  } catch {
    // telemetry must never surface to the user
  }
}
