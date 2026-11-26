/**
 * localStorage keys that hold one account's unsent input or choices.
 *
 * They are not keyed by user, so without a sweep the next account on the same
 * browser got the last one's unsent coach message, half-finished setup (age,
 * sex, height, weight, goal) and notification choices. Every per-user key
 * belongs in this list; device-level ones (intro seen, attribution) do not.
 */
export const USER_DRAFT_KEYS = {
  setup: 'azf_setup_draft_v1',
  coachComposer: 'azf_coach_composer_v1',
  notificationPrefs: 'azf.notificationPrefs',
} as const;

/** Forget every per-user key. Called on logout and when a different account signs in. */
export function clearUserDrafts(): void {
  for (const key of Object.values(USER_DRAFT_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage unavailable: nothing to leak either
    }
  }
}
