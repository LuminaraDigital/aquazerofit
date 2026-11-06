import { lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from '../ui/BottomNav';
import { ErrorBoundary } from './ErrorBoundary';

const DesktopAmbient = lazy(() =>
  import('./DesktopAmbient').then((m) => ({ default: m.DesktopAmbient })),
);

/**
 * Mobile-first shell: a centred column on the flat ground, plus the bottom
 * nav. Pages own their content.
 * The boundary wraps only the page outlet, so a crashing screen leaves the
 * bottom nav standing and every other tab reachable.
 */
export function AppLayout() {
  const { pathname } = useLocation();
  return (
    <>
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