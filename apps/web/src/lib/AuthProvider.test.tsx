// @vitest-environment jsdom
/**
 * The guard waits on `isLoading` before deciding who is signed in, so the
 * provider must settle it whatever happens to the Firebase SDK. A chunk that
 * fails to download must leave the app able to fall back to the cookie and
 * Telegram sessions, not on a skeleton until the user reloads.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('./firebase', () => ({
  isFirebaseAuthEnabled: () => true,
  loadFirebaseSdk: vi.fn(() => Promise.reject(new Error('Failed to fetch dynamically imported module'))),
  mapFirebaseAuthError: () => 'Something went wrong. Please try again.',
}));

import { AuthProvider, useFirebaseAuth } from './AuthProvider';

function LoadingProbe() {
  const { isLoading } = useFirebaseAuth();
  return <p>{isLoading ? 'waiting for firebase' : 'auth settled'}</p>;
}

afterEach(() => {
  cleanup();
});

describe('AuthProvider', () => {
  it('stops waiting when the Firebase SDK fails to load', async () => {
    render(
      <AuthProvider>
        <LoadingProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('auth settled')).toBeTruthy());
  });
});
