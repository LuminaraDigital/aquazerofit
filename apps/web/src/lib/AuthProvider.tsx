/**
 * Global Firebase Auth state for the web app.
 * Resolves isLoading via onIdTokenChanged so RequireAuth can wait before
 * painting a signed-out flash. When Firebase is not configured, isLoading is
 * false immediately and callers use the legacy cookie restore path.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { AuthResponse, PublicUser } from '@aquazerofit/shared';
import { api, tokenStore } from './api';
import {
  isFirebaseAuthEnabled,
  loadFirebaseSdk,
  mapFirebaseAuthError,
  type FirebaseSdk,
} from './firebase';

interface AuthContextValue {
  /** True until the first Firebase auth event (or immediately if disabled). */
  isLoading: boolean;
  firebaseUser: FirebaseUser | null;
  firebaseEnabled: boolean;
  /** Latest Firebase ID token mirrored into tokenStore for API calls. */
  idToken: string | null;
  signInEmail: (email: string, password: string) => Promise<PublicUser>;
  registerEmail: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<PublicUser>;
  resetPassword: (email: string) => Promise<void>;
  signOutFirebase: () => Promise<void>;
  mapError: (err: unknown) => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function hydrateSession(): Promise<PublicUser> {
  const res = await api<{ user: PublicUser }>('/auth/firebase/session', {
    method: 'POST',
    auth: true,
    retryOn401: false,
  });
  return res.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const firebaseEnabled = isFirebaseAuthEnabled();
  const [isLoading, setIsLoading] = useState(firebaseEnabled);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  // Separate sequence counters: listenerSeqRef cancels stale onIdTokenChanged
  // work, while sessionSeqRef is bumped only by explicit sign-in/register/sign-out
  // so Firebase's own onIdTokenChanged callbacks cannot abort establishSession.
  const listenerSeqRef = useRef(0);
  const sessionSeqRef = useRef(0);
  const establishingRef = useRef(false);

  useEffect(() => {
    if (!firebaseEnabled) {
      setIsLoading(false);
      return;
    }
    let unsub = () => {};
    let cancelled = false;
    // An SDK that will not load settles loading as signed out of Firebase, so
    // the guard can still restore a cookie or Telegram session.
    const settle = () => {
      if (!cancelled) setIsLoading(false);
    };
    void loadFirebaseSdk().then((sdk) => {
      if (cancelled) return;
      if (!sdk.auth) {
        setIsLoading(false);
        return;
      }
      unsub = sdk.onIdTokenChanged(sdk.auth, (user) => {
        const seq = ++listenerSeqRef.current;
        void (async () => {
          try {
            if (!user) {
              if (!cancelled && !establishingRef.current && seq === listenerSeqRef.current) {
                setFirebaseUser(null);
                setIdToken(null);
              }
              // Do not clear a legacy JWT session (Telegram cookie refresh may own it).
              return;
            }
            const token = await user.getIdToken();
            if (
              cancelled ||
              establishingRef.current ||
              seq !== listenerSeqRef.current ||
              sdk.auth?.currentUser?.uid !== user.uid
            ) {
              return;
            }
            setFirebaseUser(user);
            setIdToken(token);
            tokenStore.set({ accessToken: token });
          } catch {
            if (!cancelled && !establishingRef.current && seq === listenerSeqRef.current) {
              setFirebaseUser(null);
              setIdToken(null);
            }
          } finally {
            if (!cancelled) setIsLoading(false);
          }
        })();
      });
    }, settle);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [firebaseEnabled]);

  const establishSession = useCallback(
    async (sdk: FirebaseSdk, user: FirebaseUser, forceRefresh = false): Promise<PublicUser> => {
      const sessionSeq = ++sessionSeqRef.current;
      establishingRef.current = true;
      listenerSeqRef.current += 1;
      try {
        const token = await user.getIdToken(forceRefresh);
        if (sessionSeq !== sessionSeqRef.current) {
          throw new Error('Sign-in superseded');
        }
        tokenStore.set({ accessToken: token });
        setIdToken(token);
        setFirebaseUser(user);
        return await hydrateSession();
      } catch (err) {
        if (sessionSeq === sessionSeqRef.current) {
          listenerSeqRef.current += 1;
          tokenStore.clear();
          setIdToken(null);
          setFirebaseUser(null);
          if (sdk.auth) await sdk.signOut(sdk.auth).catch(() => {});
        }
        throw err;
      } finally {
        if (sessionSeq === sessionSeqRef.current) {
          establishingRef.current = false;
        }
      }
    },
    [],
  );

  const signInEmail = useCallback(
    async (email: string, password: string) => {
      const sdk = await loadFirebaseSdk();
      if (!sdk.auth) throw new Error('Firebase Auth is not configured');
      const cred = await sdk.signInWithEmailAndPassword(sdk.auth, email.trim(), password);
      return establishSession(sdk, cred.user);
    },
    [establishSession],
  );

  const registerEmail = useCallback(
    async (input: { email: string; password: string; displayName?: string }) => {
      const sdk = await loadFirebaseSdk();
      if (!sdk.auth) throw new Error('Firebase Auth is not configured');
      const cred = await sdk.createUserWithEmailAndPassword(
        sdk.auth,
        input.email.trim(),
        input.password,
      );
      if (input.displayName?.trim()) {
        await sdk.updateProfile(cred.user, { displayName: input.displayName.trim() });
      }
      void sdk.sendEmailVerification(cred.user).catch(() => {});
      return establishSession(sdk, cred.user, true);
    },
    [establishSession],
  );

  const resetPassword = useCallback(async (email: string) => {
    const sdk = await loadFirebaseSdk();
    if (!sdk.auth) throw new Error('Firebase Auth is not configured');
    await sdk.sendPasswordResetEmail(sdk.auth, email.trim());
  }, []);

  const signOutFirebase = useCallback(async () => {
    sessionSeqRef.current += 1;
    listenerSeqRef.current += 1;
    establishingRef.current = false;
    const sdk = await loadFirebaseSdk();
    if (sdk.auth) await sdk.signOut(sdk.auth);
    setFirebaseUser(null);
    setIdToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      firebaseUser,
      firebaseEnabled,
      idToken,
      signInEmail,
      registerEmail,
      resetPassword,
      signOutFirebase,
      mapError: mapFirebaseAuthError,
    }),
    [
      isLoading,
      firebaseUser,
      firebaseEnabled,
      idToken,
      signInEmail,
      registerEmail,
      resetPassword,
      signOutFirebase,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const defaultAuthContext: AuthContextValue = {
  isLoading: false,
  firebaseUser: null,
  firebaseEnabled: false,
  idToken: null,
  signInEmail: async () => {
    throw new Error('Firebase Auth not available');
  },
  registerEmail: async () => {
    throw new Error('Firebase Auth not available');
  },
  resetPassword: async () => {
    throw new Error('Firebase Auth not available');
  },
  signOutFirebase: async () => {},
  mapError: mapFirebaseAuthError,
};

export function useFirebaseAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  return ctx ?? defaultAuthContext;
}

/** Shape compatible with callers that previously only stored AuthResponse. */
export function toAuthResponseStub(user: PublicUser, idToken: string): AuthResponse {
  return {
    accessToken: idToken,
    refreshToken: '',
    user,
  };
}
