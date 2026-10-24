/**
 * Firebase client bootstrap for web Auth and Analytics.
 *
 * The SDK is loaded with a dynamic import the first time auth is actually
 * enabled. Test runs and deployments without VITE_FIREBASE_API_KEY never
 * download it. When those keys are unset, Auth stays disabled and the UI
 * falls back to the legacy /auth/login path.
 */
import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import type { Analytics } from 'firebase/analytics';
import type { Auth, User as FirebaseUser } from 'firebase/auth';

export const firebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyCA04-nC_Rple5xoGAOzwm1jRlyOCSUnLA',
  authDomain: 'aquazerofit.firebaseapp.com',
  projectId: 'aquazerofit',
  storageBucket: 'aquazerofit.firebasestorage.app',
  messagingSenderId: '592686987043',
  appId: '1:592686987043:web:be6c7d84103ebb3d697e96',
  measurementId: 'G-900GD16689',
};

function readConfig(): FirebaseOptions | null {
  const apiKey = String(import.meta.env.VITE_FIREBASE_API_KEY ?? '').trim();
  const appId = String(import.meta.env.VITE_FIREBASE_APP_ID ?? '').trim();
  if (!apiKey || !appId) return null;
  return {
    apiKey,
    authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '').trim() || 'aquazerofit.firebaseapp.com',
    projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim() || 'aquazerofit',
    storageBucket:
      String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '').trim() ||
      'aquazerofit.firebasestorage.app',
    messagingSenderId:
      String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '').trim() || '592686987043',
    appId,
    measurementId:
      String(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '').trim() || 'G-900GD16689',
  };
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let analyticsPromise: Promise<Analytics | null> | null = null;
let loading: Promise<FirebaseSdk> | null = null;

export interface FirebaseSdk {
  app: FirebaseApp | null;
  auth: Auth | null;
  onIdTokenChanged: (
    auth: Auth,
    next: (user: FirebaseUser | null) => void,
  ) => () => void;
  signInWithEmailAndPassword: (
    auth: Auth,
    email: string,
    password: string,
  ) => Promise<{ user: FirebaseUser }>;
  createUserWithEmailAndPassword: (
    auth: Auth,
    email: string,
    password: string,
  ) => Promise<{ user: FirebaseUser }>;
  sendPasswordResetEmail: (auth: Auth, email: string) => Promise<void>;
  signOut: (auth: Auth) => Promise<void>;
  updateProfile: (user: FirebaseUser, profile: { displayName?: string }) => Promise<void>;
}

const emptySdk = (): FirebaseSdk => ({
  app: null,
  auth: null,
  onIdTokenChanged: () => () => {},
  signInWithEmailAndPassword: async () => {
    throw new Error('Firebase Auth is not configured');
  },
  createUserWithEmailAndPassword: async () => {
    throw new Error('Firebase Auth is not configured');
  },
  sendPasswordResetEmail: async () => {
    throw new Error('Firebase Auth is not configured');
  },
  signOut: async () => {},
  updateProfile: async () => {},
});

export function isFirebaseAuthEnabled(): boolean {
  // Unit tests stay on the legacy /auth path unless they opt into Firebase mocks.
  if (import.meta.env.MODE === 'test') return false;
  return readConfig() !== null;
}

/** The app instance, once loadFirebaseSdk has resolved. Null before that. */
export function getFirebaseApp(): FirebaseApp | null {
  return app;
}

/** The auth instance, once loadFirebaseSdk has resolved. Null before that. */
export function getFirebaseAuth(): Auth | null {
  return auth;
}

/**
 * Load the Firebase SDK. Resolves to a null auth when Firebase is disabled,
 * without importing the packages.
 */
export function loadFirebaseSdk(): Promise<FirebaseSdk> {
  if (!isFirebaseAuthEnabled()) return Promise.resolve(emptySdk());
  loading ??= (async () => {
    const [{ initializeApp, getApps, getApp }, authMod, analyticsMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/analytics'),
    ]);
    if (getApps().length > 0) app = getApp();
    else {
      const options = readConfig();
      if (!options) return emptySdk();
      app = initializeApp(options);
    }
    auth = authMod.getAuth(app);
    if (typeof window !== 'undefined') {
      const current = app;
      analyticsPromise = analyticsMod
        .isSupported()
        .then((supported) => (supported && current ? analyticsMod.getAnalytics(current) : null))
        .catch(() => null);
      void analyticsPromise;
    }
    return {
      app,
      auth,
      onIdTokenChanged: authMod.onIdTokenChanged,
      signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
      createUserWithEmailAndPassword: authMod.createUserWithEmailAndPassword,
      sendPasswordResetEmail: authMod.sendPasswordResetEmail,
      signOut: authMod.signOut,
      updateProfile: authMod.updateProfile,
    };
  })();
  return loading;
}

export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!isFirebaseAuthEnabled()) return Promise.resolve(null);
  return loadFirebaseSdk().then(() => analyticsPromise ?? Promise.resolve(null));
}

/** Map Firebase Auth error codes to user-facing copy (no internal detail). */
export function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password does not meet the requirements.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export { app };
