import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Client-side navigations keep the previous scroll offset. In the Mini App
 * that lands Progress, Profile and Meal Plan mid-page.
 *
 * useLayoutEffect, not useEffect: child effects (settings hash targets, the
 * coach thread pin) run afterwards and can move the page to where that
 * screen actually belongs. A parent effect would run last and undo them.
 */
export function scrollAppToTop(): void {
  // scrollTo throws in jsdom ("Not implemented"). The scrollTop writes are the
  // part that has to run either way, including inside unit tests.
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  } catch {
    // Ignore hosts that advertise scrollTo and then refuse the call.
  }
  for (const node of [document.scrollingElement, document.documentElement, document.body]) {
    if (node) node.scrollTop = 0;
  }
}

export function ScrollToTop(): null {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    scrollAppToTop();
  }, [pathname]);
  return null;
}
