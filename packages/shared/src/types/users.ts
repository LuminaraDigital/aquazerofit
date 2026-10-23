/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

import type { UserRole, UserTier } from './enums';

// ---------- users container ----------

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  /**
   * PERMANENT tier. Only seeded and comped accounts carry `'premium'` here.
   *
   * A paid subscription does NOT write to this field — it sets `premiumUntil`
   * instead, and `effectiveTier()` folds the two. The distinction is the whole
   * point: a stored `'premium'` never expires, so a cancelled subscription
   * that had written here would leave the account premium forever, and the
   * only thing that could ever take it back would be a job nobody has written.
   * Read this field through `effectiveTier`, never directly.
   */
  tier: UserTier;
  /**
   * ISO instant at which a paid entitlement lapses. Absent for accounts that
   * have never paid.
   *
   * Time-bounded rather than a boolean because every rail this product could
   * use — Play Billing, Stripe, Telegram Stars — expresses a subscription as a
   * period with an end, and renewal is a NEW end date rather than a flag being
   * re-set. Expiry is then derived on read: there is no scheduled job to fail,
   * and an entitlement cannot outlive the payment behind it because the server
   * was asleep at the wrong moment.
   */
  premiumUntil?: string | null;
  role: UserRole;
  displayName: string;
  /**
   * Firebase Auth uid when the account was created or linked via the web
   * Firebase Auth path. Absent for legacy email/password and Telegram-only
   * accounts until they sign in with Firebase once.
   */
  firebaseUid?: string;
  tgId?: number; // unique when present (Telegram link)
  tgUsername?: string;
  timezone?: string; // IANA name (e.g. 'Australia/Sydney'); optional, set via PATCH /me
  createdAt: string;
  deletionRequestedAt?: string | null;
}

export interface ConsentState {
  wellnessDataProcessing: boolean;
  aiPersonalisation: boolean;
  anonymisedAnalytics: boolean;
  reminders: boolean;
  updatedAt: string;
}
