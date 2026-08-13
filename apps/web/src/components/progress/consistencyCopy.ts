/**
 * The single, auditable vocabulary for consistency.
 *
 * Every consistency string the product shows — Dashboard, Progress, Challenges
 * and the share card — resolves through this module. It lives in one file on
 * purpose: the copy is the safety-critical part of this surface (AQF-11 §6,
 * weight-neutral / non-shaming), and a reviewer must be able to read the whole
 * vocabulary at once rather than reconstruct it from three screens.
 *
 * Rules encoded here, not left to call sites:
 *  - The headline is always `activeDays of the last windowDays`. That number is
 *    monotonic in effort and can never be reset to zero by a missed day.
 *  - The current run is secondary, and is omitted rather than rendered as a 0.
 *  - There is no vocabulary for loss. No "broken", "lost", "missed", "failed".
 *  - Absorbed (grace) days read as reassurance, never as a warning.
 */
import {
  CONSISTENCY_GRACE_DAYS,
  type ConsistencyState,
  type ConsistencyStatus,
} from '@aquazerofit/shared';

export interface ConsistencyStateCopy {
  /** Short badge word. Describes the rhythm, never judges the person. */
  label: string;
  /** One supportive sentence shown beneath the headline. */
  body: string;
  /**
   * Material symbol. Deliberately never a flame (streak iconography), and
   * never a warning/alert glyph.
   */
  icon: string;
}

export const CONSISTENCY_STATE_COPY: Record<ConsistencyState, ConsistencyStateCopy> = {
  resting: {
    label: 'Resting',
    body: 'Rest is part of it. Whenever you log something next, it lands right here.',
    icon: 'spa',
  },
  recovering: {
    label: 'Back at it',
    body: 'Good to see you back — coming back is the hard part, and today already counts.',
    icon: 'waving_hand',
  },
  building: {
    label: 'Building',
    body: 'Days are adding up at your own pace.',
    icon: 'stairs',
  },
  steady: {
    label: 'Steady',
    body: 'A steady rhythm across the last few weeks.',
    icon: 'waves',
  },
};

/** Shown when grace has quietly absorbed a day away. Reassurance, never a warning. */
export const CONSISTENCY_GRACE_COPY = 'A day off is already covered — you’re still going.';

/** Headline shown before anything has been logged inside the window. */
export const CONSISTENCY_EMPTY_HEADLINE = 'Ready when you are';

/** True when the run has already used part of its grace allowance. */
export function hasAbsorbedDay(c: ConsistencyStatus): boolean {
  return c.currentDays > 0 && c.graceRemaining < CONSISTENCY_GRACE_DAYS;
}

/** The hero metric: "18 of the last 28 days". Never a streak, never resettable. */
export function consistencyHeadline(c: ConsistencyStatus): string {
  return `${c.activeDays} of the last ${c.windowDays} days`;
}

/** Compact form for tight surfaces (header pill, share card stat). */
export function consistencyShortHeadline(c: ConsistencyStatus): string {
  return `${c.activeDays}/${c.windowDays}`;
}

/** Secondary supporting text. Returns null at zero rather than rendering a 0. */
export function consistencyRunLabel(c: ConsistencyStatus): string | null {
  if (c.currentDays <= 0) return null;
  return `Current run ${c.currentDays} ${c.currentDays === 1 ? 'day' : 'days'}`;
}

/** High-water mark, so past effort stays visible when the current run is short. */
export function consistencyBestLabel(c: ConsistencyStatus): string | null {
  if (c.bestDays <= 0) return null;
  return `Best so far ${c.bestDays} ${c.bestDays === 1 ? 'day' : 'days'}`;
}

/** The supportive line: grace reassurance takes precedence over the state line. */
export function consistencyBody(c: ConsistencyStatus): string {
  return hasAbsorbedDay(c) ? CONSISTENCY_GRACE_COPY : CONSISTENCY_STATE_COPY[c.state].body;
}

/** Proportion of the window with activity, clamped to 0–1 for meters. */
export function consistencyFraction(c: ConsistencyStatus): number {
  if (c.windowDays <= 0) return 0;
  return Math.max(0, Math.min(1, c.activeDays / c.windowDays));
}

/**
 * One spoken sentence for assistive tech. Meaning is never left to colour or
 * to the meter alone.
 */
export function consistencyAriaLabel(c: ConsistencyStatus): string {
  const parts = [
    `${c.activeDays} active ${c.activeDays === 1 ? 'day' : 'days'} in the last ${c.windowDays} days`,
    CONSISTENCY_STATE_COPY[c.state].label,
  ];
  const run = consistencyRunLabel(c);
  if (run) parts.push(run);
  const best = consistencyBestLabel(c);
  if (best) parts.push(best);
  return `${parts.join('. ')}.`;
}
