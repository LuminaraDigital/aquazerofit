/**
 * Architectural 3D perspective octagon & aqua wave grid rendered on a single
 * 2D canvas using perspective projection (fov / (fov + z)).
 *
 * Pauses rAF and detaches pointer listeners whenever scrolled offscreen or
 * hidden, redraws static frame on resize under `prefers-reduced-motion`, uses
 * `useId()` for its fallback SVG pattern, and degrades cleanly when
 * `getContext('2d')` returns null.
 */
import { useEffect, useId, useRef } from 'react';
import { prefersReducedMotion } from '../motion';

function project(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  fov: number,
): { x: number; y: number; scale: number } {
  const depth = Math.max(120, fov + z);
  const scale = fov / depth;
  return { x: cx + x * scale, y: cy + y * scale, scale };
}

export function ArenaGridCanvas({ variant = 'hero' }: { variant?: 'hero' | 'stage' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const patternId = useId();

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const rgb = '47, 217, 244';
    const rings = variant === 'hero' ? [180, 290, 410, 540] : [140, 230, 330];
    const orbitR = variant === 'hero' ? 245 : 195;

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let visible = true;
    let pointerAttached = false;

    const draw = (timeMs: number) => {
      if (!ctx || width <= 0 || height <= 0) return;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const t = reduced ? 0 : timeMs * 0.00055;
      const cx = width * (variant === 'hero' ? 0.62 : 0.5) + pointer.x * 24;
      const cy = height * (variant === 'hero' ? 0.48 : 0.54) + pointer.y * 12;
      const fov = Math.max(520, width * 0.62);
      const pitch = 0.52 + pointer.y * 0.08;
      const yaw = t * 0.35 + pointer.x * 0.16;

      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      const rot = (x: number, y: number, z: number) => {
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y2 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;
        return { x: x1, y: y2, z: z2 };
      };

      for (let ri = 0; ri < rings.length; ri++) {
        const radius = rings[ri]!;
        const wave = Math.sin(t * 1.6 - ri * 0.85) * 10;
        const floorY = 120 + wave * 0.4;
        const alpha = ri === 1 ? 0.16 : 0.085;
        ctx.beginPath();
        for (let s = 0; s <= 8; s++) {
          const angle = (s / 8) * Math.PI * 2 + Math.PI / 8;
          const p3 = rot(Math.cos(angle) * radius, floorY, Math.sin(angle) * radius);
          const p2 = project(p3.x, p3.y, p3.z + 240, cx, cy, fov);
          if (s === 0) ctx.moveTo(p2.x, p2.y);
          else ctx.lineTo(p2.x, p2.y);
        }
        ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
        ctx.lineWidth = ri === 1 ? 1.2 : 1;
        ctx.stroke();
      }

      const innerR = rings[0]!;
      const outerR = rings[rings.length - 1]!;
      ctx.beginPath();
      for (let s = 0; s < 8; s++) {
        const angle = (s / 8) * Math.PI * 2 + Math.PI / 8;
        const a3 = rot(Math.cos(angle) * innerR, 120, Math.sin(angle) * innerR);
        const b3 = rot(Math.cos(angle) * outerR, 120, Math.sin(angle) * outerR);
        const a2 = project(a3.x, a3.y, a3.z + 240, cx, cy, fov);
        const b2 = project(b3.x, b3.y, b3.z + 240, cx, cy, fov);
        ctx.moveTo(a2.x, a2.y);
        ctx.lineTo(b2.x, b2.y);
      }
      ctx.strokeStyle = `rgba(${rgb}, 0.075)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const ripple = Math.sin(a * 4 + t * 2.2) * 8;
        const p3 = rot(Math.cos(a) * orbitR, -38 + ripple, Math.sin(a) * orbitR);
        const p2 = project(p3.x, p3.y, p3.z + 240, cx, cy, fov);
        if (i === 0) ctx.moveTo(p2.x, p2.y);
        else ctx.lineTo(p2.x, p2.y);
      }
      ctx.strokeStyle = `rgba(${rgb}, 0.13)`;
      ctx.lineWidth = 1.05;
      ctx.stroke();

      for (let s = 0; s < 8; s++) {
        const angle = (s / 8) * Math.PI * 2 + Math.PI / 8;
        const p3 = rot(Math.cos(angle) * rings[1]!, 120, Math.sin(angle) * rings[1]!);
        const p2 = project(p3.x, p3.y, p3.z + 240, cx, cy, fov);
        const rad = Math.max(1.2, 2.1 * p2.scale);
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, rad, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb}, 0.32)`;
        ctx.fill();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || reduced) return;
      pointer.tx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      pointer.ty = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };

    const stopLoop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (pointerAttached) {
        window.removeEventListener('pointermove', onPointerMove);
        pointerAttached = false;
      }
    };

    const tick = (now: number) => {
      raf = 0;
      draw(now);
      if (!reduced && visible && !document.hidden) {
        raf = requestAnimationFrame(tick);
      }
    };

    const startLoop = () => {
      if (reduced || !visible || document.hidden) return;
      if (!pointerAttached) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        pointerAttached = true;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      draw(reduced ? 0 : performance.now());
    };

    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          visible = entries.some((e) => e.isIntersecting);
          if (visible) startLoop();
          else stopLoop();
        },
        { threshold: 0.01 },
      );
      io.observe(container);
    }

    resize();
    startLoop();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopLoop();
      io?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [variant]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.06]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id={patternId} width="64" height="64" patternUnits="userSpaceOnUse">
            <path d="M 64 0 L 0 0 0 64" fill="none" stroke="currentColor" strokeWidth="0.75" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} className="text-primary" />
      </svg>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_38%,rgb(var(--azf-surface))_92%)]" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-surface to-transparent" />
    </div>
  );
}
