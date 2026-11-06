import { fetchPriorityHigh } from '@/lib/fetchPriority';

/**
 * Device frame for the real screen captures.
 *
 * The screen is a real capture of the running application, re-encoded to WebP
 * in public/screenshots, rather than markup imitating it. Most are Android
 * captures with the OS status bar cropped off.
 * A hand-built replica drifts from the product the moment either changes —
 * ours already had, within an hour of being written — and a landing page whose
 * "screenshots" are drawings is exactly the tell we are trying to avoid.
 */

/** Native pixel size of every capture: a 390x844 viewport at 2x. */
const SHOT_W = 780;
const SHOT_H = 1688;

export function DeviceFrame({
  id,
  alt,
  priority = false,
  className = '',
}: {
  id: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      // A plain bezel: the screen is the subject, so no glow or sheen competes
      // with it (docs/design.md).
      className={`relative rounded-[42px] border border-outline-variant/60 bg-surface-container-lowest p-2.5 ${className}`}
    >
      <div className="relative overflow-hidden rounded-[34px] bg-surface-container-lowest">
        <img
          src={`/screenshots/${id}.webp`}
          srcSet={`/screenshots/${id}.webp 390w, /screenshots/${id}@2x.webp 780w`}
          sizes="(min-width: 640px) 300px, 260px"
          width={SHOT_W}
          height={SHOT_H}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          // The hero device shot is the landing page's LCP element; the
          // preload scanner finds it before the tilt script runs.
          {...fetchPriorityHigh(priority)}
          decoding="async"
          className="block h-auto w-full"
        />
        {/* No drawn notch: the captures carry no status bar, so a fake one
            would land on top of the app's own header. */}
      </div>
    </div>
  );
}
