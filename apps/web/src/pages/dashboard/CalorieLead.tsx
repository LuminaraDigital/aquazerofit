import type { DailyNutrition } from '@aquazerofit/shared';
import { fmtInt } from '@/lib/format';
import { clampPct } from './lib';

const MACROS = [
  { key: 'proteinG', label: 'Protein', dot: 'bg-secondary' },
  { key: 'carbsG', label: 'Carbs', dot: 'bg-primary' },
  { key: 'fatG', label: 'Fat', dot: 'bg-tertiary-container' },
] as const;

/** Protein, carbs and fat as ruled rows: label left, figure right, hairlines between. */
function MacroRows({ daily, large }: { daily: DailyNutrition; large: boolean }) {
  return (
    <ul className="divide-y divide-outline-variant">
      {MACROS.map(({ key, label, dot }) => (
        <li key={key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="stat-label flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
            {label}
          </span>
          <span
            className={`tabular-nums font-bold text-on-surface ${large ? 'text-xl' : 'text-base'}`}
          >
            {Math.round(daily[key].consumed)}/{Math.round(daily[key].target)}g
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The lead card's body, shared by Today and Nutrition so both clients read the
 * same: a scoreboard figure for what is left, then the macros as ruled rows.
 * `today` sets the figure beside the macros; `day` stacks them with the
 * "eaten of goal" line between, as Android Nutrition does.
 */
export function CalorieLead({ daily, variant }: { daily: DailyNutrition; variant: 'today' | 'day' }) {
  const left = fmtInt(Math.max(0, daily.kcalRemaining));
  const eaten = `${fmtInt(daily.kcalConsumed)} eaten of ${fmtInt(daily.kcalTarget)} goal`;
  const burned = daily.kcalBurned > 0 ? ` · ${fmtInt(daily.kcalBurned)} burned` : '';
  const sentence = `Goal ${fmtInt(daily.kcalTarget)} minus food ${fmtInt(daily.kcalConsumed)} plus exercise ${fmtInt(daily.kcalBurned)} equals ${fmtInt(daily.kcalRemaining)} remaining`;

  if (variant === 'day') {
    return (
      <div>
        <p className="sr-only">{sentence}</p>
        <p className="stat-label">Remaining</p>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="scoreboard">{left}</span>
          <span className="text-base text-on-surface-variant">kcal</span>
        </p>
        <p className="mt-2 text-base tabular-nums text-on-surface-variant">
          {eaten}
          {burned}
        </p>
        <div className="mt-5">
          <MacroRows daily={daily} large />
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="sr-only">{sentence}</p>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-6">
        <div>
          <p className="scoreboard">{left}</p>
          <p className="stat-label mt-2">kcal left</p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-container-highest" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary-fixed-dim transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${clampPct(daily.kcalConsumed, daily.kcalTarget)}%` }}
            />
          </div>
        </div>
        <MacroRows daily={daily} large={false} />
      </div>
      <p className="mt-4 text-sm tabular-nums text-on-surface-variant">
        {eaten}
        {burned}
      </p>
    </div>
  );
}
