/**
 * Firebase Admin bootstrap for ID-token verification (web Firebase Auth).
 *
 * Credentials are loaded from environment only - never from a committed file:
 * - FIREBASE_SERVICE_ACCOUNT_PATH: absolute path to a service-account JSON
 * - or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *
 * When none are set, Firebase verification is disabled and requireAuth falls
 * back to the existing HS256 access JWT path (Android / Telegram / offline).
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

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

function ensureApp(): App | null {
  if (cachedApp !== undefined) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApps()[0]!;
    return cachedApp;
  }
  const sa = readServiceAccountFromEnv();
  if (!sa) {
    cachedApp = null;
    return null;
  }
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

/** True when Admin credentials are present and the SDK initialised. */
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
 * Returns null when Admin is not configured (caller should try legacy JWT).
 * Throws AppError-compatible failures via the caller's catch when the token
 * is present but invalid.
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
    emailVerified: Boolean(decoded.email_verified),
    name: typeof decoded.name === 'string' ? decoded.name : undefined,
  };
}

/** Test-only: drop cached app so the next call re-reads env. */
export function resetFirebaseAdminForTests(): void {
  cachedApp = undefined;
  cachedAuth = undefined;
}
