// @vitest-environment jsdom
/**
 * The guard waits on `isLoading` before deciding who is signed in, so the
 * provider must settle it whatever happens to the Firebase SDK. A chunk that
 * fails to download must leave the app able to fall back to the cookie and
 * Telegram sessions, not on a skeleton until the user reloads.
 *
 * When `/auth/firebase/session` rejects (e.g. AUTH_EMAIL_UNVERIFIED), both
 * signInEmail and registerEmail must roll back tokenStore and sign out of
 * Firebase so the client never appears authenticated.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { FirebaseSdk } from './firebase';

const mocks = vi.hoisted(() => {
  let accessToken: string | null = null;
  return {
    api: vi.fn(),
    loadFirebaseSdk: vi.fn<() => Promise<FirebaseSdk>>(),
    tokenStore: {
      get access() {
        return accessToken;
      },
      get refresh() {
        return null;
      },
      set(tokens: { accessToken: string }) {
        accessToken = tokens.accessToken;
      },
      clear() {
        accessToken = null;
      },
      get isAuthenticated() {
        return Boolean(accessToken);
      },
    },
  };
});

vi.mock('./api', () => ({
  api: mocks.api,
  tokenStore: mocks.tokenStore,
}));

vi.mock('./firebase', () => ({
  isFirebaseAuthEnabled: () => true,
  loadFirebaseSdk: mocks.loadFirebaseSdk,
  mapFirebaseAuthError: () => 'Something went wrong. Please try again.',
}));

import { AuthProvider, useFirebaseAuth } from './AuthProvider';

function LoadingProbe() {
  const { isLoading } = useFirebaseAuth();
  return <p>{isLoading ? 'waiting for firebase' : 'auth settled'}</p>;
}

afterEach(() => {
  cleanup();
  mocks.tokenStore.clear();
  mocks.loadFirebaseSdk.mockReset();
  mocks.api.mockReset();
  vi.clearAllMocks();
});

describe('AuthProvider', () => {
  it('stops waiting when the Firebase SDK fails to load', async () => {
    mocks.loadFirebaseSdk.mockRejectedValueOnce(
      new Error('Failed to fetch dynamically imported module'),
    );

    render(
      <AuthProvider>
        <LoadingProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('auth settled')).toBeTruthy());
  });

  it('rolls back tokenStore and signs out Firebase when /auth/firebase/session rejects on signInEmail', async () => {
    const fakeAuth = { name: 'mock-auth' } as never;
    const fakeUser = {
      uid: 'fb-1',
      getIdToken: vi.fn(async () => 'firebase-id-token'),
    } as never;
    const signOut = vi.fn(async () => {});
    const sdk: FirebaseSdk = {
      app: {} as never,
      auth: fakeAuth,
      onIdTokenChanged: (_auth, next) => {
        next(null);
        return () => {};
      },
      signInWithEmailAndPassword: vi.fn(async () => ({ user: fakeUser })),
      createUserWithEmailAndPassword: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendEmailVerification: vi.fn(async () => {}),
      signOut,
      updateProfile: vi.fn(),
    };
    mocks.loadFirebaseSdk.mockResolvedValue(sdk);
    mocks.api.mockRejectedValueOnce(new Error('AUTH_EMAIL_UNVERIFIED'));

    let ctx!: ReturnType<typeof useFirebaseAuth>;
    function Capture() {
      ctx = useFirebaseAuth();
      return <p>{ctx.idToken ?? 'none'}</p>;
    }

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );
    await waitFor(() => expect(ctx.isLoading).toBe(false));

    await act(async () => {
      await expect(ctx.signInEmail('user@example.com', 'Password1234')).rejects.toThrow(
        'AUTH_EMAIL_UNVERIFIED',
      );
    });

    expect(mocks.tokenStore.isAuthenticated).toBe(false);
    expect(signOut).toHaveBeenCalledWith(fakeAuth);
    expect(ctx.idToken).toBeNull();
    expect(ctx.firebaseUser).toBeNull();
  });

  it('fires sendEmailVerification non-blockingly and rolls back on hydrateSession failure in registerEmail', async () => {
    const fakeAuth = { name: 'mock-auth' } as never;
    const fakeUser = {
      uid: 'fb-2',
      getIdToken: vi.fn(async () => 'firebase-new-token'),
    } as never;
    const sendEmailVerification = vi.fn(async () => {
      throw new Error('smtp transient error');
    });
    const updateProfile = vi.fn(async () => {});
    const signOut = vi.fn(async () => {});
    const sdk: FirebaseSdk = {
      app: {} as never,
      auth: fakeAuth,
      onIdTokenChanged: (_auth, next) => {
        next(null);
        return () => {};
      },
      signInWithEmailAndPassword: vi.fn(),
      createUserWithEmailAndPassword: vi.fn(async () => ({ user: fakeUser })),
      sendPasswordResetEmail: vi.fn(),
      sendEmailVerification,
      signOut,
      updateProfile,
    };
    mocks.loadFirebaseSdk.mockResolvedValue(sdk);
    mocks.api.mockRejectedValueOnce(new Error('AUTH_EMAIL_UNVERIFIED'));

    let ctx!: ReturnType<typeof useFirebaseAuth>;
    function Capture() {
      ctx = useFirebaseAuth();
      return null;
    }

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );
    await waitFor(() => expect(ctx.isLoading).toBe(false));

    await act(async () => {
      await expect(
        ctx.registerEmail({
          email: 'new@example.com',
          password: 'Password1234',
          displayName: 'Alex',
        }),
      ).rejects.toThrow('AUTH_EMAIL_UNVERIFIED');
    });

    expect(updateProfile).toHaveBeenCalledWith(fakeUser, { displayName: 'Alex' });
    expect(sendEmailVerification).toHaveBeenCalledWith(fakeUser);
    expect(mocks.tokenStore.isAuthenticated).toBe(false);
    expect(signOut).toHaveBeenCalledWith(fakeAuth);
    expect(ctx.idToken).toBeNull();
    expect(ctx.firebaseUser).toBeNull();
  });

  it('succeeds when onIdTokenChanged fires mid-registerEmail and does not self-abort', async () => {
    let listener: ((user: never) => void) | null = null;
    const fakeAuth = { currentUser: null as unknown } as never;
    const fakeUser = {
      uid: 'fb-3',
      getIdToken: vi.fn(async (force?: boolean) => {
        if (force) listener?.(fakeUser);
        return 'firebase-fresh-token';
      }),
    } as never;
    const sdk: FirebaseSdk = {
      app: {} as never,
      auth: fakeAuth,
      onIdTokenChanged: (_auth, next) => {
        listener = next as (user: never) => void;
        next(null);
        return () => {};
      },
      signInWithEmailAndPassword: vi.fn(),
      createUserWithEmailAndPassword: vi.fn(async () => {
        (fakeAuth as { currentUser: unknown }).currentUser = fakeUser;
        listener?.(fakeUser);
        return { user: fakeUser };
      }),
      sendPasswordResetEmail: vi.fn(),
      sendEmailVerification: vi.fn(async () => {}),
      signOut: vi.fn(async () => {
        (fakeAuth as { currentUser: unknown }).currentUser = null;
      }),
      updateProfile: vi.fn(async () => {}),
    };
    mocks.loadFirebaseSdk.mockResolvedValue(sdk);
    mocks.api.mockResolvedValueOnce({ user: { id: 'u-3', email: 'ok@example.com' } });

    let ctx!: ReturnType<typeof useFirebaseAuth>;
    function Capture() {
      ctx = useFirebaseAuth();
      return null;
    }

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );
    await waitFor(() => expect(ctx.isLoading).toBe(false));

    let hydrated: unknown;
    await act(async () => {
      hydrated = await ctx.registerEmail({ email: 'ok@example.com', password: 'Password1234' });
    });

    expect(hydrated).toMatchObject({ id: 'u-3', email: 'ok@example.com' });
    expect(mocks.tokenStore.access).toBe('firebase-fresh-token');
    expect(ctx.idToken).toBe('firebase-fresh-token');
  });

  it('prevents a slow onIdTokenChanged callback from repopulating tokenStore after rollback', async () => {
    let listener: ((user: never) => void) | null = null;
    let resolveSlowToken!: (v: string) => void;
    const fakeAuth = { currentUser: null as unknown } as never;
    let calls = 0;
    const fakeUser = {
      uid: 'fb-4',
      getIdToken: vi.fn(() => {
        calls += 1;
        if (calls === 1) {
          return new Promise<string>((r) => {
            resolveSlowToken = r;
          });
        }
        return Promise.resolve('immediate-token');
      }),
    } as never;
    const sdk: FirebaseSdk = {
      app: {} as never,
      auth: fakeAuth,
      onIdTokenChanged: (_auth, next) => {
        listener = next as (user: never) => void;
        next(null);
        return () => {};
      },
      signInWithEmailAndPassword: vi.fn(async () => {
        (fakeAuth as { currentUser: unknown }).currentUser = fakeUser;
        // Fires listener before establishSession begins; its getIdToken resolves late.
        listener?.(fakeUser);
        return { user: fakeUser };
      }),
      createUserWithEmailAndPassword: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendEmailVerification: vi.fn(async () => {}),
      signOut: vi.fn(async () => {
        (fakeAuth as { currentUser: unknown }).currentUser = null;
      }),
      updateProfile: vi.fn(),
    };
    mocks.loadFirebaseSdk.mockResolvedValue(sdk);
    mocks.api.mockRejectedValueOnce(new Error('AUTH_EMAIL_UNVERIFIED'));

    let ctx!: ReturnType<typeof useFirebaseAuth>;
    function Capture() {
      ctx = useFirebaseAuth();
      return null;
    }

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );
    await waitFor(() => expect(ctx.isLoading).toBe(false));

    await act(async () => {
      await expect(ctx.signInEmail('late@example.com', 'Password1234')).rejects.toThrow(
        'AUTH_EMAIL_UNVERIFIED',
      );
      resolveSlowToken('stale-leaked-token');
      await Promise.resolve();
    });

    expect(mocks.tokenStore.isAuthenticated).toBe(false);
    expect(ctx.idToken).toBeNull();
    expect(ctx.firebaseUser).toBeNull();
  });
});
