/**
 * Motion and 3D pointer primitives for the marketing surface.
 *
 * Everything here is observer-driven or rAF-batched directly onto DOM refs /
 * CSS custom properties (`--lp-rx`, `--lp-ry`, `--lp-gx`, `--lp-gy`) with zero
 * React re-renders per scroll or pointer frame.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
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

/** One-shot viewport entrance observer with generous bottom margin (+80px). */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      setInView(true);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 80 && rect.bottom > -40) {
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
      { rootMargin: '0px 0px 80px 0px', threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}

function resetTilt(el: HTMLElement): void {
  delete el.dataset.tilting;
  el.style.setProperty('--lp-rx', '0deg');
  el.style.setProperty('--lp-ry', '0deg');
  el.style.setProperty('--lp-gx', '50%');
  el.style.setProperty('--lp-gy', '22%');
}

/**
 * Hardware-accelerated 3D pointer tilt driven strictly via CSS custom
 * properties inside a single requestAnimationFrame (measuring layout inside
 * the rAF rather than on raw 1000Hz pointer events).
 */
export function usePointerTilt<T extends HTMLElement>({
  maxTilt = 7,
  disabled = false,
}: {
  maxTilt?: number;
  disabled?: boolean;
} = {}) {
  const ref = useRef<T>(null);
  const rafRef = useRef<number>(0);
  const latestRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (disabled && ref.current) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      resetTilt(ref.current);
    }
  }, [disabled]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (disabled || event.pointerType === 'touch' || prefersReducedMotion()) return;
      latestRef.current = { x: event.clientX, y: event.clientY };
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const el = ref.current;
        const pt = latestRef.current;
        if (!el || !pt) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const px = Math.max(0, Math.min(1, (pt.x - rect.left) / rect.width));
        const py = Math.max(0, Math.min(1, (pt.y - rect.top) / rect.height));
        const rx = (0.5 - py) * maxTilt * 2;
        const ry = (px - 0.5) * maxTilt * 2;

        el.dataset.tilting = 'true';
        el.style.setProperty('--lp-rx', `${rx.toFixed(2)}deg`);
        el.style.setProperty('--lp-ry', `${ry.toFixed(2)}deg`);
        el.style.setProperty('--lp-gx', `${(px * 100).toFixed(1)}%`);
        el.style.setProperty('--lp-gy', `${(py * 100).toFixed(1)}%`);
      });
    },
    [disabled, maxTilt],
  );

  const onPointerReset = useCallback(() => {
    latestRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (ref.current) resetTilt(ref.current);
  }, []);

  return {
    ref,
    handlers: {
      onPointerMove,
      onPointerLeave: onPointerReset,
      onPointerCancel: onPointerReset,
    },
  };
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

/** Scrolls to the URL hash fragment once a lazily loaded marketing route mounts. */
export function useHashScroll(): void {
  const { hash } = useLocation();

  useEffect(() => {
    const id = hash.slice(1);
    if (!id) return;
    let attempts = 0;
    let raf = requestAnimationFrame(function seek() {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        return;
      }
      if (attempts++ < 60) raf = requestAnimationFrame(seek);
    });
    return () => cancelAnimationFrame(raf);
  }, [hash]);
}

/**
 * Reading-progress rail written directly to a DOM ref inside rAF so TopBar
 * never re-renders or re-reads localStorage attribution while scrolling.
 */
export function ScrollProgressRail() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = barRef.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      el.style.transform = `scaleX(${p})`;
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

  return (
    <div
      ref={barRef}
      className="h-px origin-left bg-primary/70"
      style={{ transform: 'scaleX(0)' }}
      aria-hidden="true"
    />
  );
}
