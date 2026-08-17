import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { WellnessProfile } from '@aquazerofit/shared';
import { restoreSession, tokenStore } from '../../lib/api';
import { isTMA } from '../../lib/telegram';
import { useProfile } from '../../lib/queries';
import { PageSpinner } from '../ui/PageSpinner';
import { ErrorState } from '../ui/ErrorState';
import { ToastProvider } from '../ui/Toast';
import { TargetsNotSetScreen } from '../../pages/auth/SetupPrompt';

interface ProfileGate {
  profile: WellnessProfile | null;
  /** False for an account that is signed in but has not set its essentials yet. */
  hasProfile: boolean;
  refetchProfile: () => void;
}

const ProfileGateContext = createContext<ProfileGate>({
  profile: null,
  hasProfile: false,
  refetchProfile: () => undefined,
});

/**
 * Profile loaded by the auth gate — null while the user has no profile yet.
 * That null is a supported, first-class app state, not a redirect trigger:
 * "signed in, essentials not supplied" is how a partially onboarded account is
 * represented everywhere in the client.
 */
export function useProfileGate(): ProfileGate {
  return useContext(ProfileGateContext);
}

/**
 * Route guard: unauthenticated users go to the marketing landing page on the
 * web, or straight to /welcome inside Telegram (where the Mini App carousel
 * and its silent auto-login belong) — in both cases preserving the intended
 * path. Also hosts the toast viewport for the whole authenticated tree.
 *
 * Authentication is the only thing gated here. A missing wellness profile used
 * to bounce the account to a four-step form before it could see anything at
 * all; it now lets the account through and each surface decides for itself
 * whether it can be truthful without one (see RequireTargets).
 *
 * `publicIndex` is the marketing page, rendered in place at `/` for an
 * unauthenticated web visitor instead of redirecting there. Redirecting is
 * right for every other guarded route — `/settings` should send you to
 * marketing and remember where you were going — but wrong for the front door.
 * `/` is the URL cold traffic and crawlers actually arrive on, and bouncing it
 * to a second URL costs a routing round before any marketing content paints,
 * splits the site's authority across two addresses, and leaves the most
 * important page in the product describing itself as a redirect. Inside
 * Telegram the redirect still wins: a Mini App user has no use for the
 * marketing page.
 *
 * It is passed in rather than imported so the landing page stays behind the
 * `lazy()` boundary App.tsx put it behind — importing it here would pull the
 * entire marketing bundle into the guard that wraps every signed-in screen.
 */
export function RequireAuth({ publicIndex }: { publicIndex?: ReactNode } = {}) {
  const location = useLocation();
  // FE-01: the access token lives in memory, so a reload starts unauthenticated
  // even with a valid session. Attempt one cookie-backed refresh on mount.
  const [restoring, setRestoring] = useState(!tokenStore.isAuthenticated);
  useEffect(() => {
    let alive = true;
    if (!tokenStore.isAuthenticated) {
      void restoreSession().then((ok) => {
        if (alive) setRestoring(false);
      });
    } else {
      setRestoring(false);
    }
    return () => {
      alive = false;
    };
  }, []);
  const isAuthed = tokenStore.isAuthenticated;
  const { data: profile, isLoading, isError, refetch } = useProfile(isAuthed && !restoring);

  if (restoring) return <PageSpinner />;

  if (!isAuthed) {
    if (publicIndex && location.pathname === '/' && !isTMA()) return <>{publicIndex}</>;
    return (
      <Navigate
        to={isTMA() ? '/welcome' : '/'}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (isLoading) return <PageSpinner />;

  if (isError) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex items-center px-container-margin">
        <div className="w-full">
          <ErrorState
            message="We could not load your profile."
            retry={() => void refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <ProfileGateContext.Provider
      value={{
        profile: profile ?? null,
        hasProfile: Boolean(profile),
        refetchProfile: () => void refetch(),
      }}
    >
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </ProfileGateContext.Provider>
  );
}

/**
 * Per-surface gate for screens whose entire content is "logs measured against a
 * target" — nutrition and progress. Those cannot be rendered honestly without
 * derived targets, and the calculator refuses to invent them, so the screen is
 * replaced by the state that says so rather than by a fabricated number or by
 * the generic "we couldn't load that" error the API 404 would otherwise
 * produce.
 *
 * It wraps the page element (inside AppLayout) rather than the whole
 * authenticated tree, so the bottom nav stays put and the account can carry on
 * to the surfaces that do work.
 */
export function RequireTargets({
  children,
  title,
  /** Sub-pages outside the tab shell need their own way back. */
  back = false,
}: {
  children: ReactNode;
  title: string;
  back?: boolean;
}) {
  const { hasProfile } = useProfileGate();
  if (!hasProfile) return <TargetsNotSetScreen title={title} back={back} />;
  return <>{children}</>;
}
