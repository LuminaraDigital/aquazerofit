/**
 * Retention and friction telemetry on top of growth events.
 * Fire-and-forget; never blocks UX. First-value events are gated once per
 * browser so dashboards stay readable without a warehouse dedupe job.
 */
import type { GrowthEventName } from '@aquazerofit/shared';
import { trackGrowth } from './growth';

const ONCE_PREFIX = 'azf_retention_once_v1:';

function onceKey(name: GrowthEventName): string {
  return `${ONCE_PREFIX}${name}`;
}

function hasFired(name: GrowthEventName): boolean {
  try {
    return localStorage.getItem(onceKey(name)) === '1';
  } catch {
    return false;
  }
}

function markFired(name: GrowthEventName): void {
  try {
    localStorage.setItem(onceKey(name), '1');
  } catch {
    // private mode / quota - still attempt the network write
  }
}

/** Track an event at most once per browser for the given name. */
export function trackRetentionOnce(
  name: GrowthEventName,
  props: Record<string, string | number | boolean | null> = {},
): void {
  if (hasFired(name)) return;
  markFired(name);
  void trackGrowth(name, props);
}

/** Always-on friction signal (errors, abandons). Truncates free text. */
export function trackFriction(
  name: 'error_encountered' | 'page_abandoned',
  props: Record<string, string | number | boolean | null> = {},
): void {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'string') safe[k] = v.slice(0, 120);
    else safe[k] = v;
  }
  void trackGrowth(name, safe);
}

export function trackOnboardingCompleted(source: string): void {
  trackRetentionOnce('onboarding_completed', { source });
}

export function trackOnboardingSkipped(source: string): void {
  trackRetentionOnce('onboarding_skipped', { source });
}

export function trackFirstValueMeal(source: string): void {
  trackRetentionOnce('first_value_meal', { source });
}

export function trackFirstValueWorkout(source: string): void {
  trackRetentionOnce('first_value_workout', { source });
}
