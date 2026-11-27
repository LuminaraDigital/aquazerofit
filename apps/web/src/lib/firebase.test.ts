import { describe, expect, it, vi } from 'vitest';
import * as firebaseModule from './firebase';
import { isFirebaseAuthEnabled, mapFirebaseAuthError } from './firebase';

describe('Firebase Web SDK Configuration and Helpers', () => {
  it('does not export a hardcoded Firebase config object', () => {
    expect('firebaseConfig' in firebaseModule).toBe(false);
  });

  it('keeps test environment safe and deterministic when unconfigured', () => {
    // When test suite runs without explicit API key in env, Firebase Auth is cleanly bypassed
    const enabled = isFirebaseAuthEnabled();
    expect(enabled).toBe(false);
  });

  it('never starts Firebase Analytics, even with web sign-in configured', async () => {
    // The privacy notice says the web runs no third-party analytics, and the
    // anonymisedAnalytics consent gates nothing here. Loading the SDK for
    // sign-in must not also set Google Analytics cookies on every page.
    vi.resetModules();
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key');
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app');
    // Analytics only ever started where window exists; this file runs in node.
    vi.stubGlobal('window', {});
    const getAnalytics = vi.fn(() => ({}));
    const sendEmailVerification = vi.fn();
    vi.doMock('firebase/app', () => ({
      initializeApp: vi.fn(() => ({})),
      getApps: () => [],
      getApp: vi.fn(),
    }));
    vi.doMock('firebase/auth', () => ({
      getAuth: vi.fn(() => ({})),
      onIdTokenChanged: vi.fn(),
      signInWithEmailAndPassword: vi.fn(),
      createUserWithEmailAndPassword: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendEmailVerification,
      signOut: vi.fn(),
      updateProfile: vi.fn(),
    }));
    vi.doMock('firebase/analytics', () => ({ isSupported: async () => true, getAnalytics }));
    try {
      const { loadFirebaseSdk } = await import('./firebase');
      const sdk = await loadFirebaseSdk();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sdk.auth).not.toBeNull();
      expect(sdk.sendEmailVerification).toBe(sendEmailVerification);
      expect(getAnalytics).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.doUnmock('firebase/app');
      vi.doUnmock('firebase/auth');
      vi.doUnmock('firebase/analytics');
      vi.resetModules();
    }
  });

  it('downloads the SDK again after a failed attempt instead of failing forever', async () => {
    // A network blip, or a deploy that replaced the hashed chunk, fails one
    // import. Every later sign-in, refresh and boot must not inherit it.
    vi.resetModules();
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key');
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app');
    let attempts = 0;
    vi.doMock('firebase/app', () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Failed to fetch dynamically imported module');
      return { initializeApp: vi.fn(() => ({})), getApps: () => [], getApp: vi.fn() };
    });
    vi.doMock('firebase/auth', () => ({
      getAuth: vi.fn(() => ({})),
      onIdTokenChanged: vi.fn(),
      signInWithEmailAndPassword: vi.fn(),
      createUserWithEmailAndPassword: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendEmailVerification: vi.fn(),
      signOut: vi.fn(),
      updateProfile: vi.fn(),
    }));
    try {
      const { loadFirebaseSdk } = await import('./firebase');
      await expect(loadFirebaseSdk()).rejects.toThrow();

      const sdk = await loadFirebaseSdk();

      expect(sdk.auth).not.toBeNull();
      expect(attempts).toBe(2);
    } finally {
      vi.unstubAllEnvs();
      vi.doUnmock('firebase/app');
      vi.doUnmock('firebase/auth');
      vi.resetModules();
    }
  });

  it('maps known Firebase Auth errors to friendly user-facing messages', () => {
    expect(mapFirebaseAuthError({ code: 'auth/invalid-email' })).toBe(
      'Enter a valid email address.',
    );
    expect(mapFirebaseAuthError({ code: 'auth/wrong-password' })).toBe(
      'Incorrect email or password.',
    );
    expect(mapFirebaseAuthError({ code: 'auth/user-disabled' })).toBe(
      'This account has been disabled.',
    );
    expect(mapFirebaseAuthError(new Error('unknown'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
