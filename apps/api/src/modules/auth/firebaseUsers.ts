/**
 * Local User hydration for Firebase identities (web Auth path).
 * Kept separate from platform/auth.ts to avoid a circular import with the
 * JWT/refresh module that requireAuth lives in.
 *
 * Linking an existing account by email requires email_verified === true,
 * administrators included. An unverified token that names an existing email
 * throws AUTH_EMAIL_UNVERIFIED ("Verify your email first") and does not
 * write firebaseUid, role, or emailVerified on that account.
 *
 * A token that matches no existing account still provisions a new local
 * user. That is the current product rule: there is nobody to take over, the
 * new row is role "user" and tier "free", and it cannot attach itself to
 * someone else. emailVerified is stored true only when the token says so,
 * or when config.isDev is true (the same non-production convenience password
 * registration uses). Production (NODE_ENV=production) leaves emailVerified
 * false until a later verified sign-in.
 *
 * An identity already linked by firebaseUid loads that user even when this
 * token's email is unverified. The uid binding is the identity. This path
 * does not read a role from the token (there is none) and sets emailVerified
 * only when the token reports the email verified.
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
 * Resolve or create the local User for a Firebase identity.
 * Links by email only when email_verified is true. Otherwise provisions a
 * new user, or refuses when that email is already taken.
 * Credentials stay in Firebase Auth. No password hash is written here.
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
      // Unverified must not link, including when byEmail.role is admin.
      // Refuse before any write so a retry after verification is clean.
      if (identity.emailVerified !== true) {
        auditAuthEvent(
          byEmail.id,
          'firebase.link.rejected',
          {
            reason: 'email_unverified',
            emailHash: hashIdentifier(email),
            firebaseUidHash: hashIdentifier(identity.uid),
          },
          ip,
        );
        throw new AppError('AUTH_EMAIL_UNVERIFIED', 'Verify your email first');
      }
      let user: User = { ...byEmail, firebaseUid: identity.uid, emailVerified: true };
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
