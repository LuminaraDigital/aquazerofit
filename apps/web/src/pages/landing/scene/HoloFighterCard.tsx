/**
 * Multi-plane 3D fighter roster card using strictly phrasing content inside
 * `<button>`, Corner Card 16px radii + hairline elevation (zero neon glow
 * shadows), WCAG AA `coachInkOnDark` labels, and declared portrait dimensions.
 */
import type { CoachPersona } from '@aquazerofit/shared';
import { usePointerTilt } from '../motion';
import { coachInkOnDark } from './coachContrast';

export function HoloFighterCard({
  coach,
  selected = false,
  eager = false,
  onSelect,
}: {
  coach: CoachPersona;
  selected?: boolean;
  eager?: boolean;
  onSelect?: (coach: CoachPersona) => void;
}) {
  const { ref, handlers } = usePointerTilt<HTMLButtonElement>({ maxTilt: 6 });
  const ink = coachInkOnDark(coach.colour);

  return (
    <div className="lp-perspective h-full pt-3">
      <button
        ref={ref}
        type="button"
        {...handlers}
        onClick={() => onSelect?.(coach)}
        aria-pressed={selected}
        className={`lp-tilt-plane group relative flex h-full w-full flex-col rounded-card border text-left transition-colors ${
          selected
            ? 'border-primary-fixed-dim bg-surface-container'
            : 'border-outline/75 bg-surface-container-low hover:border-outline'
        }`}
      >
        {/* Clipped background canvas inside chassis */}
        <span
          className="pointer-events-none absolute inset-0 block overflow-hidden rounded-[inherit]"
          aria-hidden="true"
        >
          <span
            className="block h-0.5 w-full"
            style={{ backgroundColor: coach.colour }}
          />
          <span
            className="absolute inset-x-0 top-0 block h-28 opacity-20"
            style={{
              background: `linear-gradient(180deg, ${coach.colour}55 0%, transparent 100%)`,
            }}
          />
          <span className="absolute inset-x-2 top-4 block select-none truncate font-heading text-[34px] font-bold uppercase leading-none text-on-surface/[0.05]">
            {coach.ringName}
          </span>
          <span className="lp-holo-foil absolute inset-0 block" />
        </span>

        {/* Full-body cutout lifted in 3D space */}
        <span className="lp-z-2 relative -mt-5 flex h-48 w-full items-end justify-center px-3">
          <img
            src={coach.art.portrait}
            alt=""
            aria-hidden="true"
            width={600}
            height={900}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-auto max-w-full object-contain object-bottom drop-shadow-[0_12px_18px_rgba(0,0,0,0.7)] transition-transform duration-200 motion-safe:group-hover:scale-[1.03]"
          />
        </span>

        {/* Corner Card fighter nameplate */}
        <span className="lp-z-1 relative mt-auto block w-full border-t border-outline-variant/50 px-4 py-3.5">
          <span className="flex items-center justify-between gap-2">
            <span
              className="font-heading text-[12px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: ink }}
            >
              {coach.ringName}
            </span>
            <span className="text-[12px] font-medium text-on-surface-variant">
              {coach.voice.word}
            </span>
          </span>
          <span className="mt-1 block font-heading text-[20px] font-semibold leading-tight text-on-surface">
            {coach.name}
          </span>
          <span className="mt-1 block line-clamp-2 text-[13px] leading-snug text-on-surface-variant">
            {coach.domain}
          </span>
          <span className="mt-2.5 flex items-center justify-between gap-2 border-t border-outline-variant/40 pt-2 text-[12px] text-on-surface-variant">
            <span className="truncate">{coach.discipline.split('-')[0]?.trim()}</span>
            <span className="shrink-0 font-semibold tabular-nums text-on-surface">
              {coach.unlock.kind === 'free' ? 'Free' : `Lv ${coach.unlock.level}`}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
