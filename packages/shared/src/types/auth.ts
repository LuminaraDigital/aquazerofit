/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

import type { UserRole, UserTier } from './enums';

// ---------- auth DTOs ----------

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  tier: UserTier;
  emailVerified: boolean;
  hasProfile: boolean;
  telegramLinked: boolean;
  /**
   * Whether the account can sign in with email + password. False for
   * Telegram-provisioned accounts until they set credentials via
   * POST /me/credentials — the client uses this to offer that flow.
   */
  hasPassword: boolean;
  timezone?: string; // IANA name; optional, set via PATCH /me
  createdAt: string;
}
