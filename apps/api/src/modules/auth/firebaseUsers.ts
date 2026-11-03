/**
 * Local User hydration for Firebase identities (web Auth path).
 * Kept separate from platform/auth.ts to avoid a circular import with the
 * JWT/refresh module that requireAuth lives in.
 *
 * Linking an existing account by email requires both sides to be verified:
 * the token's email_verified === true, and the existing account's
 * emailVerified === true. Administrators included. Either miss throws
 * AUTH_EMAIL_UNVERIFIED and does not write firebaseUid, role, or
 * emailVerified on that account.
 *
 * The account-side check is what stops a Telegram session from claiming
 * someone else's address through POST /me/credentials and then catching
 * their later Google sign-in. setCredentials stores that address unverified
 * on purpose. There is no email-verification token flow in this codebase
 * (password reset is a different proof and is not reused). Until one exists,
 * an unverified stored address cannot be used for linking. Register still
 * returns CONFLICT while that row holds the address, so the address can be
 * reserved. That reservation is the remaining gap, not a takeover.
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
 * only when the token reports the stored address itself verified.
 *
 * While that address is unproved the account cannot gain a password or a
 * Telegram link (assertFirebaseEmailProved), and the first verified token
 * drops any it gained before that rule existed: the identity's creator never
 * showed they hold the mailbox, and the proving owner must not inherit their
 * ways in.
 *
 * No address on UNOWNED_EMAIL_DOMAIN links or provisions. Nobody here receives
 * that domain's mail, so a verified flag on it says nothing about who holds
 * the account it names, and legacy rows (an admin among them) still sit there.
 */
import type { User } from '@aquazerofit/shared';
import { containsProfanity } from '@aquazerofit/shared';
import { revokeAllForUser } from '../../platform/auth';
import { AppError } from '../../platform/errors';
import { config } from '../../platform/config';
import { isUnownedEmailDomain } from '../../platform/mailer';
import { getStore, newId } from '../../platform/store';
import { credentialsId, toPublicUser } from '../me/service';
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

/** Strip the password, Telegram link and sessions an unproved account gained. */
function dropAccessAddedBeforeProof(user: User, ip?: string): User {
  const droppedPassword = getStore().delete('users', credentialsId(user.id));
  const droppedTelegram = typeof user.tgId === 'number';
  revokeAllForUser(user.id);
  auditAuthEvent(user.id, 'firebase.email.proved', { droppedPassword, droppedTelegram }, ip);
  return { ...user, tgId: undefined, tgUsername: undefined };
}

/**
 * Resolve or create the local User for a Firebase identity.
 * Links by email only when the token and the existing account both have a
 * verified email. Otherwise provisions a new user, or refuses when that
 * email is already taken.
 * Credentials stay in Firebase Auth. No password hash is written here.
 */
export function ensureUserFromFirebase(identity: FirebaseIdentity, ip?: string): User {
  const store = getStore();
  const email = identity.email?.trim().toLowerCase();
  const existingByUid = findUserByFirebaseUid(identity.uid);
  if (existingByUid) {
    let user = existingByUid;
    if (user.deletionRequestedAt) {
      user = { ...user, deletionRequestedAt: null };
      store.upsert('users', user);
      auditAuthEvent(user.id, 'deletion.cancelled', undefined, ip);
    }
    // A verified token proves the address it carries, which Firebase lets the
    // identity change. Only proof of the stored address verifies it.
    if (identity.emailVerified && !user.emailVerified && email === user.email.trim().toLowerCase()) {
      user = dropAccessAddedBeforeProof({ ...user, emailVerified: true }, ip);
      store.upsert('users', user);
    }
    auditAuthEvent(user.id, 'firebase.session', undefined, ip);
    return user;
  }

  if (email && isUnownedEmailDomain(email)) {
    auditAuthEvent(
      findUserByEmail(email)?.id ?? 'unknown',
      'firebase.link.rejected',
      {
        reason: 'unowned_domain',
        emailHash: hashIdentifier(email),
        firebaseUidHash: hashIdentifier(identity.uid),
      },
      ip,
    );
    throw new AppError('FORBIDDEN', 'This email address cannot be used to sign in');
  }
  if (email) {
    const byEmail = findUserByEmail(email);
    if (byEmail) {
      // Unverified must not link, including when byEmail.role is admin.
      // That covers an unverified token and an existing account whose stored
      // email was never proved (POST /me/credentials). Refuse before any
      // write so a retry after verification is clean.
      const tokenUnverified = identity.emailVerified !== true;
      const accountUnverified = byEmail.emailVerified !== true;
      if (tokenUnverified || accountUnverified) {
        auditAuthEvent(
          byEmail.id,
          'firebase.link.rejected',
          {
            reason: tokenUnverified ? 'email_unverified' : 'account_email_unverified',
            emailHash: hashIdentifier(email),
            firebaseUidHash: hashIdentifier(identity.uid),
          },
          ip,
        );
        throw new AppError(
          'AUTH_EMAIL_UNVERIFIED',
          tokenUnverified
            ? 'Verify your email first'
            : 'This email is not verified on the existing account',
        );
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
