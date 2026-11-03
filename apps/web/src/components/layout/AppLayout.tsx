import { lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from '../ui/BottomNav';
import { ErrorBoundary } from './ErrorBoundary';

const AppBackground = lazy(() =>
  import('./AppBackground').then((m) => ({ default: m.AppBackground })),
);
const DesktopAmbient = lazy(() =>
  import('./DesktopAmbient').then((m) => ({ default: m.DesktopAmbient })),
);

/**
 * Mobile-first shell: WebGL background layers + centered column + bottom nav.
 * Pages own their content; this provides the atmospheric backdrop and nav.
 * The boundary wraps only the page outlet, so a crashing screen leaves the
 * bottom nav standing and every other tab reachable.
 */
export function AppLayout() {
  const { pathname } = useLocation();
  return (
    <>
      <Suspense fallback={null}>
        <AppBackground />
      </Suspense>
      <div className="azf-content max-w-md mx-auto min-h-screen relative safe-bottom">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
        <BottomNav />
      </div>
      <Suspense fallback={null}>
        <DesktopAmbient />
      </Suspense>
    </>
  );
}