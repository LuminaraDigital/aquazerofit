/**
 * Motion primitives for the landing page.
 *
 * Everything here is one-shot and observer-driven: no scroll listeners, no
 * layout reads per frame. Pointer tilt writes CSS custom properties inside a
 * rAF so the compositor does the work (see the .lp-* rules in styles/index.css).
 *
 * Every effect degrades to "no motion, content still visible" when the user
 * prefers reduced motion — the CSS media query is the backstop, these hooks
 * simply stop doing the work.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * True once the element has scrolled into view, and true forever after —
 * entrance animations that replay on every scroll pass read as noise.
 */
export function useInView<T extends Element>(rootMargin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    /* Anything already on screen at mount is revealed without waiting for a
       callback. Above-the-fold content must never depend on an observer
       firing — a backgrounded tab, for one, delivers nothing until it is
       looked at, and hidden-by-default content that never arrives is worse
       than no animation at all. */
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin, threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}

/** Wraps children in a one-shot scroll reveal. `delay` staggers siblings. */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  /* Narrowed to 'div' for typing only: every permitted tag takes the same
     props we pass, but the union collapses the ref type to an impossible
     intersection. The runtime still renders the requested element. */
  const Tag = as as 'div';
  return (
    <Tag
      ref={ref}
      className={`lp-reveal ${inView ? 'lp-in' : ''} ${className}`}
      style={{ '--lp-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

interface TiltOptions {
  /** Maximum rotation in degrees on each axis. */
  max?: number;
  /** Resting rotation applied when the pointer is away. */
  restX?: number;
  restY?: number;
  /** Also publish --lp-mx/--lp-my for the cursor spotlight. */
  spotlight?: boolean;
}

/**
 * Pointer-driven 3D tilt. Returns props to spread onto the element that should
 * rotate; it writes --lp-rx / --lp-ry (and optionally the spotlight position)
 * rather than re-rendering React on pointer move.
 */
export function useTilt<T extends HTMLElement>({
  max = 10,
  restX = 0,
  restY = 0,
  spotlight = false,
}: TiltOptions = {}) {
  const ref = useRef<T>(null);
  const frame = useRef(0);
  const reduced = useMemo(prefersReducedMotion, []);

  const write = useCallback((rx: number, ry: number, mx: number, my: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--lp-rx', `${rx.toFixed(2)}deg`);
    el.style.setProperty('--lp-ry', `${ry.toFixed(2)}deg`);
    if (spotlight) {
      el.style.setProperty('--lp-mx', `${mx.toFixed(1)}%`);
      el.style.setProperty('--lp-my', `${my.toFixed(1)}%`);
    }
  }, [spotlight]);

  useEffect(() => {
    if (reduced) return;
    write(restX, restY, 50, 50);
    return () => cancelAnimationFrame(frame.current);
  }, [reduced, restX, restY, write]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<T>) => {
      if (reduced) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      el.dataset.active = 'true';
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() =>
        write(
          restX + (0.5 - py) * max * 2,
          restY + (px - 0.5) * max * 2,
          px * 100,
          py * 100,
        ),
      );
    },
    [max, reduced, restX, restY, write],
  );

  const onPointerLeave = useCallback(() => {
    if (reduced) return;
    const el = ref.current;
    if (el) el.dataset.active = 'false';
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => write(restX, restY, 50, 50));
  }, [reduced, restX, restY, write]);

  return { ref, tiltProps: { onPointerMove, onPointerLeave } };
}

/**
 * Counts from 0 to `value` once visible. Returns the ref to attach and the
 * current display number; jumps straight to the final value for reduced motion
 * so the figure is never withheld from the reader.
 */
export function useCountUp(value: number, duration = 1400) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo — fast commit, soft landing
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return { ref, display };
}

/**
 * Scrolls to the fragment of the current URL once that element exists.
 *
 * Needed on every marketing route because they are lazily loaded: the browser
 * gives up on `#section` long before the chunk has painted, and React Router
 * does not scroll for hash changes at all. Without this, every cross-page
 * anchor — /landing#screens from the footer, /features#targets from the
 * walkthrough — silently lands at the top of the page.
 *
 * The sections carry scroll-mt-24, which keeps them clear of the fixed header.
 */
export function useHashScroll(): void {
  const { hash } = useLocation();

  useEffect(() => {
    const id = hash.slice(1);
    if (!id) return;
    let attempts = 0;
    let raf = requestAnimationFrame(function seek() {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView();
        return;
      }
      if (attempts++ < 60) raf = requestAnimationFrame(seek);
    });
    return () => cancelAnimationFrame(raf);
  }, [hash]);
}

/** Normalised scroll progress (0→1) of the document, for the top rail. */
export function useScrollProgress(): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return progress;
}
