import { fetchPriorityHigh } from '@/lib/fetchPriority';
import { usePointerTilt } from './motion';

/**
 * Canonical catalogue of real Android release captures under `public/screenshots/`.
 * Typing `DeviceFrame` against this list eliminates regex scraping in
 * `screenshots.test.ts` and makes a missing capture a compile-time error.
 */
export const SCREENSHOT_IDS = [
  'dashboard',
  'nutrition',
  'coach',
  'recipe',
  'workouts',
  'progress',
  'capture-meal',
  'settings',
] as const;

export type ScreenshotId = (typeof SCREENSHOT_IDS)[number];

/** Native pixel size of every capture: a 390x844 viewport at 2x. */
const SHOT_W = 780;
const SHOT_H = 1688;

/**
 * Tactile 3D hardware chassis for real Android release screenshots.
 *
 * Tilts smoothly on desktop pointer hover via CSS custom properties (zero React
 * re-renders) and optional flush Corner Card caption rail below the hardware.
 */
export function DeviceFrame({
  id,
  alt,
  priority = false,
  className = '',
  interactive = true,
  maxTilt = 6,
  caption,
}: {
  id: ScreenshotId;
  alt: string;
  priority?: boolean;
  className?: string;
  interactive?: boolean;
  maxTilt?: number;
  /** Quiet Corner Card caption rendered flush beneath the bezel (no floating pill). */
  caption?: string;
}) {
  const { ref, handlers } = usePointerTilt<HTMLDivElement>({
    maxTilt,
    disabled: !interactive,
  });

  return (
    <figure className={`lp-perspective ${className}`}>
      <div
        ref={ref}
        {...handlers}
        className="lp-tilt-plane group relative rounded-[40px] border border-outline/60 bg-surface-container-lowest p-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_20px_44px_-24px_rgba(0,0,0,0.85)]"
      >
        <span
          className="pointer-events-none absolute -right-[2px] top-24 h-12 w-[2px] rounded-r bg-outline/50"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute -left-[2px] top-20 h-9 w-[2px] rounded-l bg-outline/40"
          aria-hidden="true"
        />

        <div className="relative overflow-hidden rounded-[31px] border border-outline-variant/60 bg-surface-container-lowest">
          <img
            src={`/screenshots/${id}.webp`}
            srcSet={`/screenshots/${id}.webp 390w, /screenshots/${id}@2x.webp 780w`}
            sizes="(min-width: 640px) 320px, 272px"
            width={SHOT_W}
            height={SHOT_H}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            {...fetchPriorityHigh(priority)}
            decoding="async"
            className="block h-auto w-full"
          />
          {interactive && (
            <span
              className="lp-sheen pointer-events-none absolute inset-0"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {caption && (
        <figcaption className="mt-3 flex items-center justify-between border-t border-outline-variant/50 pt-2.5 text-[12px] text-on-surface-variant">
          <span className="stat-label text-primary">{caption}</span>
          <span className="text-[12px] text-outline">Android capture</span>
        </figcaption>
      )}
    </figure>
  );
}
