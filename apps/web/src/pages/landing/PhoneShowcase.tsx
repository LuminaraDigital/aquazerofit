import { useTilt } from './motion';
import { fetchPriorityHigh } from '@/lib/fetchPriority';

/**
 * Device frame and hero product shot.
 *
 * The screen is a real capture of the running application (docs/screenshots,
 * re-encoded to WebP in public/screenshots) rather than markup imitating it.
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
      className={`relative rounded-[42px] border border-white/10 bg-[#0b1113] p-2.5 shadow-[0_60px_120px_-40px_rgba(0,0,0,0.95),0_0_80px_-40px_rgba(47,217,244,0.5)] ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[42px] bg-gradient-to-br from-white/12 via-transparent to-transparent"
        aria-hidden="true"
      />
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
        {/* No drawn notch: these are browser captures with no OS status bar, so
            a fake one would land on top of the app's own header. */}
      </div>
    </div>
  );
}

export function PhoneShowcase() {
  const { ref, tiltProps } = useTilt<HTMLDivElement>({ max: 9, restX: 7, restY: -16 });

  return (
    <div className="lp-stage select-none">
      <div ref={ref} {...tiltProps} className="lp-device relative mx-auto w-[272px] sm:w-[300px]">
        <DeviceFrame
          id="dashboard"
          alt="The AquaZeroFit dashboard: calories remaining on a progress ring, macro split for the day, and hydration logged in 250 ml steps."
          priority
        />

        {/* Callouts, lifted off the device face in Z so the parallax is real */}
        <div className="lp-layer-2 absolute -left-14 top-24 hidden w-[190px] rounded-2xl border border-primary/25 bg-[rgba(16,24,26,0.92)] p-3 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)] sm:block">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">
              photo_camera
            </span>
            <span className="text-[11px] font-semibold text-on-surface">Photo analysed</span>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-on-surface-variant/70">
            Grilled salmon, quinoa, broccoli — 612 kcal
          </p>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] text-primary">
              Confirm
            </span>
            <span className="rounded-full bg-white/6 px-2 py-0.5 text-[9px] text-on-surface-variant/70">
              Edit
            </span>
          </div>
          <p className="mt-2 text-[9px] uppercase tracking-wider text-on-surface-variant/70">
            Never logged without you
          </p>
        </div>

        <div className="lp-layer-3 absolute -right-12 bottom-24 hidden w-[176px] rounded-2xl border border-secondary/25 bg-[rgba(16,24,26,0.92)] p-3 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)] sm:block">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-[16px] text-secondary"
              aria-hidden="true"
            >
              auto_awesome
            </span>
            <span className="text-[11px] font-semibold text-on-surface">Aqua Coach</span>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-on-surface-variant/70">
            You have around 1,135 kcal left — a 30 g protein snack fits well.
          </p>
        </div>
      </div>
    </div>
  );
}
