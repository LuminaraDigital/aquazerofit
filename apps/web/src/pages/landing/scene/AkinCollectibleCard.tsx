/**
 * Interactive 3D collectible fighter card showcasing AZH-001 (Akin Celsus,
 * "Divinus") with pointer-driven tilt, holographic foil sweep, and an
 * accessible 380ms 3D flip to Tale of the Tape.
 *
 * Accessibility & reduced-motion guarantees:
 * - Outer card is a `<div>` (never `<button>` wrapping headings/lists) so
 *   screen readers read every row of Tale of the Tape once flipped.
 * - Dedicated `min-h-[44px]` toggle buttons live on both faces; hidden face
 *   carries `aria-hidden` + `tabIndex={-1}` on its button so focus stays clean.
 * - Under `prefers-reduced-motion: reduce`, CSS swaps front/back cleanly
 *   without 3D rotation so the flip remains 100% functional.
 */
import { useEffect, useRef, useState } from 'react';
import { fetchPriorityHigh } from '@/lib/fetchPriority';
import { usePointerTilt } from '../motion';

export function AkinCollectibleCard({ className = '' }: { className?: string }) {
  const [flipped, setFlipped] = useState(false);
  const { ref, handlers } = usePointerTilt<HTMLDivElement>({ maxTilt: 8 });
  const frontBtnRef = useRef<HTMLButtonElement>(null);
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const hasFlippedRef = useRef(false);

  const flip = (next: boolean) => {
    hasFlippedRef.current = true;
    setFlipped(next);
  };

  useEffect(() => {
    if (!hasFlippedRef.current) return;
    (flipped ? backBtnRef : frontBtnRef).current?.focus();
  }, [flipped]);

  return (
    <div className={`lp-perspective mx-auto w-full max-w-[308px] ${className}`}>
      <div ref={ref} {...handlers} className="lp-tilt-plane group relative">
        <div
          data-flipped={flipped ? 'true' : 'false'}
          className="lp-flip-inner relative min-h-[430px] w-full rounded-card sm:aspect-[5/7] sm:min-h-0"
        >
          {/* Front face: official AZH-001 artwork (hero LCP on /aqua-coach) */}
          <div
            aria-hidden={flipped}
            className={`lp-flip-face lp-flip-front absolute inset-0 overflow-hidden rounded-card border border-primary-fixed-dim/45 bg-surface-container-lowest ${
              flipped ? 'pointer-events-none' : ''
            }`}
          >
            <img
              src="/cards/akin-divinus.webp"
              alt="Akin Celsus, Divinus - AZH-001 Middleweight fighter card"
              width={750}
              height={1050}
              loading="eager"
              {...fetchPriorityHigh(true)}
              decoding="async"
              className="h-full w-full object-cover"
            />
            <span className="lp-holo-foil pointer-events-none absolute inset-0" aria-hidden="true" />
            <span className="lp-sheen pointer-events-none absolute inset-0" aria-hidden="true" />
            <button
              ref={frontBtnRef}
              type="button"
              tabIndex={flipped ? -1 : 0}
              aria-pressed={flipped}
              onClick={() => flip(true)}
              className="absolute bottom-3 right-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-outline bg-surface/95 px-3.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-on-surface transition-colors hover:border-primary hover:text-primary"
            >
              Tale of the Tape
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                flip
              </span>
            </button>
          </div>

          {/* Back face: Tale of the Tape & coaching contract */}
          <div
            aria-hidden={!flipped}
            className={`lp-flip-face lp-flip-back absolute inset-0 flex flex-col justify-between overflow-y-auto rounded-card border border-primary-fixed-dim/45 bg-surface-container-low p-5 ${
              flipped ? '' : 'pointer-events-none'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-primary">
                <span>AZH-001</span>
                <span className="text-secondary">Included free</span>
              </div>
              <h2 className="mt-2 font-heading text-[26px] font-bold uppercase leading-none text-on-surface">
                Akin Celsus
              </h2>
              <p className="mt-1 text-[12px] uppercase tracking-[0.1em] text-on-surface-variant">
                “Divinus” · Melbourne, Australia
              </p>

              <dl className="mt-3 divide-y divide-outline-variant/50 border-y border-outline-variant/50 text-[13px]">
                {[
                  ['Disciplines', 'Muay Thai · Lethwei · TKD'],
                  ['Domain', 'Foundations & striking'],
                  ['Voice', 'Hungry, plain, warm'],
                  ['Unlock', 'Available from day one'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2 py-1.5">
                    <dt className="text-on-surface-variant">{k}</dt>
                    <dd className="text-right font-semibold text-on-surface">{v}</dd>
                  </div>
                ))}
              </dl>

              <blockquote className="mt-3 border-l-2 border-primary-fixed-dim/60 pl-3 text-[13px] italic leading-relaxed text-on-surface">
                “You&apos;re still here. That is the whole fight - showing up when it stops being
                exciting. Again.”
              </blockquote>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-outline-variant/50 pt-3">
              <span className="text-[12px] leading-snug text-on-surface-variant">
                Voice skin only - safety stays in code.
              </span>
              <button
                ref={backBtnRef}
                type="button"
                tabIndex={flipped ? 0 : -1}
                aria-pressed={flipped}
                onClick={() => flip(false)}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl border border-outline/80 bg-surface px-3 text-[12px] font-semibold text-on-surface transition-colors hover:border-primary hover:text-primary"
              >
                Front
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
