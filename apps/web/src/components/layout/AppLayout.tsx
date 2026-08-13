import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from '../ui/BottomNav';
import { AppBackground } from './AppBackground';
import { ErrorBoundary } from './ErrorBoundary';

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
      <AppBackground />
      <div className="azf-content max-w-md mx-auto min-h-screen relative safe-bottom">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
        <BottomNav />
      </div>
    </>
  );
}