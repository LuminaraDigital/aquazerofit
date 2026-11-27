/**
 * Interactive 5-Belt Consistency Rail backed by `BELT_LADDER` and
 * `SEASON_LENGTH_DAYS` from `@aquazerofit/shared`, reusing canonical
 * `BeltBadge`, `BELT_COLOUR`, and `beltName` from `@/lib/fightRecord`.
 *
 * Interactive buttons stay rock-steady (Fitts's Law) with Corner Card 16px/8px
 * radii and hairline states.
 */
import { useState } from 'react';
import { BELT_LADDER, SEASON_LENGTH_DAYS, type BeltTier } from '@aquazerofit/shared';
import { BeltBadge } from '@/components/fightRecord/BeltBadge';
import { BELT_COLOUR, beltName } from '@/lib/fightRecord';

const BELT_NOTE: Record<BeltTier, string> = {
  white: 'First week on the mat - three logged days puts your season on the board.',
  blue: 'Steady rhythm forming across the first month without chasing perfection.',
  purple: 'Three active days a week across the season - the durable habit line.',
  brown: 'Five days a week of showing up cleanly across meals, water or training.',
  black: 'Six days in seven across eight weeks - with a built-in rest day every week.',
};

export function BeltRail() {
  const [selected, setSelected] = useState<BeltTier>('purple');
  const activeRung = BELT_LADDER.find((b) => b.tier === selected) ?? BELT_LADDER[2]!;

  return (
    <div className="lp-panel p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-outline-variant/50 pb-5">
        <div>
          <p className="stat-label text-primary">
            Fight Record · {SEASON_LENGTH_DAYS}-Day Seasons
          </p>
          <h3 className="mt-1.5 font-heading text-[clamp(1.6rem,1.25rem+1.4vw,2.25rem)] font-semibold leading-tight text-on-surface">
            Earned by showing up. Never by eating less.
          </h3>
        </div>
        <p className="max-w-[34em] text-[14px] leading-relaxed text-on-surface-variant">
          A belt counts active days - never weight lost or calories restricted - and once earned,
          a belt is never taken away.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5" role="group" aria-label="Consistency belt ladder">
        {BELT_LADDER.map((rung) => {
          const isSelected = rung.tier === selected;
          return (
            <button
              key={rung.tier}
              type="button"
              onClick={() => setSelected(rung.tier)}
              aria-pressed={isSelected}
              className={`flex min-h-[120px] w-full flex-col items-center rounded-xl border p-3.5 text-center transition-colors ${
                isSelected
                  ? 'border-primary-fixed-dim bg-surface-container-highest/90'
                  : 'border-outline/75 bg-surface hover:border-primary'
              }`}
            >
              <span className="flex h-14 w-full items-center justify-center rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-2">
                <BeltBadge tier={rung.tier} size="md" decorative />
              </span>
              <span className="mt-3 block font-heading text-[16px] font-semibold uppercase leading-none text-on-surface">
                {rung.tier}
              </span>
              <span className="mt-1 block text-[12px] tabular-nums text-on-surface-variant">
                {rung.activeDays} / {SEASON_LENGTH_DAYS} days
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant/60 bg-surface px-4 py-3 text-[14px]">
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-outline/60"
            style={{ backgroundColor: BELT_COLOUR[activeRung.tier] }}
            aria-hidden="true"
          />
          <span className="font-semibold text-on-surface">{beltName(activeRung.tier)}:</span>
          <span className="text-on-surface-variant">{BELT_NOTE[activeRung.tier]}</span>
        </div>
        <span className="stat-label tabular-nums text-primary">
          {activeRung.activeDays} active days
        </span>
      </div>
    </div>
  );
}
