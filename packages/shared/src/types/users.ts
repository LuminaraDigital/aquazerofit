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
  /**
   * True when this account holds an email/password credential in Firebase Auth
   * (registered with Firebase passwords on, set via /me/credentials, or
   * migrated from local bcrypt). Kept separate from `firebaseUid` so
   * Google/OAuth-only Firebase accounts continue to report `hasPassword: false`.
   */
  firebasePassword?: boolean;
  /**
   * True while a legacy bcrypt account that already had a linked Telegram
   * identity is waiting for its first verified Firebase sign-in after moving
   * its password to Firebase. Preserves that pre-existing `tgId` on proof.
   */
  migratedFromBcrypt?: boolean;
  /**
   * Firebase `tokensValidAfterTime` (ms) recorded when a Telegram-provisioned
   * account created its Firebase password via `POST /me/credentials`. If the
   * mailbox is later proved via `'password'` sign-in with no intervening
   * password reset (`tokensValidAfter <= telegramCredentialsValidAfter`), the
   * pre-existing `tgId` belongs to the mailbox owner and is preserved; if a
   * victim instead claims the email via OAuth or password reset, `tgId` is dropped.
   */
  telegramCredentialsValidAfter?: number;
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
  /**
   * Keep confirmed meal photographs to train food recognition. Separate from
   * aiPersonalisation because it outlives the feature the user asked for, and
   * never a condition of using it. Absent on documents that predate it.
   */
  foodPhotoTraining?: boolean;
  updatedAt: string;
}
