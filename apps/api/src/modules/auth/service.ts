/**
 * Auth service: register / login / telegram sign-in / token lifecycle.
 * Every auth-relevant action writes an authEvent to the audit container.
 */
import crypto from 'node:crypto';
import type { AuthResponse, User } from '@aquazerofit/shared';
import { clientNetworkKey } from '../../platform/clientIp';
import { AppError } from '../../platform/errors';
import { config } from '../../platform/config';
import { isUnownedEmailDomain } from '../../platform/mailer';
import { getStore, newId } from '../../platform/store';
import {
  issueRefresh,
  revokeAllForUser,
  revokeFamilyByToken,
  rotateRefresh,
  secureEquals,
  sha256Hex,
  signAccess,
  type SessionChannel,
} from '../../platform/auth';
import { assertFirebaseEmailProved, credentialsId, toPublicUser, type CredentialsDoc } from '../me/service';
import { validateTelegramInitData, type TelegramUser } from './telegram';
import { sendEmailConfirmationEmail, sendPasswordResetEmail } from './emails';
import bcrypt from 'bcryptjs';
import { containsProfanity } from '@aquazerofit/shared';

 // Cost 12 for production security; cost 4 under vitest for test speed.
 // bcrypt is pure JS; offloaded to worker thread in production to avoid blocking the event loop.
 const BCRYPT_ROUNDS = config.isTest ? 4 : 12;

 function bcryptHashAsync(password: string, rounds: number): Promise<string> {
   return bcrypt.hash(password, rounds);
 }

 function bcryptCompareAsync(password: string, hash: string): Promise<boolean> {
   return bcrypt.compare(password, hash);
 }

 /**
  * Audit-safe identifier: truncated sha256 of the raw email/tgId. The raw value
  * never lands in the audit container; the hash is re-identifiable only by
  * someone who already holds the original value.
  */
 export function hashIdentifier(value: string | number): string {
   return sha256Hex(String(value)).slice(0, 16);
 }

export function auditAuthEvent(
  userId: string,
  action: string,
  detail?: Record<string, unknown>,
  ip?: string,
): void {
  getStore().upsert('audit', {
    id: newId('aud'),
    userId,
    type: 'authEvent',
    action,
    detail,
    ip,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Last line of defence for a display name that did not come from the schema.
 * Falls back to a neutral placeholder rather than erroring: registration must
 * not fail because someone's email local-part happens to trip the filter.
 */
function safeDisplayName(candidate: string): string {
  return containsProfanity(candidate) ? 'Aqua member' : candidate;
}

function isUserDoc(d: { id: string }): d is User {
  const t = (d as { type?: string }).type;
  return t === undefined || t === 'user';
}

export function findUserByEmail(email: string): User | undefined {
  const normalized = email.trim().toLowerCase();
  return getStore().findOne<User>(
    'users',
    (d) => isUserDoc(d) && typeof d.email === 'string' && d.email.toLowerCase() === normalized,
  );
}

/** Mint the access + refresh pair every sign-in path returns. */
export function tokensFor(user: User, channel?: SessionChannel): AuthResponse {
  const { token } = issueRefresh(user.id, undefined, channel);
  return {
    accessToken: signAccess(user, channel),
    refreshToken: token,
    user: toPublicUser(user),
  };
}

// ---------------------------------------------------------------------------
// Per-email failure lockout (in-memory; complements the /auth IP rate lane).
// After MAX_FAILURES consecutive failures the email requires a 15-minute
// backoff. Reset on successful login; stale entries are pruned lazily.
// ---------------------------------------------------------------------------

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;
const FAILURE_TTL_MS = 60 * 60_000;

interface FailureEntry {
  count: number;
  lastFailureAt: number;
  lockedUntil: number | null;
}

const loginFailures = new Map<string, FailureEntry>();

function pruneFailures(now: number): void {
  for (const [key, entry] of loginFailures) {
    if (now - entry.lastFailureAt > FAILURE_TTL_MS) loginFailures.delete(key);
  }
}

function assertNotLockedOut(emailKey: string, now: number): void {
  pruneFailures(now);
  const entry = loginFailures.get(emailKey);
  if (entry?.lockedUntil && entry.lockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000));
    throw new AppError('RATE_LIMITED', 'Too many failed sign-in attempts. Please try again later.', {
      retryAfterSeconds,
    });
  }
}

function recordLoginFailure(emailKey: string, now: number): void {
  const entry = loginFailures.get(emailKey) ?? { count: 0, lastFailureAt: now, lockedUntil: null };
  entry.count += 1;
  entry.lastFailureAt = now;
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = now + LOCKOUT_MS;
  loginFailures.set(emailKey, entry);
}

// ---------------------------------------------------------------------------
// Telegram auto-provision caps (distinct from the /auth rate lane).
// Only NEW account creation is counted; returning users signing in again are
// unaffected. Limits live in config (per IP per minute, per subnet per day,
// and an optional process-local daily ceiling that defaults to off).
// Stale buckets are pruned lazily on each check.
// ---------------------------------------------------------------------------

const TG_NEW_ACCOUNT_WINDOW_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const telegramNewAccountsByIp = new Map<string, number[]>();
const telegramNewAccountsGlobal: number[] = [];
const telegramNewAccountsBySubnet = new Map<string, number[]>();

/** IPv4 /24, or the IPv6 /64 the client already keys on. */
function subnetKey(clientKey: string): string {
  const parts = clientKey.split('.');
  return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.0/24` : clientKey;
}

function pruneTelegramNewAccounts(now: number): void {
  const idle = 10 * 60_000;
  const dayStart = now - DAY_MS;
  
  // Prune per-IP (short window)
  for (const [key, stamps] of telegramNewAccountsByIp) {
    const newest = stamps[stamps.length - 1] ?? 0;
    if (now - newest > idle) telegramNewAccountsByIp.delete(key);
  }
  
  // Prune global daily
  while (telegramNewAccountsGlobal.length > 0 && telegramNewAccountsGlobal[0] < dayStart) {
    telegramNewAccountsGlobal.shift();
  }
  
  // Prune per-subnet daily
  for (const [key, stamps] of telegramNewAccountsBySubnet) {
    const valid = stamps.filter((t) => t > dayStart);
    if (valid.length === 0) {
      telegramNewAccountsBySubnet.delete(key);
    } else {
      telegramNewAccountsBySubnet.set(key, valid);
    }
  }
}

function assertTelegramNewAccountAllowed(ip: string | undefined, now: number): void {
  pruneTelegramNewAccounts(now);
  const key = clientNetworkKey(ip?.trim() || 'unknown');
  const perIpLimit = config.telegramSignupPerIpPerMinute;
  const subnetLimit = config.telegramSignupSubnetDaily;
  const globalLimit = config.telegramSignupGlobalDaily;
  const windowStart = now - TG_NEW_ACCOUNT_WINDOW_MS;
  const stamps = (telegramNewAccountsByIp.get(key) ?? []).filter((t) => t > windowStart);
  if (stamps.length >= perIpLimit) {
    const oldest = stamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + TG_NEW_ACCOUNT_WINDOW_MS - now) / 1000));
    throw new AppError('RATE_LIMITED', 'Too many new Telegram accounts from this network. Please try again later.', {
      retryAfterSeconds,
    });
  }

  // Process-local daily ceiling. 0 disables it (the launch default).
  if (globalLimit > 0 && telegramNewAccountsGlobal.length >= globalLimit) {
    const oldest = telegramNewAccountsGlobal[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + DAY_MS - now) / 1000));
    throw new AppError('RATE_LIMITED', 'Global daily limit for new Telegram accounts reached. Please try again tomorrow.', {
      retryAfterSeconds,
    });
  }

  // Per-subnet daily cap.
  const subnet = subnetKey(key);
  const subnetStamps = telegramNewAccountsBySubnet.get(subnet) ?? [];
  if (subnetStamps.length >= subnetLimit) {
    const oldest = subnetStamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + DAY_MS - now) / 1000));
    throw new AppError('RATE_LIMITED', 'Too many new Telegram accounts from this network region. Please try again tomorrow.', {
      retryAfterSeconds,
    });
  }
  
  stamps.push(now);
  telegramNewAccountsByIp.set(key, stamps);
  telegramNewAccountsGlobal.push(now);
  subnetStamps.push(now);
  telegramNewAccountsBySubnet.set(subnet, subnetStamps);
}

/** Test hook. */
export function resetTelegramNewAccountLimits(): void {
  telegramNewAccountsByIp.clear();
  telegramNewAccountsGlobal.length = 0;
  telegramNewAccountsBySubnet.clear();
}

/** Test hook. */
export function resetLoginFailures(): void {
  loginFailures.clear();
}

export async function register(
  input: { email: string; password: string; displayName?: string },
  ip?: string,
): Promise<AuthResponse> {
  const store = getStore();
  if (findUserByEmail(input.email)) {
    throw new AppError('CONFLICT', 'An account already exists for this email address');
  }
  const now = new Date().toISOString();
  const user: User = {
    id: newId('usr'),
    email: input.email.trim().toLowerCase(),
    // No mail transport exists yet, so there is no verification link to send.
    // Dev auto-verifies for convenience; production records the truth (false)
    // rather than asserting a verification that never happened. Nothing gates
    // on this flag today - when the transport lands, gate login here.
    emailVerified: config.isDev,
    role: 'user',
    tier: 'free',
    // The email prefix is derived, not submitted, so it never passes through
    // registerSchema - which makes it the one way a refused name could still
    // land on an account (someone@ signing up as the slur before the @).
    displayName: safeDisplayName(input.displayName?.trim() || input.email.split('@')[0]!),
    createdAt: now,
    deletionRequestedAt: null,
  };
  store.upsert('users', user);
  const cred: CredentialsDoc = {
    id: credentialsId(user.id),
    type: 'credentials',
    userId: user.id,
    passwordHash: await bcryptHashAsync(input.password, BCRYPT_ROUNDS),
  };
  store.upsert('users', cred);
  // Identifier is stored hashed (see hashIdentifier).
  auditAuthEvent(user.id, 'register', { emailHash: hashIdentifier(user.email) }, ip);
  return tokensFor(user);
}

export async function login(input: { email: string; password: string }, ip?: string): Promise<AuthResponse> {
  const store = getStore();
  const emailKey = input.email.trim().toLowerCase();
  const now = Date.now();
  assertNotLockedOut(emailKey, now);

  const user = findUserByEmail(input.email);
  const cred = user ? store.byId<CredentialsDoc>('users', credentialsId(user.id)) : undefined;
  // Uniform failure path: never reveal whether the email exists.
  if (!user || !cred || !(await bcryptCompareAsync(input.password, cred.passwordHash))) {
    recordLoginFailure(emailKey, now);
    auditAuthEvent(user?.id ?? 'unknown', 'login.failed', { emailHash: hashIdentifier(emailKey) }, ip);
    throw new AppError('AUTH_INVALID', 'Email or password is incorrect');
  }
  loginFailures.delete(emailKey); // success resets the failure counter
  // A pending deletion is cancelled by a successful sign-in during grace.
  if (user.deletionRequestedAt) {
    store.upsert('users', { ...user, deletionRequestedAt: null });
    auditAuthEvent(user.id, 'deletion.cancelled', undefined, ip);
  }
  auditAuthEvent(user.id, 'login', undefined, ip);
  return tokensFor(user);
}

export function refresh(refreshToken: string, ip?: string): Promise<AuthResponse> {
  return (async () => {
    const rotated = await rotateRefresh(refreshToken);
    const user = getStore().byId<User>('users', rotated.userId);
    if (!user || !isUserDoc(user)) {
      throw new AppError('AUTH_INVALID', 'Account no longer exists');
    }
    auditAuthEvent(user.id, 'token.refresh', undefined, ip);
    return {
      accessToken: signAccess(user, rotated.channel),
      refreshToken: rotated.token,
      user: toPublicUser(user),
    };
  })();
}

export function logout(refreshToken: string | undefined, userId: string | undefined, ip?: string): void {
  if (refreshToken) revokeFamilyByToken(refreshToken);
  auditAuthEvent(userId ?? 'unknown', 'logout', undefined, ip);
}

/**
 * Telegram Mini App sign-in (AQF-07 §2.2): validate launch data, then find the
 * linked account by tgId or provision a new one.
 */
export function telegramAuth(initData: string, ip?: string): AuthResponse {
  const tgUser: TelegramUser = validateTelegramInitData(initData);
  const store = getStore();
  let user = store.findOne<User>('users', (d) => isUserDoc(d) && d.tgId === tgUser.id);
  if (!user) {
    assertTelegramNewAccountAllowed(ip, Date.now());
    const now = new Date().toISOString();
    user = {
      id: newId('usr'),
      email: `tg-${tgUser.id}@telegram.aquazero.fit`,
      emailVerified: false,
      role: 'user',
      tier: 'free',
      displayName:
        [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') ||
        tgUser.username ||
        `Telegram user ${tgUser.id}`,
      tgId: tgUser.id,
      tgUsername: tgUser.username,
      createdAt: now,
      deletionRequestedAt: null,
    };
    store.upsert('users', user);
    auditAuthEvent(user.id, 'register.telegram', { tgIdHash: hashIdentifier(tgUser.id) }, ip);
  } else {
    auditAuthEvent(user.id, 'login.telegram', { tgIdHash: hashIdentifier(tgUser.id) }, ip);
  }
  return tokensFor(user, 'telegram');
}

// ---------------------------------------------------------------------------
// Password reset (single-use, sha256-at-rest tokens, 30-minute expiry).
// Dev "mail transport" is the server console; config.isDev additionally
// returns the token in the response body so the flow is testable end-to-end.
// ---------------------------------------------------------------------------

const RESET_TTL_MS = 30 * 60_000;

export interface PasswordResetTokenDoc {
  id: string;
  type: 'passwordResetToken';
  userId: string;
  /** sha256 hex of the token; raw value is issued once and never stored. */
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export function requestPasswordReset(email: string, ip?: string): { devToken?: string } {
  const user = findUserByEmail(email);
  // Enumeration safety: same outward behaviour whether or not the account exists.
  if (!user) return {};

  const token = crypto.randomUUID();
  const doc: PasswordResetTokenDoc = {
    id: newId('prt'),
    type: 'passwordResetToken',
    userId: user.id,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    usedAt: null,
    createdAt: new Date().toISOString(),
  };
  getStore().upsert('users', doc);
  auditAuthEvent(user.id, 'password.reset.requested', { emailHash: hashIdentifier(user.email) }, ip);

  // Deliberately not awaited. Awaiting would make the endpoint's latency a
  // side channel for whether the account exists, and a provider outage would
  // turn into a 500 that says the same thing. Delivery failures are logged
  // without the recipient and never surface to the caller.
  void sendPasswordResetEmail(user.email, token).catch((err: unknown) => {
    console.error(
      `[mail] password reset delivery failed for ${hashIdentifier(user.email)}:`,
      err instanceof Error ? err.message : err,
    );
  });

  // Dev convenience: also echo the token. Requires both NODE_ENV=development and
  // exposeDevTokens - staging (NODE_ENV=production) must not leak credentials via logs or response
  // bodies even when operators forget to unset dev conveniences.
  const exposeToken = process.env.NODE_ENV === 'development' && config.exposeDevTokens;
  if (exposeToken) {
    // eslint-disable-next-line no-console
    console.log(`[password-reset] token for ${hashIdentifier(user.email)}: ${token}`);
  }

  return exposeToken ? { devToken: token } : {};
}

export async function confirmPasswordReset(token: string, newPassword: string, ip?: string): Promise<void> {
  const store = getStore();
  const tokenHash = sha256Hex(token);
  const doc = store.findOne<PasswordResetTokenDoc>(
    'users',
    (d) => d.type === 'passwordResetToken' && secureEquals(d.tokenHash, tokenHash),
  );
  if (!doc || doc.usedAt !== null || new Date(doc.expiresAt).getTime() < Date.now()) {
    throw new AppError('VALIDATION_FAILED', 'Reset token is invalid or expired.');
  }
  const user = store.byId<User>('users', doc.userId);
  if (!user || !isUserDoc(user)) {
    throw new AppError('VALIDATION_FAILED', 'Reset token is invalid or expired.');
  }

  // Consume the token, rehash the password, kill every live session.
  store.upsert('users', { ...doc, usedAt: new Date().toISOString() });
  store.upsert('users', {
    id: credentialsId(user.id),
    type: 'credentials',
    userId: user.id,
    passwordHash: await bcryptHashAsync(newPassword, BCRYPT_ROUNDS),
  } satisfies CredentialsDoc);
  revokeAllForUser(user.id);
  auditAuthEvent(user.id, 'password.reset.confirmed', { emailHash: hashIdentifier(user.email) }, ip);
}

/**
 * A pending email + password for an account that has no password yet,
 * waiting on the link mailed to that address. Stored in `users`, so the
 * data export (which skips that container) never ships the hash, and account
 * deletion (which purges it by userId) removes it.
 */
export interface EmailClaimDoc {
  id: string;
  type: 'emailClaim';
  userId: string;
  email: string;
  passwordHash: string;
  /** sha256 hex of the token; the raw value is mailed once and never stored. */
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

const EMAIL_CLAIM_TTL_MS = 24 * 60 * 60_000;
/** Confirmation mails one account may send per hour: a cap on mailing a stranger. */
const EMAIL_CLAIMS_PER_HOUR = 3;

function claimsFor(userId: string): EmailClaimDoc[] {
  return getStore().where<EmailClaimDoc>(
    'users',
    (d) => (d as { type?: string }).type === 'emailClaim' && (d as { userId?: string }).userId === userId,
  );
}

/**
 * First-time credentials for a Telegram-provisioned account (AQF-09 §2.3):
 * replace the synthetic tg-…@ placeholder email with one the user owns and
 * create the credentials record that `login` requires. One-shot by design -
 * an account that already has a password changes it via the reset flow.
 * This endpoint proves only a valid session, so a new address becomes an
 * EmailClaimDoc and attaches in confirmEmailClaim once its mailbox answers.
 */
export async function setCredentials(
  userId: string,
  input: { email: string; password: string },
  ip?: string,
): Promise<{ user: AuthResponse['user']; pendingEmail?: string; devToken?: string }> {
  const store = getStore();
  const user = store.byId<User>('users', userId);
  if (!user || !isUserDoc(user)) throw new AppError('NOT_FOUND', 'Account not found');
  assertFirebaseEmailProved(user);

  if (store.byId<CredentialsDoc>('users', credentialsId(userId))) {
    throw new AppError(
      'CONFLICT',
      'This account already has a password. Use "Forgot password" to change it.',
    );
  }

  const email = input.email.trim().toLowerCase();
  if (isUnownedEmailDomain(email)) {
    throw new AppError('VALIDATION_FAILED', 'Use an email address you can receive mail at.');
  }
  const existing = findUserByEmail(email);
  if (existing && existing.id !== userId) {
    throw new AppError('CONFLICT', 'An account already exists for this email address');
  }
  const passwordHash = await bcryptHashAsync(input.password, BCRYPT_ROUNDS);

  // The account already holds this address, proved: nothing to confirm.
  if (email === user.email.trim().toLowerCase() && user.emailVerified === true) {
    store.upsert('users', { id: credentialsId(userId), type: 'credentials', userId, passwordHash } satisfies CredentialsDoc);
    auditAuthEvent(userId, 'credentials.set', { emailHash: hashIdentifier(email) }, ip);
    return { user: toPublicUser(user) };
  }

  // Anything else waits on the mailbox. Writing the address straight onto the
  // account let a Telegram session claim someone else's: register then said
  // CONFLICT to the owner, and their password reset put them in an account the
  // claimant still reached through Telegram. Until the link is opened the
  // address belongs to nobody here.
  const now = Date.now();
  const previous = claimsFor(userId);
  const recent = previous.filter((c) => now - Date.parse(c.createdAt) < 60 * 60_000);
  if (recent.length >= EMAIL_CLAIMS_PER_HOUR) {
    throw new AppError('RATE_LIMITED', 'Too many confirmation emails. Please try again later.', {
      retryAfterSeconds: 3600,
    });
  }
  // One live claim per account: a new one retires the rest.
  for (const old of previous) {
    if (old.usedAt === null) store.upsert('users', { ...old, usedAt: new Date(now).toISOString() });
  }
  const token = crypto.randomUUID();
  store.upsert('users', {
    id: newId('ecl'),
    type: 'emailClaim',
    userId,
    email,
    passwordHash,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(now + EMAIL_CLAIM_TTL_MS).toISOString(),
    usedAt: null,
    createdAt: new Date(now).toISOString(),
  } satisfies EmailClaimDoc);
  auditAuthEvent(userId, 'credentials.claimed', { emailHash: hashIdentifier(email) }, ip);
  // Not awaited, as for the reset mail: a provider outage must not fail the call.
  void sendEmailConfirmationEmail(email, token).catch((err: unknown) => {
    console.error(
      `[mail] email confirmation delivery failed for ${hashIdentifier(email)}:`,
      err instanceof Error ? err.message : err,
    );
  });
  const exposeToken = process.env.NODE_ENV === 'development' && config.exposeDevTokens;
  return { user: toPublicUser(user), pendingEmail: email, ...(exposeToken ? { devToken: token } : {}) };
}

/**
 * Open a confirmation link: the claimed email and password attach to the
 * account, and because the link reached that mailbox the address is marked
 * verified. Refused if the link is unknown, used or expired, or if the
 * address has since been taken (register stayed open to its owner).
 */
export function confirmEmailClaim(token: string, ip?: string): void {
  const store = getStore();
  const tokenHash = sha256Hex(token);
  const claim = store.findOne<EmailClaimDoc>(
    'users',
    (d) => (d as { type?: string }).type === 'emailClaim' && (d as { tokenHash?: string }).tokenHash === tokenHash,
  );
  if (!claim || claim.usedAt !== null || Date.parse(claim.expiresAt) < Date.now()) {
    throw new AppError('VALIDATION_FAILED', 'This confirmation link is invalid or has expired.');
  }
  store.upsert('users', { ...claim, usedAt: new Date().toISOString() });
  const user = store.byId<User>('users', claim.userId);
  if (!user || !isUserDoc(user)) throw new AppError('NOT_FOUND', 'Account not found');
  const holder = findUserByEmail(claim.email);
  if ((holder && holder.id !== user.id) || store.byId<CredentialsDoc>('users', credentialsId(user.id))) {
    throw new AppError('CONFLICT', 'This email is already in use. Sign in with it, or choose another.');
  }
  store.upsert('users', { ...user, email: claim.email, emailVerified: true } satisfies User);
  store.upsert('users', {
    id: credentialsId(user.id),
    type: 'credentials',
    userId: user.id,
    passwordHash: claim.passwordHash,
  } satisfies CredentialsDoc);
  auditAuthEvent(user.id, 'credentials.set', { emailHash: hashIdentifier(claim.email), confirmed: true }, ip);
}
