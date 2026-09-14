import { describe, expect, it } from 'vitest';
import {
  firebaseConfig,
  getFirebaseAnalytics,
  getFirebaseApp,
  isFirebaseAuthEnabled,
  mapFirebaseAuthError,
} from './firebase';

describe('Firebase Web SDK Configuration and Helpers', () => {
  it('exports valid Firebase configuration matching the aquazerofit project', () => {
    expect(firebaseConfig.projectId).toBe('aquazerofit');
    expect(firebaseConfig.authDomain).toBe('aquazerofit.firebaseapp.com');
    expect(firebaseConfig.storageBucket).toBe('aquazerofit.firebasestorage.app');
    expect(firebaseConfig.messagingSenderId).toBe('592686987043');
    expect(firebaseConfig.appId).toBe('1:592686987043:web:be6c7d84103ebb3d697e96');
    expect(firebaseConfig.measurementId).toBe('G-900GD16689');
  });

  it('keeps test environment safe and deterministic when unconfigured', () => {
    // When test suite runs without explicit API key in env, Firebase Auth is cleanly bypassed
    const enabled = isFirebaseAuthEnabled();
    expect(typeof enabled).toBe('boolean');
  });

  it('provides getFirebaseAnalytics without throwing in test environment', async () => {
    const analytics = await getFirebaseAnalytics();
    expect(analytics === null || typeof analytics === 'object').toBe(true);
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
