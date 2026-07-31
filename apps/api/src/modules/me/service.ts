/**
 * Profile / consents / privacy service (AQF-09 profile module; AQF-07 §3.4).
 * Targets are recomputed on every profile change and stored denormalised so
 * the dashboard needs no join (AQF-06 §2 profiles container).
 */
import type {
  ConsentState,
  DerivedTargets,
  PublicUser,
  User,
  WellnessProfile,
  ProfileInput,
} from '@aquazerofit/shared';
import { unlinkSync } from 'node:fs';
import { AppError } from '../../platform/errors';
import { config } from '../../platform/config';
import { getStore, newId, type ContainerName } from '../../platform/store';
import { revokeAllForUser, sha256Hex } from '../../platform/auth';
import { computeTargets } from './targets';

export type ProfileDoc = WellnessProfile & { id: string; type: 'wellnessProfile' };
export type TargetsDoc = DerivedTargets & { id: string; type: 'derivedTargets' };
export type ConsentDoc = ConsentState & { id: string; type: 'consent'; userId: string };
export interface CredentialsDoc {
  id: string;
  type: 'credentials';
  userId: string;
  passwordHash: string;
}

export const profileId = (userId: string): string => `profile-${userId}`;
export const targetsId = (userId: string): string => `targets-${userId}`;
export const consentId = (userId: string): string => `consent-${userId}`;
export const credentialsId = (userId: string): string => `cred-${userId}`;

export function getProfile(userId: string): ProfileDoc | undefined {
  return getStore().byId<ProfileDoc>('profiles', profileId(userId));
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    tier: user.tier,
    emailVerified: user.emailVerified,
    hasProfile: getProfile(user.id) !== undefined,
    telegramLinked: user.tgId !== undefined && user.tgId !== null,
    timezone: user.timezone,
    createdAt: user.createdAt,
  };
}

// ----- identity (PATCH /me) -----

/**
 * Identity mutation: displayName (previously registration-only) and optional
 * IANA timezone. The audit event records which fields changed, never the new
 * values — displayName is an identifier and would otherwise need scrubbing on
 * purge (see IDENTIFIER_DETAIL_KEYS).
 */
export function updateIdentity(
  userId: string,
  input: { displayName?: string; timezone?: string },
): PublicUser {
  const store = getStore();
  const user = store.byId<User>('users', userId);
  if (!user) throw new AppError('NOT_FOUND', 'Account not found');
  const updated: User = { ...user };
  if (input.displayName !== undefined) updated.displayName = input.displayName;
  if (input.timezone !== undefined) updated.timezone = input.timezone;
  store.upsert('users', updated);
  auditDataAccess(userId, 'identity.update', {
    fields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined),
  });
  return toPublicUser(updated);
}

export function saveProfile(userId: string, input: ProfileInput): { profile: ProfileDoc; targets: TargetsDoc } {
  const store = getStore();
  const now = new Date().toISOString();
  const profile: ProfileDoc = {
    id: profileId(userId),
    type: 'wellnessProfile',
    userId,
    ...input,
    updatedAt: now,
  };
  store.upsert('profiles', profile);
  // Recompute on every profile change (AQF-09 §2.2).
  const targets: TargetsDoc = {
    id: targetsId(userId),
    type: 'derivedTargets',
    ...computeTargets(profile),
  };
  store.upsert('profiles', targets);
  return { profile, targets };
}

export function getTargets(userId: string): TargetsDoc {
  const store = getStore();
  const existing = store.byId<TargetsDoc>('profiles', targetsId(userId));
  if (existing) return existing;
  const profile = getProfile(userId);
  if (!profile) {
    throw new AppError('NOT_FOUND', 'No wellness profile yet; complete onboarding first');
  }
  const targets: TargetsDoc = {
    id: targetsId(userId),
    type: 'derivedTargets',
    ...computeTargets(profile),
  };
  store.upsert('profiles', targets);
  return targets;
}

// ----- consents -----

/**
 * Privacy default: every consent is OFF until the user explicitly PUTs their
 * choices (opt-in, AQF-07 §3.4). The seeded demo account opts in during
 * seeding so demo screens stay populated.
 */
const DEFAULT_CONSENTS: Omit<ConsentState, 'updatedAt'> = {
  wellnessDataProcessing: false,
  aiPersonalisation: false,
  anonymisedAnalytics: false,
  reminders: false,
};

export function getConsents(userId: string): ConsentDoc {
  const store = getStore();
  const existing = store.byId<ConsentDoc>('users', consentId(userId));
  if (existing) return existing;
  const doc: ConsentDoc = {
    id: consentId(userId),
    type: 'consent',
    userId,
    ...DEFAULT_CONSENTS,
    updatedAt: new Date().toISOString(),
  };
  store.upsert('users', doc);
  return doc;
}

/** True only when the user has an explicit, current consent for the given key. */
export function hasConsent(userId: string, key: keyof Omit<ConsentState, 'updatedAt'>): boolean {
  return getConsents(userId)[key] === true;
}

/**
 * Consent revocation note (memory feature Phase 1): revoking aiPersonalisation
 * does NOT delete the user's AI memory doc. The memory endpoints (and
 * getMemoryForPrompt) check consent on every access, so revocation makes the
 * data immediately unreadable and unwritable — but it is retained so the user
 * can re-enable the consent without losing their memory. Permanent removal is
 * the user's explicit choice: DELETE /me/memory (wipe) or account deletion
 * (purgeUser erases the whole `ai` container for the user).
 */
export function saveConsents(userId: string, input: Omit<ConsentState, 'updatedAt'>): ConsentDoc {
  const doc: ConsentDoc = {
    id: consentId(userId),
    type: 'consent',
    userId,
    ...input,
    updatedAt: new Date().toISOString(),
  };
  getStore().upsert('users', doc);
  auditDataAccess(userId, 'consents.update', { input });
  return doc;
}

// ----- privacy: export + deletion -----

// The unfiltered userId sweep over `ai` deliberately includes the userMemory
// doc (memory feature Phase 1): export and purge cover it with no doc-type list
// to keep in sync.
const USER_SCOPED_CONTAINERS: ContainerName[] = ['profiles', 'logs', 'plans', 'ai', 'ledger', 'audit'];

export function exportUserData(userId: string): Record<string, unknown> {
  const store = getStore();
  const user = store.byId<User>('users', userId);
  const bundle: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    user,
    consents: getConsents(userId),
  };
  for (const container of USER_SCOPED_CONTAINERS) {
    bundle[container] = store.where<{ id: string; userId?: string }>(
      container,
      (d) => d.userId === userId,
    );
  }
  auditDataAccess(userId, 'export', {});
  return bundle;
}

/**
 * Two-step deletion (AQF-06 §6): the first call flags the account and starts
 * the grace period; a second call while flagged purges immediately.
 */
export function requestDeletion(userId: string): { purged: boolean; deletionRequestedAt: string } {
  const store = getStore();
  const user = store.byId<User>('users', userId);
  if (!user) throw new AppError('NOT_FOUND', 'Account not found');

  if (user.deletionRequestedAt) {
    purgeUser(userId);
    return { purged: true, deletionRequestedAt: user.deletionRequestedAt };
  }
  const flaggedAt = new Date().toISOString();
  store.upsert('users', { ...user, deletionRequestedAt: flaggedAt });
  auditDataAccess(userId, 'deletion.requested', {});
  return { purged: false, deletionRequestedAt: flaggedAt };
}

/** Detail keys that may carry raw identifiers in audit/ledger docs. */
const IDENTIFIER_DETAIL_KEYS = ['email', 'tgId', 'tgUsername', 'displayName'] as const;

/**
 * Replace any remaining raw identifiers in an event detail payload with a
 * truncated sha256. Re-identifiable only by someone who already knows the
 * original value (same scheme as auth audit scrubbing).
 */
function scrubDetail(detail: unknown): unknown {
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return detail;
  const copy: Record<string, unknown> = { ...(detail as Record<string, unknown>) };
  for (const key of IDENTIFIER_DETAIL_KEYS) {
    const value = copy[key];
    if (typeof value === 'string' || typeof value === 'number') {
      copy[key] = sha256Hex(String(value)).slice(0, 16);
    }
  }
  return copy;
}

export function purgeUser(userId: string): void {
  const store = getStore();

  // Meal photo files on disk belong to the user's vision jobs — remove them
  // before the job docs go (missing files are tolerated: best-effort cleanup).
  const jobs = store.where<{ id: string; userId?: string; type?: string; imagePath?: string }>(
    'ai',
    (d) => d.userId === userId && d.type === 'cvJob' && typeof d.imagePath === 'string',
  );
  for (const job of jobs) {
    try {
      unlinkSync(job.imagePath!);
    } catch {
      /* already gone */
    }
  }

  // Ledger is retained anonymised for financial integrity; audit is retained
  // anonymised per AQF-06 §6. Everything else user-scoped is erased — the
  // `ai` sweep includes the userMemory doc (DELETE /me therefore removes
  // memory implicitly via this purge).
  for (const container of ['profiles', 'logs', 'plans', 'ai'] as ContainerName[]) {
    store.deleteWhere<{ id: string; userId?: string }>(container, (d) => d.userId === userId);
  }
  for (const container of ['ledger', 'audit'] as ContainerName[]) {
    for (const doc of store.where<{ id: string; userId?: string; detail?: unknown }>(
      container,
      (d) => d.userId === userId,
    )) {
      // Anonymise the subject AND hash any raw identifiers left in detail.
      store.upsert(container, { ...doc, userId: 'anonymised', detail: scrubDetail(doc.detail) });
    }
  }
  revokeAllForUser(userId);
  store.deleteWhere<{ id: string; userId?: string; type?: string }>(
    'users',
    (d) => d.id === userId || d.userId === userId,
  );
}

/**
 * Deletion grace sweep (AQF-06 §6): purge accounts whose grace period elapsed
 * (deletionRequestedAt + config.deletionGraceDays < now). Runs on boot and
 * every 6 hours (scheduled in index.ts). Returns the number of purged users.
 */
export function sweepExpiredDeletions(now = new Date()): number {
  const store = getStore();
  const cutoff = now.getTime() - config.deletionGraceDays * 24 * 3600 * 1000;
  const expired = store.where<User>(
    'users',
    (d) =>
      ((d as { type?: string }).type === undefined || (d as { type?: string }).type === 'user') &&
      typeof (d as User).deletionRequestedAt === 'string' &&
      new Date((d as User).deletionRequestedAt!).getTime() < cutoff,
  );
  for (const user of expired) {
    purgeUser(user.id);
    // Audit the sweep purge itself. The subject is already erased, so the
    // event is written anonymised with a hashed reference (re-identifiable
    // only with the original user id).
    getStore().upsert('audit', {
      id: newId('aud'),
      userId: 'anonymised',
      type: 'dataAccessEvent',
      action: 'deletion.sweepPurged',
      detail: { userHash: sha256Hex(user.id).slice(0, 16) },
      createdAt: new Date().toISOString(),
    });
  }
  return expired.length;
}

// ----- telegram link -----

export function linkTelegram(userId: string, tgId: number, tgUsername?: string): PublicUser {
  const store = getStore();
  const user = store.byId<User>('users', userId);
  if (!user) throw new AppError('NOT_FOUND', 'Account not found');
  const existing = store.findOne<User>(
    'users',
    (d) => (d as User).tgId === tgId && d.id !== userId,
  );
  if (existing) {
    throw new AppError('CONFLICT', 'This Telegram account is already linked to another user');
  }
  const updated: User = { ...user, tgId, tgUsername };
  store.upsert('users', updated);
  auditDataAccess(userId, 'telegram.linked', { tgId });
  return toPublicUser(updated);
}

// ----- audit helper -----

export function auditDataAccess(userId: string, action: string, detail: Record<string, unknown>): void {
  getStore().upsert('audit', {
    id: newId('aud'),
    userId,
    type: 'dataAccessEvent',
    action,
    detail,
    createdAt: new Date().toISOString(),
  });
}
