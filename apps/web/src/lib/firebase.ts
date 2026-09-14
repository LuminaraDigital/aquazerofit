/**
 * Firebase client bootstrap for web Auth & Analytics.
 * When VITE_FIREBASE_API_KEY + VITE_FIREBASE_APP_ID are unset, Auth stays
 * disabled and the UI falls back to the legacy /auth/login API path so the
 * offline demo and vitest suite keep working without credentials.
 */
import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

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

export function isFirebaseAuthEnabled(): boolean {
  // Unit tests stay on the legacy /auth path unless they opt into Firebase mocks.
  if (import.meta.env.MODE === 'test') return false;
  return readConfig() !== null;
}

export function getFirebaseApp(): FirebaseApp | null {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApp();
    return app;
  }
  const config = readConfig();
  if (!config) return null;
  app = initializeApp(config);
  return app;
}

export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseAuthEnabled()) return null;
  if (auth) return auth;
  const currentApp = getFirebaseApp();
  if (!currentApp) return null;
  auth = getAuth(currentApp);
  return auth;
}

export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (analyticsPromise) return analyticsPromise;
  if (typeof window === 'undefined') {
    analyticsPromise = Promise.resolve(null);
    return analyticsPromise;
  }
  const currentApp = getFirebaseApp();
  if (!currentApp) {
    analyticsPromise = Promise.resolve(null);
    return analyticsPromise;
  }
  analyticsPromise = isSupported()
    .then((supported) => (supported ? getAnalytics(currentApp) : null))
    .catch(() => null);
  return analyticsPromise;
}

// Auto-initialize analytics in real browser runtime (avoid running during test runs)
if (
  typeof window !== 'undefined' &&
  (typeof process === 'undefined' || process.env.NODE_ENV !== 'test')
) {
  void getFirebaseAnalytics();
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
