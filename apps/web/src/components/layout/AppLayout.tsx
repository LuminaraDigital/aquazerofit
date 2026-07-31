import { Outlet } from 'react-router-dom';
import { BottomNav } from '../ui/BottomNav';
import { AppBackground } from './AppBackground';

/**
 * Mobile-first shell: WebGL background layers + centered column + bottom nav.
 * Pages own their content; this provides the atmospheric backdrop and nav.
 */
export function AppLayout() {
  return (
    <>
      <AppBackground />
      <div className="azf-content max-w-md mx-auto min-h-screen relative safe-bottom">
        <Outlet />
        <BottomNav />
      </div>
    </>
  );
}