/**
 * Email/password accounts held in Firebase Auth rather than in this API's
 * bcrypt credentials.
 *
 * The web app signs in with the Firebase client SDK, so an account that only
 * exists here (Android's /auth/register) cannot sign in on the web, and a web
 * account has no password here. With this gateway on, /auth/register creates
 * the Firebase user, /auth/login checks the password against Firebase, and a
 * legacy bcrypt account moves across the first time its password is proved.
 *
 * On only when FIREBASE_API_KEY is set (config.firebaseApiKey). Off, every
 * caller keeps the bcrypt path, so dev, tests and the offline demo need no
 * Google credentials.
 */
import { AppError } from '../../platform/errors';
import { config } from '../../platform/config';
import { getFirebaseAuth } from '../../platform/firebaseAdmin';

export interface FirebasePasswords {
  /** Create the Firebase user. Null when that email already has one. */
  create(input: { email: string; password: string; displayName: string }): Promise<string | null>;
  /** A Firebase ID token for a correct email + password, null for wrong ones. */
  signIn(email: string, password: string): Promise<string | null>;
  setPassword(uid: string, password: string): Promise<void>;
  /** Firebase sends its own reset email. Unknown addresses are a silent no-op. */
  sendPasswordReset(email: string): Promise<void>;
  /** Firebase sends its own verification email; the password lets it act as the user. */
  sendVerification(email: string, password: string): Promise<void>;
  /**
   * Firebase's tokensValidAfterTime in ms: moved by every password change and
   * reset, wherever it happened. Null when Firebase reports none.
   */
  tokensValidAfter(uid: string): Promise<number | null>;
}

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';
const TIMEOUT_MS = 10_000;

/** Identity Toolkit messages that mean "wrong credentials", not "broken". */
const WRONG_CREDENTIALS = new Set([
  'INVALID_LOGIN_CREDENTIALS',
  'INVALID_PASSWORD',
  'EMAIL_NOT_FOUND',
  'USER_DISABLED',
  'INVALID_EMAIL',
]);

const UNAVAILABLE = 'Sign-in is unavailable right now. Please try again.';

/** POST to Identity Toolkit; returns the body on 2xx, else the error message. */
async function identityToolkit(
  key: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; message: string }> {
  let res: Response;
  try {
    res = await fetch(`${IDENTITY_TOOLKIT}/accounts:${method}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError('INTERNAL', UNAVAILABLE);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, body: json };
  // Messages look like "TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account...".
  const raw = (json.error as { message?: unknown } | undefined)?.message;
  return { ok: false, message: typeof raw === 'string' ? raw.split(' ')[0]! : `HTTP_${res.status}` };
}

function adminAuth() {
  const auth = getFirebaseAuth();
  if (!auth) throw new AppError('INTERNAL', UNAVAILABLE);
  return auth;
}

function restGateway(key: string): FirebasePasswords {
  const gateway: FirebasePasswords = {
    async create({ email, password, displayName }) {
      try {
        const created = await adminAuth().createUser({ email, password, displayName });
        return created.uid;
      } catch (err) {
        if ((err as { code?: unknown }).code === 'auth/email-already-exists') return null;
        throw err instanceof AppError ? err : new AppError('INTERNAL', UNAVAILABLE);
      }
    },

    async signIn(email, password) {
      const res = await identityToolkit(key, 'signInWithPassword', {
        email,
        password,
        returnSecureToken: true,
      });
      if (res.ok) {
        const idToken = res.body.idToken;
        if (typeof idToken !== 'string') throw new AppError('INTERNAL', UNAVAILABLE);
        return idToken;
      }
      if (WRONG_CREDENTIALS.has(res.message)) return null;
      if (res.message === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        throw new AppError('RATE_LIMITED', 'Too many failed sign-in attempts. Please try again later.');
      }
      throw new AppError('INTERNAL', UNAVAILABLE);
    },

    async setPassword(uid, password) {
      await adminAuth().updateUser(uid, { password });
    },

    async sendPasswordReset(email) {
      const res = await identityToolkit(key, 'sendOobCode', { requestType: 'PASSWORD_RESET', email });
      if (!res.ok && res.message !== 'EMAIL_NOT_FOUND') {
        throw new Error(`Firebase reset email failed: ${res.message}`);
      }
    },

    async sendVerification(email, password) {
      const idToken = await gateway.signIn(email, password);
      if (!idToken) return;
      const res = await identityToolkit(key, 'sendOobCode', { requestType: 'VERIFY_EMAIL', idToken });
      if (!res.ok) throw new Error(`Firebase verification email failed: ${res.message}`);
    },

    async tokensValidAfter(uid) {
      const { tokensValidAfterTime } = await adminAuth().getUser(uid);
      const at = tokensValidAfterTime ? Date.parse(tokensValidAfterTime) : Number.NaN;
      return Number.isNaN(at) ? null : at;
    },
  };
  return gateway;
}

let testOverride: FirebasePasswords | null | undefined;

/** The gateway, or null when Firebase-held passwords are off. */
export function firebasePasswords(): FirebasePasswords | null {
  if (testOverride !== undefined) return testOverride;
  return config.firebaseApiKey ? restGateway(config.firebaseApiKey) : null;
}

/** Test hook: a fake gateway, null to force off, undefined to use config. */
export function setFirebasePasswordsForTests(gateway: FirebasePasswords | null | undefined): void {
  testOverride = gateway;
}
