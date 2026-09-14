/**
 * Local User hydration for verified Firebase identities (web Auth path).
 * Kept separate from platform/auth.ts to avoid a circular import with the
 * JWT/refresh module that requireAuth lives in.
 */
import type { User } from '@aquazerofit/shared';
import { containsProfanity } from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { config } from '../../platform/config';
import { getStore, newId } from '../../platform/store';
import { toPublicUser } from '../me/service';
import { auditAuthEvent, findUserByEmail, hashIdentifier } from './service';

export interface FirebaseIdentity {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

function isUserDoc(d: { id: string }): d is User {
  const t = (d as { type?: string }).type;
  return t === undefined || t === 'user';
}

function safeDisplayName(candidate: string): string {
  return containsProfanity(candidate) ? 'Aqua member' : candidate;
}

function findUserByFirebaseUid(uid: string): User | undefined {
  return getStore().findOne<User>(
    'users',
    (d) => isUserDoc(d) && (d as User).firebaseUid === uid,
  );
}

/**
 * Resolve or create the local User for a verified Firebase identity.
 * Links by email when an existing account matches, otherwise provisions.
 * Credentials stay in Firebase Auth - no password hash is written here.
 */
export function ensureUserFromFirebase(identity: FirebaseIdentity, ip?: string): User {
  const store = getStore();
  const existingByUid = findUserByFirebaseUid(identity.uid);
  if (existingByUid) {
    let user = existingByUid;
    if (user.deletionRequestedAt) {
      user = { ...user, deletionRequestedAt: null };
      store.upsert('users', user);
      auditAuthEvent(user.id, 'deletion.cancelled', undefined, ip);
    }
    if (identity.emailVerified && !user.emailVerified) {
      user = { ...user, emailVerified: true };
      store.upsert('users', user);
    }
    auditAuthEvent(user.id, 'firebase.session', undefined, ip);
    return user;
  }

  const email = identity.email?.trim().toLowerCase();
  if (email) {
    const byEmail = findUserByEmail(email);
    if (byEmail) {
      let user: User = { ...byEmail, firebaseUid: identity.uid };
      if (identity.emailVerified) user = { ...user, emailVerified: true };
      if (user.deletionRequestedAt) {
        user = { ...user, deletionRequestedAt: null };
        auditAuthEvent(user.id, 'deletion.cancelled', undefined, ip);
      }
      store.upsert('users', user);
      auditAuthEvent(
        user.id,
        'firebase.link',
        { emailHash: hashIdentifier(email), firebaseUidHash: hashIdentifier(identity.uid) },
        ip,
      );
      return user;
    }
  }

  const now = new Date().toISOString();
  const syntheticEmail = email || `fb-${identity.uid}@firebase.aquazero.fit`;
  const user: User = {
    id: newId('usr'),
    email: syntheticEmail,
    emailVerified: identity.emailVerified || config.isDev,
    role: 'user',
    tier: 'free',
    displayName: safeDisplayName(
      identity.name?.trim() || (email ? email.split('@')[0]! : 'Aqua member'),
    ),
    firebaseUid: identity.uid,
    createdAt: now,
    deletionRequestedAt: null,
  };
  store.upsert('users', user);
  auditAuthEvent(
    user.id,
    'firebase.register',
    { emailHash: hashIdentifier(user.email), firebaseUidHash: hashIdentifier(identity.uid) },
    ip,
  );
  return user;
}

export function firebaseSession(
  identity: FirebaseIdentity,
  ip?: string,
): { user: ReturnType<typeof toPublicUser> } {
  const user = ensureUserFromFirebase(identity, ip);
  return { user: toPublicUser(user) };
}

/** Guard helper for callers that expect a hydrated user or AUTH_INVALID. */
export function requireLocalUser(user: User | undefined): User {
  if (!user || (user as { type?: string }).type === 'refreshToken') {
    throw new AppError('AUTH_INVALID', 'Account no longer exists');
  }
  return user;
}
