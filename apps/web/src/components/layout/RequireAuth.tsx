import { createContext, useContext } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { WellnessProfile } from '@aquazerofit/shared';
import { tokenStore } from '../../lib/api';
import { useProfile } from '../../lib/queries';
import { PageSpinner } from '../ui/PageSpinner';
import { ErrorState } from '../ui/ErrorState';
import { ToastProvider } from '../ui/Toast';

interface ProfileGate {
  profile: WellnessProfile | null;
  refetchProfile: () => void;
}

const ProfileGateContext = createContext<ProfileGate>({
  profile: null,
  refetchProfile: () => undefined,
});

/** Profile loaded by the auth gate — null while the user has no profile yet. */
export function useProfileGate(): ProfileGate {
  return useContext(ProfileGateContext);
}

/**
 * Route guard: unauthenticated users go to /welcome (preserving the intended
 * path); authenticated users without a wellness profile go to /onboarding.
 * Also hosts the toast viewport for the whole authenticated tree.
 */
export function RequireAuth() {
  const location = useLocation();
  const isAuthed = tokenStore.isAuthenticated;
  const { data: profile, isLoading, isError, refetch } = useProfile(isAuthed);

  if (!isAuthed) {
    return (
      <Navigate
        to="/welcome"
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

  const hasProfile = Boolean(profile);
  const onOnboarding = location.pathname.startsWith('/onboarding');

  if (!hasProfile && !onOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <ProfileGateContext.Provider
      value={{ profile: profile ?? null, refetchProfile: () => void refetch() }}
    >
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </ProfileGateContext.Provider>
  );
}
