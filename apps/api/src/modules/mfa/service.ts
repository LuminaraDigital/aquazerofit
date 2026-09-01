/**
 * TOTP multi-factor enrolment, verification and admin step-up.
 *
 * SECRET AT REST — read this before deploying.
 * A TOTP secret must be recoverable to verify a code, so unlike a password it
 * cannot be hashed. It is stored HERE AS PLAINTEXT BASE32 in the `users`
 * container of the document store, i.e. in `users.json` under AZF_DATA_DIR
 * locally and in the `documents` table in Postgres in production. What protects
 * it is exactly what protects the rest of that store and nothing more:
 * filesystem permissions locally, and the database's own authentication,
 * network isolation and at-rest encryption in production. There is NO
 * application-level encryption of the secret, no KMS, no envelope key. Anyone
 * with a copy of the database can mint valid codes for every enrolled account.
 * That is a deliberate, stated limitation of this change rather than an
 * oversight: adding an encryption key would need a key-management story
 * (provisioning, rotation, recovery when it is lost) that this deployment does
 * not have, and a hard-coded or env-only key sitting next to the database
 * credentials would be protection on paper only. If that changes, the single
 * place to encrypt is loadCredential/saveCredential below.
 *
 * Recovery codes, by contrast, ARE hashed (sha256, via the existing sha256Hex)
 * and only ever shown once, because they only need to be compared.
 */
import crypto from 'node:crypto';
import type { Request } from 'express';
import type { User } from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { AppError } from '../../platform/errors';
import { secureEquals, sha256Hex } from '../../platform/auth';
import { getStore } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { auditDataAccess } from '../me/service';
import {
  TOTP_DIGITS,
  TOTP_STEP_SECONDS,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from './totp';

export const MFA_ISSUER = 'AquaZeroFit';
const RECOVERY_CODE_COUNT = 10;
/** 10 random bytes -> 16 base32 characters ≈ 80 bits. */
const RECOVERY_CODE_BYTES = 10;

/**
 * Failed-code lockout. A six-digit code is 10^6 wide and the ±1 skew window
 * makes three of them live at any instant, so unthrottled guessing succeeds in
 * hours. Five consecutive failures buys a 15-minute freeze, matching the
 * per-email login lockout in modules/auth/service so operators have one number
 * to remember.
 *
 * In memory, like that login lockout, and for the same reason: this API is
 * single-instance by construction (config.assertSingleInstance) and a restart
 * clearing the counter costs an attacker a five-guess head start, not the lane.
 */
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;
const FAILURE_TTL_MS = 60 * 60_000;

interface RecoveryCodeRecord {
  /** sha256 hex of the normalised code. The code itself is never stored. */
  hash: string;
  usedAt: string | null;
}

export interface MfaCredential {
  id: string;
  type: 'mfaCredential';
  userId: string;
  /** Base32 secret in force. Null until the first confirmation. PLAINTEXT — see file header. */
  activeSecret: string | null;
  /** Base32 secret issued but not yet proven. Never accepted for a step-up. */
  pendingSecret: string | null;
  pendingCreatedAt: string | null;
  confirmedAt: string | null;
  /**
   * Highest TOTP step already accepted for this account. Replay protection:
   * a code is refused when its step is <= this, which kills both the exact
   * resubmission of a code inside its own 30s window and the resubmission of
   * an older code that the skew window would otherwise still accept.
   */
  lastAcceptedStep: number | null;
  recoveryCodes: RecoveryCodeRecord[];
  createdAt: string;
  updatedAt: string;
}

interface MfaStepUp {
  id: string;
  type: 'mfaStepUp';
  userId: string;
  verifiedAt: string;
  expiresAt: string;
}

interface FailureEntry {
  count: number;
  lastFailureAt: number;
  lockedUntil: number | null;
}

const failures = new Map<string, FailureEntry>();

// ----- document helpers -----

function credentialId(userId: string): string {
  return `mfa-cred-${userId}`;
}

/**
 * Step-up documents are keyed by the sha256 of the ACCESS TOKEN that earned
 * them, not by the user id.
 *
 * Binding the grant to one token is what stops a step-up performed in a
 * legitimate browser from also opening the admin router for a token an attacker
 * minted from a stolen refresh token: that second token hashes to a different
 * id and finds no grant. It also means the grant can never outlive the token,
 * which is a second, independent bound on the window. The raw token is never
 * stored, exactly as with refresh tokens.
 */
function stepUpId(accessToken: string): string {
  return `mfa-stepup-${sha256Hex(accessToken)}`;
}

function loadCredential(userId: string): MfaCredential | undefined {
  const doc = getStore().byId<MfaCredential>('users', credentialId(userId));
  return doc && doc.type === 'mfaCredential' ? doc : undefined;
}

function saveCredential(credential: MfaCredential): MfaCredential {
  const updated = { ...credential, updatedAt: new Date().toISOString() };
  getStore().upsert('users', updated);
  return updated;
}

/** True when the account has a CONFIRMED second factor. A pending secret is not one. */
export function isMfaActive(userId: string): boolean {
  return loadCredential(userId)?.activeSecret != null;
}

/** The bearer access token on this request, or undefined. */
export function accessTokenOf(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

// ----- lockout -----

function pruneFailures(now: number): void {
  for (const [key, entry] of failures) {
    if (now - entry.lastFailureAt > FAILURE_TTL_MS) failures.delete(key);
  }
}

function assertNotLockedOut(userId: string, now: number): void {
  pruneFailures(now);
  const entry = failures.get(userId);
  if (entry?.lockedUntil && entry.lockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000));
    throw new AppError('RATE_LIMITED', 'Too many failed verification codes. Try again later.', {
      retryAfterSeconds,
    });
  }
}

function recordFailure(userId: string, now: number): void {
  const entry = failures.get(userId) ?? { count: 0, lastFailureAt: now, lockedUntil: null };
  entry.count += 1;
  entry.lastFailureAt = now;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCKOUT_MS;
    entry.count = 0;
  }
  failures.set(userId, entry);
}

function clearFailures(userId: string): void {
  failures.delete(userId);
}

/** Test/ops hook, mirroring resetRateLimiter. */
export function resetMfaLockouts(): void {
  failures.clear();
}

// ----- recovery codes -----

/** Comparison form: upper case, separators stripped. */
function normaliseRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateRecoveryCodes(): { plain: string[]; records: RecoveryCodeRecord[] } {
  const plain: string[] = [];
  const records: RecoveryCodeRecord[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    // Base32 of 10 random bytes: exactly 16 characters, 80 bits, no padding
    // and no ambiguous 0/O/1/I to mistype off a printout.
    const raw = base32Encode(crypto.randomBytes(RECOVERY_CODE_BYTES));
    const grouped = raw.replace(/(.{4})(?=.)/g, '$1-');
    plain.push(grouped);
    records.push({ hash: sha256Hex(normaliseRecoveryCode(grouped)), usedAt: null });
  }
  return { plain, records };
}

/**
 * Consume a recovery code. Single use: the matching record is stamped and can
 * never match again. Returns false without side effects when nothing matches.
 */
function consumeRecoveryCode(credential: MfaCredential, submitted: string): boolean {
  const candidate = sha256Hex(normaliseRecoveryCode(submitted));
  // Every unused record is compared, with no early exit, so the work does not
  // depend on which position the code happens to occupy.
  let matchedIndex = -1;
  credential.recoveryCodes.forEach((record, index) => {
    if (record.usedAt === null && secureEquals(record.hash, candidate) && matchedIndex === -1) {
      matchedIndex = index;
    }
  });
  if (matchedIndex === -1) return false;
  const next = credential.recoveryCodes.slice();
  next[matchedIndex] = { ...next[matchedIndex]!, usedAt: new Date().toISOString() };
  saveCredential({ ...credential, recoveryCodes: next });
  return true;
}

// ----- enrolment -----

export interface EnrolmentStart {
  secret: string;
  otpauthUri: string;
  digits: number;
  periodSeconds: number;
}

/**
 * Issue (or re-issue) a pending secret. This is the ONLY response in the API
 * that ever contains a secret, and it is deliberately not logged anywhere: the
 * caller returns it straight to the enrolling user.
 *
 * Re-enrolling an account that already has an active factor requires a fresh
 * step-up first (the router enforces it), so a hijacked access token cannot
 * quietly swap the second factor for one the attacker holds.
 */
export function startEnrolment(user: Pick<User, 'id' | 'email'>): EnrolmentStart {
  const now = new Date().toISOString();
  const existing = loadCredential(user.id);
  const secret = generateTotpSecret();
  const credential: MfaCredential = existing
    ? { ...existing, pendingSecret: secret, pendingCreatedAt: now }
    : {
        id: credentialId(user.id),
        type: 'mfaCredential',
        userId: user.id,
        activeSecret: null,
        pendingSecret: secret,
        pendingCreatedAt: now,
        confirmedAt: null,
        lastAcceptedStep: null,
        recoveryCodes: [],
        createdAt: now,
        updatedAt: now,
      };
  saveCredential(credential);
  // Audit records THAT enrolment started. Never the secret.
  auditDataAccess(user.id, 'mfa.enrolment.started', { reEnrolment: existing?.activeSecret != null });
  logEvent('mfa.enrolment.started', { userId: user.id });
  return {
    secret,
    otpauthUri: otpauthUri({
      secretBase32: secret,
      accountName: user.email,
      issuer: MFA_ISSUER,
    }),
    digits: TOTP_DIGITS,
    periodSeconds: TOTP_STEP_SECONDS,
  };
}

export interface EnrolmentConfirmation {
  recoveryCodes: string[];
  confirmedAt: string;
}

/**
 * Prove possession of the pending secret and activate it.
 *
 * An unconfirmed secret is never activated — that is the whole point of the two
 * step flow. Activating on issue would lock an admin out of their own system
 * the moment they mistyped the secret into the wrong app, with the gate already
 * closed behind them.
 */
export function confirmEnrolment(userId: string, code: string): EnrolmentConfirmation {
  const now = Date.now();
  assertNotLockedOut(userId, now);
  const credential = loadCredential(userId);
  if (!credential?.pendingSecret) {
    throw new AppError('CONFLICT', 'No enrolment is in progress. Start one first.');
  }
  const step = verifyTotp(credential.pendingSecret, code);
  if (step === null) {
    recordFailure(userId, now);
    auditDataAccess(userId, 'mfa.enrolment.failed', {});
    logEvent('mfa.enrolment.failed', { userId });
    throw new AppError('AUTH_INVALID', 'That code is not valid.');
  }
  clearFailures(userId);
  const { plain, records } = generateRecoveryCodes();
  const confirmedAt = new Date().toISOString();
  saveCredential({
    ...credential,
    activeSecret: credential.pendingSecret,
    pendingSecret: null,
    pendingCreatedAt: null,
    confirmedAt,
    // The confirming code is burned: it must not also work as a step-up.
    lastAcceptedStep: step,
    recoveryCodes: records,
  });
  auditDataAccess(userId, 'mfa.enrolment.confirmed', { recoveryCodes: records.length });
  logEvent('mfa.enrolment.confirmed', { userId });
  return { recoveryCodes: plain, confirmedAt };
}

// ----- verification + step-up -----

export type StepUpMethod = 'totp' | 'recoveryCode';

export interface StepUpResult {
  method: StepUpMethod;
  expiresAt: string;
  recoveryCodesRemaining: number;
}

/**
 * Verify a code and, on success, grant a step-up bound to `accessToken`.
 *
 * Failures are counted towards the lockout and audited; successes are audited
 * too. Both outcomes reach the audit container and stdout, because "who tried
 * to open the admin router and failed" is precisely the line an operator needs
 * after an incident.
 */
export function verifyStepUp(
  userId: string,
  accessToken: string,
  input: { code?: string; recoveryCode?: string },
  meta: { ip?: string } = {},
): StepUpResult {
  const now = Date.now();
  assertNotLockedOut(userId, now);
  const credential = loadCredential(userId);
  if (!credential?.activeSecret) {
    throw new AppError('CONFLICT', 'No confirmed second factor is enrolled for this account.');
  }

  let method: StepUpMethod | null = null;
  if (typeof input.code === 'string' && input.code.trim() !== '') {
    const step = verifyTotp(credential.activeSecret, input.code);
    if (step !== null) {
      if (credential.lastAcceptedStep !== null && step <= credential.lastAcceptedStep) {
        // Replay of a code already accepted (or of an older one still inside
        // the skew window). Counted as a failure: a legitimate client never
        // does this, and an attacker replaying a shoulder-surfed code does.
        recordFailure(userId, now);
        auditFailure(userId, 'replay', meta);
        throw new AppError('AUTH_INVALID', 'That code has already been used.');
      }
      saveCredential({ ...credential, lastAcceptedStep: step });
      method = 'totp';
    }
  } else if (typeof input.recoveryCode === 'string' && input.recoveryCode.trim() !== '') {
    if (consumeRecoveryCode(credential, input.recoveryCode)) method = 'recoveryCode';
  }

  if (method === null) {
    recordFailure(userId, now);
    auditFailure(userId, 'invalid', meta);
    throw new AppError('AUTH_INVALID', 'That code is not valid.');
  }

  clearFailures(userId);
  const expiresAt = grantStepUp(userId, accessToken);
  auditDataAccess(userId, 'mfa.stepup.succeeded', { method, ip: meta.ip });
  logEvent('mfa.stepup.succeeded', { userId, method });
  const remaining = (loadCredential(userId)?.recoveryCodes ?? []).filter(
    (r) => r.usedAt === null,
  ).length;
  return { method, expiresAt, recoveryCodesRemaining: remaining };
}

function auditFailure(userId: string, reason: string, meta: { ip?: string }): void {
  auditDataAccess(userId, 'mfa.stepup.failed', { reason, ip: meta.ip });
  logEvent('mfa.stepup.failed', { userId, reason });
}

function grantStepUp(userId: string, accessToken: string): string {
  const store = getStore();
  const now = Date.now();
  const expiresAt = new Date(now + config.mfaStepUpTtlSeconds * 1000).toISOString();
  // Sweep this user's expired grants while we are here: one document per access
  // token would otherwise accumulate for the life of the process.
  for (const doc of store.where<MfaStepUp>(
    'users',
    (d) => d.type === 'mfaStepUp' && d.userId === userId && new Date(d.expiresAt).getTime() <= now,
  )) {
    store.delete('users', doc.id);
  }
  store.upsert('users', {
    id: stepUpId(accessToken),
    type: 'mfaStepUp',
    userId,
    verifiedAt: new Date(now).toISOString(),
    expiresAt,
  } satisfies MfaStepUp);
  return expiresAt;
}

/** The live step-up for this token, or undefined. Expired grants are deleted on sight. */
export function findFreshStepUp(userId: string, accessToken: string): MfaStepUp | undefined {
  const store = getStore();
  const doc = store.byId<MfaStepUp>('users', stepUpId(accessToken));
  if (!doc || doc.type !== 'mfaStepUp') return undefined;
  if (doc.userId !== userId) return undefined;
  if (new Date(doc.expiresAt).getTime() <= Date.now()) {
    store.delete('users', doc.id);
    return undefined;
  }
  return doc;
}

export interface MfaStatus {
  enrolled: boolean;
  enrolmentPending: boolean;
  confirmedAt: string | null;
  recoveryCodesRemaining: number;
  stepUpFresh: boolean;
  stepUpExpiresAt: string | null;
  /** Whether an unenrolled administrator is refused outright (config.mfaRequireAdmin). */
  adminEnforcement: 'required' | 'enrolled-only';
}

/** Never includes the secret, in any state. */
export function mfaStatus(userId: string, accessToken?: string): MfaStatus {
  const credential = loadCredential(userId);
  const stepUp = accessToken ? findFreshStepUp(userId, accessToken) : undefined;
  return {
    enrolled: credential?.activeSecret != null,
    enrolmentPending: credential?.pendingSecret != null,
    confirmedAt: credential?.confirmedAt ?? null,
    recoveryCodesRemaining: (credential?.recoveryCodes ?? []).filter((r) => r.usedAt === null)
      .length,
    stepUpFresh: stepUp !== undefined,
    stepUpExpiresAt: stepUp?.expiresAt ?? null,
    adminEnforcement: config.mfaRequireAdmin ? 'required' : 'enrolled-only',
  };
}
