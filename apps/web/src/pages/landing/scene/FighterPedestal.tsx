/**
 * Canonical 3D full-body fighter pedestal shared by CornerStage (`/`) and
 * FighterLockerRoom (`/aqua-coach`).
 *
 * Uses Corner Card tonal surfaces + hairline borders (zero neon glow shadows),
 * WCAG AA `coachInkOnDark` text contrast, declared portrait dimensions
 * (`600x900`) to prevent CLS, and keeps interactive gear-toggle controls
 * outside any tilted button plane so click targets stay rock-steady.
 */
import type { CoachPersona } from '@aquazerofit/shared';
import { usePointerTilt } from '../motion';
import { coachInkOnDark } from './coachContrast';

const PORTRAIT_W = 600;
const PORTRAIT_H = 900;

export function FighterPedestal({
  coach,
  showVariant = false,
  onToggleVariant,
  footer,
  heightClass = 'h-[260px]',
}: {
  coach: CoachPersona;
  showVariant?: boolean;
  onToggleVariant?: () => void;
  footer?: React.ReactNode;
  heightClass?: string;
}) {
  const { ref, handlers } = usePointerTilt<HTMLDivElement>({ maxTilt: 6 });
  const ink = coachInkOnDark(coach.colour);
  const portraitSrc =
    showVariant && coach.art.variant ? coach.art.variant : coach.art.portrait;

  return (
    <div className="flex h-full flex-col rounded-card border border-outline-variant/75 bg-surface-container-low p-4">
      {/* Header row stays static outside the tilt plane (Fitts's Law) */}
      <div className="flex min-h-[44px] items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className="h-3 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: coach.colour }}
            aria-hidden="true"
          />
          <span
            className="font-heading text-[13px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: ink }}
          >
            {coach.ringName}
          </span>
        </span>

        {coach.art.variant && onToggleVariant ? (
          <button
            type="button"
            onClick={onToggleVariant}
            aria-pressed={showVariant}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-outline/80 bg-surface px-3 text-[12px] font-semibold text-on-surface transition-colors hover:border-primary"
          >
            {showVariant ? 'Default look' : 'Alt gear'}
          </button>
        ) : (
          <span className="text-[12px] font-medium text-on-surface-variant">
            {coach.unlock.kind === 'free' ? 'Included' : `Lv ${coach.unlock.level}`}
          </span>
        )}
      </div>

      {/* Tilting 3D portrait stage strictly for visual media */}
      <div className="lp-perspective mt-2 flex-1">
        <div
          ref={ref}
          {...handlers}
          className="lp-tilt-plane group relative flex h-full flex-col items-center justify-end rounded-xl border border-outline-variant/50 bg-surface px-3 pt-4"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            <div className="h-0.5 w-full" style={{ backgroundColor: coach.colour }} />
            <div
              className="absolute inset-x-0 top-0 h-32 opacity-20"
              style={{
                background: `linear-gradient(180deg, ${coach.colour}55 0%, transparent 100%)`,
              }}
            />
            <span
              className="absolute inset-x-3 top-5 select-none overflow-hidden text-ellipsis whitespace-nowrap text-center font-heading text-[32px] font-bold uppercase leading-none text-on-surface/[0.055]"
              aria-hidden="true"
            >
              {coach.ringName}
            </span>
            <span className="lp-holo-foil absolute inset-0" />
          </div>

          <div className={`lp-z-2 relative flex ${heightClass} items-end justify-center`}>
            <img
              key={portraitSrc}
              src={portraitSrc}
              alt={`${coach.name}, ${coach.ringName} - ${coach.domain}`}
              width={PORTRAIT_W}
              height={PORTRAIT_H}
              loading="lazy"
              decoding="async"
              className="h-full w-auto object-contain object-bottom drop-shadow-[0_14px_20px_rgba(0,0,0,0.7)] transition-transform duration-200 motion-safe:group-hover:scale-[1.02]"
            />
          </div>
        </div>
      </div>

      {footer && (
        <div className="mt-3 border-t border-outline-variant/50 pt-3">{footer}</div>
      )}
    </div>
  );
}
