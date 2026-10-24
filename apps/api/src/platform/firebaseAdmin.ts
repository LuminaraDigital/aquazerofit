/**
 * Firebase Admin bootstrap for ID-token verification (web Firebase Auth).
 *
 * Credentials are loaded from environment only. Nothing here reads a committed
 * file. Resolution order:
 *
 * 1. FIREBASE_SERVICE_ACCOUNT_PATH: absolute path to a service-account JSON
 *    key. Kept so a mounted key still boots. Retire it (steps below).
 * 2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *    together. One or two of the three is a half-configured key and throws.
 *    That does not fall through to application default credentials.
 * 3. Otherwise applicationDefault(). On Cloud Run the metadata server supplies
 *    the runtime service account (azf-api). No JSON key is required.
 *    GOOGLE_CLOUD_PROJECT or GCLOUD_PROJECT, when set, is passed as projectId.
 *    Do not set FIREBASE_PROJECT_ID alone to get that effect: alone, it is
 *    the half-configured key case and startup refuses it.
 *
 * Retire the FIREBASE_ADMIN_JSON secret (operator steps, not something this
 * process does):
 *
 * 1. Grant the Cloud Run service account azf-api the role Firebase
 *    Authentication Admin (roles/firebaseauth.admin) on project aquazerofit.
 *    That covers verifyIdToken revocation checks, revokeRefreshTokens, and
 *    deleteUser. Do not create a replacement JSON key.
 * 2. Deploy a revision of this API with the key path and the three
 *    FIREBASE_* fields unset, so this module takes the applicationDefault()
 *    branch. If verification reports a missing project id, set
 *    GOOGLE_CLOUD_PROJECT=aquazerofit on the service. It is not a secret.
 * 3. Confirm a verified sign-in still hydrates a session, an unverified
 *    email is refused with AUTH_EMAIL_UNVERIFIED, and account purge deletes
 *    the Firebase user.
 * 4. Remove the FIREBASE_ADMIN_JSON secret mount (env var or volume) from
 *    the Cloud Run service. Unset FIREBASE_SERVICE_ACCOUNT_PATH,
 *    FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY when they were filled
 *    from that secret.
 * 5. Delete the JSON key in IAM, then delete the Secret Manager secret
 *    FIREBASE_ADMIN_JSON.
 *
 * A machine with no Google credentials can still construct the ADC app.
 * Verification then fails and requireAuth falls back to the legacy HS256
 * access JWT (Android, Telegram, offline). Cloud Run's metadata server is
 * what makes the azf-api service account actually work.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { AppError } from './errors';
import { logEvent } from './telemetry';

/**
 * Stable log name for a Firebase identity deletion that did not succeed.
 * `logEvent` redacts a field literally named `code`, so the same value is
 * also stored as `failureCode`. Alert on either.
 */
export const FIREBASE_ACCOUNT_DELETE_FAILED = 'firebase_account_delete_failed';

const FIREBASE_DELETE_CLIENT_MESSAGE =
  'Could not delete the sign-in identity. Your account was not removed. Try again.';

let cachedApp: App | null | undefined;
let cachedAuth: Auth | null | undefined;

interface ServiceAccountFields {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function readServiceAccountFromPath(filePath: string): ServiceAccountFields {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  if (!raw.project_id || !raw.client_email || !raw.private_key) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_PATH (${filePath}) is missing project_id, client_email, or private_key`,
    );
  }
  return {
    projectId: raw.project_id,
    clientEmail: raw.client_email,
    privateKey: raw.private_key,
  };
}

function readServiceAccountFromEnv(): ServiceAccountFields | null {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (pathEnv) return readServiceAccountFromPath(pathEnv);

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!projectId && !clientEmail && !privateKeyRaw) return null;
  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      'Firebase Admin is half-configured: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY together (or FIREBASE_SERVICE_ACCOUNT_PATH alone)',
    );
  }
  return {
    projectId,
    clientEmail,
    // Hosted env often stores newlines as \n in a single-line secret.
    privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
  };
}

function cloudProjectId(): string | undefined {
  const id = process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCLOUD_PROJECT?.trim();
  return id || undefined;
}

function ensureApp(): App | null {
  if (cachedApp !== undefined) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApps()[0]!;
    return cachedApp;
  }
  const sa = readServiceAccountFromEnv();
  if (sa) {
    cachedApp = initializeApp({
      credential: cert({
        projectId: sa.projectId,
        clientEmail: sa.clientEmail,
        privateKey: sa.privateKey,
      }),
      projectId: sa.projectId,
    });
    return cachedApp;
  }
  const projectId = cloudProjectId();
  cachedApp = initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
  return cachedApp;
}

/** True when the Admin SDK app initialised (key, JSON env, or ADC). */
export function isFirebaseAdminConfigured(): boolean {
  try {
    return ensureApp() !== null;
  } catch {
    return false;
  }
}

export function getFirebaseAuth(): Auth | null {
  if (cachedAuth !== undefined) return cachedAuth;
  const app = ensureApp();
  cachedAuth = app ? getAuth(app) : null;
  return cachedAuth;
}

/**
 * Verify a Firebase ID token with revocation checking.
 * Returns null when Admin did not initialise.
 * Throws when the token is present but invalid. requireAuth catches that and
 * falls through to the legacy JWT. email_verified must be the boolean true.
 * Any other claim value is unverified.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
} | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  const decoded = await auth.verifyIdToken(idToken, true);
  return {
    uid: decoded.uid,
    email: typeof decoded.email === 'string' ? decoded.email : undefined,
    emailVerified: decoded.email_verified === true,
    name: typeof decoded.name === 'string' ? decoded.name : undefined,
  };
}

function hashUid(uid: string): string {
  return crypto.createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

function firebaseErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return undefined;
}

function logFirebaseDeleteFailure(uid: string, step: string, err: unknown): void {
  // Firebase messages often echo the uid. Log the stable code and the SDK
  // code only, plus a truncated hash an operator can match to an audit row.
  logEvent(FIREBASE_ACCOUNT_DELETE_FAILED, {
    failureCode: FIREBASE_ACCOUNT_DELETE_FAILED,
    step,
    firebaseCode: firebaseErrorCode(err) ?? 'unknown',
    uidHash: hashUid(uid),
  });
}

async function runFirebaseStep(
  uid: string,
  step: 'revokeRefreshTokens' | 'deleteUser',
  op: () => Promise<void>,
): Promise<void> {
  try {
    await op();
  } catch (err) {
    if (firebaseErrorCode(err) === 'auth/user-not-found') return;
    logFirebaseDeleteFailure(uid, step, err);
    throw new AppError('INTERNAL', FIREBASE_DELETE_CLIENT_MESSAGE);
  }
}

/**
 * Remove the Firebase Auth user for a linked uid.
 *
 * Order:
 * 1. revokeRefreshTokens, so existing ID tokens fail verifyIdToken(..., true)
 *    even if deleteUser has to be retried later.
 * 2. deleteUser, so the uid cannot mint a new session.
 *
 * auth/user-not-found on either call is success for that call (the identity
 * is already gone). The other call still runs. Any other error is logged as
 * firebase_account_delete_failed and thrown. A revoke failure does not
 * continue into deleteUser: both the Firebase user and the local account
 * are still there, and the purge can be retried. Callers must invoke this
 * before any local delete so a Firebase error cannot leave the account
 * half-removed.
 */
export async function removeFirebaseIdentity(uid: string): Promise<void> {
  let auth: Auth | null;
  try {
    auth = getFirebaseAuth();
  } catch (err) {
    logFirebaseDeleteFailure(uid, 'init', err);
    throw new AppError('INTERNAL', FIREBASE_DELETE_CLIENT_MESSAGE);
  }
  if (!auth) {
    logFirebaseDeleteFailure(uid, 'admin_not_configured', new Error('Firebase Admin is not configured'));
    throw new AppError('INTERNAL', FIREBASE_DELETE_CLIENT_MESSAGE);
  }
  const linked = auth;
  await runFirebaseStep(uid, 'revokeRefreshTokens', () => linked.revokeRefreshTokens(uid));
  await runFirebaseStep(uid, 'deleteUser', () => linked.deleteUser(uid));
}

/** Test-only: drop cached app so the next call re-reads env. */
export function resetFirebaseAdminForTests(): void {
  cachedApp = undefined;
  cachedAuth = undefined;
}
