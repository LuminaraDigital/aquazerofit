import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Make `/settings#some-id` actually land on `#some-id`.
 *
 * React Router owns the URL and never acts on the fragment, so a deep link
 * from elsewhere in the app (the weekly insight card points at the AI
 * personalisation consent) drops the user at the top of a long page to hunt
 * for the control. This hook closes that.
 *
 * Three things make it more than a `useEffect` + `scrollIntoView`:
 *
 *  - The target usually does not exist yet. Settings renders a spinner until
 *    the profile query resolves, so an effect that runs at mount finds
 *    nothing and a naive implementation silently does nothing on a cold load
 *    — exactly the case a deep link hits. We wait for the node with a
 *    MutationObserver, bounded by a deadline so we never observe forever.
 *  - Motion is a preference. `prefers-reduced-motion` swaps the smooth scroll
 *    for an instant jump (the stylesheet cancels `scroll-behavior: smooth`
 *    for the same user, so `behavior` alone would not be enough).
 *  - Colour is not the only signal. The highlight is paired with moving focus
 *    to the section, so assistive tech announces the arrival too.
 */

const HIGHLIGHT_CLASS = 'azf-hash-target';

/** Slightly longer than the CSS fade, so the ring is never cut off mid-fade. */
const HIGHLIGHT_MS = 2600;

/** How long to keep waiting for a target that has not rendered yet. */
const WAIT_FOR_TARGET_MS = 5000;

/**
 * How long to keep correcting the scroll after the first attempt.
 *
 * Scrolling once, when the node appears, is not enough. The observer fires on
 * the mutation that inserts the section, and at that instant the rest of the
 * page has not been laid out — the document is barely taller than the viewport,
 * so the browser clamps the scroll target to roughly zero and `scrollIntoView`
 * silently does nothing. Moments later the page grows past 2000px and the
 * section is far below the fold, with the scroll position still at the top.
 *
 * This is invisible to jsdom, which has no layout and no-ops `scrollIntoView`
 * regardless, so it cannot be caught by a unit test — it was found by driving
 * the real page.
 */
const SETTLE_BUDGET_MS = 1200;

/** Frames of an unchanged scroll position taken to mean "no longer moving". */
const STATIONARY_FRAMES = 3;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useHashTarget(targetId: string): void {
  const { hash } = useLocation();

  useEffect(() => {
    if (typeof document === 'undefined' || !hash) return;

    let fragment: string;
    try {
      fragment = decodeURIComponent(hash);
    } catch {
      fragment = hash;
    }
    if (fragment.replace(/^#/, '') !== targetId) return;

    let observer: MutationObserver | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    let highlightTimer: ReturnType<typeof setTimeout> | null = null;
    let highlighted: HTMLElement | null = null;
    let settleFrame: number | null = null;

    function stopWaiting(): void {
      observer?.disconnect();
      observer = null;
      if (deadlineTimer !== null) clearTimeout(deadlineTimer);
      deadlineTimer = null;
    }

    function stopSettling(): void {
      if (settleFrame !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(settleFrame);
      }
      settleFrame = null;
    }

    function inView(element: HTMLElement): boolean {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight;
    }

    function atScrollEnd(): boolean {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return window.scrollY >= max - 1;
    }

    function scrollTo(element: HTMLElement, behavior: ScrollBehavior): void {
      // Guarded because jsdom (and very old WebViews) do not implement it.
      element.scrollIntoView?.({ block: 'start', behavior });
    }

    /**
     * Keep checking that the target actually ended up on screen, and correct it
     * if the page grew underneath the first attempt.
     *
     * Corrections only fire once the scroll position has stopped changing, so a
     * smooth scroll that is simply still animating is left alone rather than
     * being fought frame by frame. The correction itself is instant: by then
     * the first attempt has demonstrably failed, and a second animation would
     * just be a slower way to arrive.
     */
    function settle(element: HTMLElement): void {
      if (typeof requestAnimationFrame !== 'function') return;
      const startedAt = Date.now();
      let lastY = window.scrollY;
      let stationary = 0;

      const step = (): void => {
        settleFrame = null;
        if (inView(element) || atScrollEnd() || Date.now() - startedAt > SETTLE_BUDGET_MS) return;

        stationary = window.scrollY === lastY ? stationary + 1 : 0;
        lastY = window.scrollY;
        if (stationary >= STATIONARY_FRAMES) {
          scrollTo(element, 'instant');
          stationary = 0;
        }
        settleFrame = requestAnimationFrame(step);
      };
      settleFrame = requestAnimationFrame(step);
    }

    function reveal(element: HTMLElement): void {
      const reduced = prefersReducedMotion();
      scrollTo(element, reduced ? 'instant' : 'smooth');
      settle(element);
      element.classList.add(HIGHLIGHT_CLASS);
      highlighted = element;
      // preventScroll: the scroll above already framed it with scroll-margin.
      element.focus?.({ preventScroll: true });
      highlightTimer = setTimeout(() => {
        element.classList.remove(HIGHLIGHT_CLASS);
        highlighted = null;
      }, HIGHLIGHT_MS);
    }

    function attempt(): boolean {
      const element = document.getElementById(targetId);
      if (!element) return false;
      reveal(element);
      return true;
    }

    if (!attempt()) {
      observer = new MutationObserver(() => {
        if (attempt()) stopWaiting();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      deadlineTimer = setTimeout(stopWaiting, WAIT_FOR_TARGET_MS);
    }

    return () => {
      stopWaiting();
      stopSettling();
      if (highlightTimer !== null) clearTimeout(highlightTimer);
      highlighted?.classList.remove(HIGHLIGHT_CLASS);
    };
  }, [hash, targetId]);
}
