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
  useState,
  type ReactNode,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import type { AuthResponse, PublicUser } from '@aquazerofit/shared';
import { api, tokenStore } from './api';
import { getFirebaseAuth, isFirebaseAuthEnabled, mapFirebaseAuthError } from './firebase';

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

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setIsLoading(false);
      return;
    }
    const unsub = onIdTokenChanged(auth, async (user) => {
      try {
        if (!user) {
          setFirebaseUser(null);
          setIdToken(null);
          // Do not clear a legacy JWT session (Telegram cookie refresh may own it).
          return;
        }
        const token = await user.getIdToken();
        setFirebaseUser(user);
        setIdToken(token);
        tokenStore.set({ accessToken: token });
      } finally {
        setIsLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase Auth is not configured');
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const token = await cred.user.getIdToken();
    tokenStore.set({ accessToken: token });
    setIdToken(token);
    setFirebaseUser(cred.user);
    return hydrateSession();
  }, []);

  const registerEmail = useCallback(
    async (input: { email: string; password: string; displayName?: string }) => {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('Firebase Auth is not configured');
      const cred = await createUserWithEmailAndPassword(
        auth,
        input.email.trim(),
        input.password,
      );
      if (input.displayName?.trim()) {
        await updateProfile(cred.user, { displayName: input.displayName.trim() });
      }
      const token = await cred.user.getIdToken(true);
      tokenStore.set({ accessToken: token });
      setIdToken(token);
      setFirebaseUser(cred.user);
      return hydrateSession();
    },
    [],
  );

  const resetPassword = useCallback(async (email: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase Auth is not configured');
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const signOutFirebase = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth) await signOut(auth);
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
