/**
 * Interactive Akin stage: idle float + crossfading poses on a timer,
 * click/tap to advance, hover to intensify. Honours prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AKIN_POSES,
  AQUA_CHARACTER,
  type AkinPose,
} from '@aquazerofit/shared';
import { poseUrl } from './AquaMascot';

const CYCLE_MS = 4200;
const POSE_ORDER: AkinPose[] = [...AKIN_POSES];

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AkinStage({
  className = '',
  autoPlay = true,
  showControls = true,
  showCaption = true,
  size = 'hero',
}: {
  className?: string;
  autoPlay?: boolean;
  showControls?: boolean;
  showCaption?: boolean;
  size?: 'lg' | 'hero';
}) {
  const [pose, setPose] = useState<AkinPose>('idle');
  const [prev, setPrev] = useState<AkinPose | null>(null);
  const [hover, setHover] = useState(false);
  const [paused, setPaused] = useState(false);
  const poseRef = useRef(pose);
  const reducedRef = useRef(prefersReducedMotion());
  poseRef.current = pose;

  const advance = (next?: AkinPose) => {
    const current = poseRef.current;
    const idx = POSE_ORDER.indexOf(current);
    const chosen = next ?? POSE_ORDER[(idx + 1) % POSE_ORDER.length]!;
    if (chosen === current) return;
    setPrev(current);
    setPose(chosen);
  };

  useEffect(() => {
    if (!autoPlay || paused || reducedRef.current) return;
    const id = window.setInterval(
      () => advance(),
      hover ? CYCLE_MS * 0.65 : CYCLE_MS,
    );
    return () => window.clearInterval(id);
  }, [autoPlay, paused, hover]);

  useEffect(() => {
    if (!prev) return;
    const id = window.setTimeout(() => setPrev(null), 520);
    return () => window.clearTimeout(id);
  }, [prev, pose]);

  useEffect(() => {
    for (const p of POSE_ORDER) {
      const img = new Image();
      img.src = poseUrl(p);
    }
  }, []);

  const frame =
    size === 'hero'
      ? 'h-52 w-36 sm:h-72 sm:w-48'
      : 'h-40 w-28 sm:h-48 sm:w-36';

  const meta = AQUA_CHARACTER.poses[pose];

  const pauseBriefly = () => {
    setPaused(true);
    window.setTimeout(() => setPaused(false), CYCLE_MS);
  };

  return (
    <div className={`akin-stage relative select-none ${className}`}>
      <button
        type="button"
        className={`akin-stage-frame relative ${frame} overflow-hidden rounded-2xl bg-black/50 outline-none ring-primary/0 transition-[box-shadow,transform] duration-300 focus-visible:ring-2 ${
          hover
            ? 'shadow-[0_0_36px_rgba(47,217,244,0.45)]'
            : 'shadow-[0_0_24px_rgba(47,217,244,0.28)]'
        }`}
        aria-label={`${AQUA_CHARACTER.name}, ${meta.label}. Click to change pose.`}
        onClick={() => {
          pauseBriefly();
          advance();
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        <div
          className={`akin-bob absolute inset-0 ${hover ? 'akin-bob-fast' : ''} ${
            reducedRef.current ? 'akin-bob-off' : ''
          }`}
        >
          {prev && (
            <img
              key={`out-${prev}`}
              src={poseUrl(prev)}
              alt=""
              aria-hidden="true"
              className="akin-pose akin-pose-out absolute inset-0 h-full w-full object-contain object-bottom"
              draggable={false}
            />
          )}
          <img
            key={`in-${pose}`}
            src={poseUrl(pose)}
            alt=""
            aria-hidden="true"
            className="akin-pose akin-pose-in absolute inset-0 h-full w-full object-contain object-bottom"
            draggable={false}
          />
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
      </button>

      {(showCaption || showControls) && (
        <div className="mt-3 space-y-2">
          {showCaption && (
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="font-heading text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                  {AQUA_CHARACTER.name}
                </p>
                <p className="text-xs text-on-surface-variant/80">
                  {meta.label} · {meta.hint}
                </p>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/60">
                Tap to switch
              </p>
            </div>
          )}

          {showControls && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Akin poses">
              {POSE_ORDER.map((p) => {
                const active = p === pose;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      pauseBriefly();
                      advance(p);
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                      active
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-container-high/60 text-on-surface-variant hover:text-on-surface'
                    }`}
                    aria-pressed={active}
                  >
                    {AQUA_CHARACTER.poses[p].label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
