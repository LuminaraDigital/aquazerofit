import { Skeleton } from './Skeleton';

export type MetricTone = 'aqua' | 'green' | 'coral' | 'navy';

const TONE_TEXT: Record<MetricTone, string> = {
  aqua: 'text-primary-fixed-dim',
  green: 'text-secondary',
  coral: 'text-coral',
  navy: 'text-primary',
};

const TONE_BG: Record<MetricTone, string> = {
  aqua: 'bg-primary-fixed-dim/12',
  green: 'bg-secondary/12',
  coral: 'bg-coral/12',
  navy: 'bg-primary/12',
};

/**
 * Small stat card. Uses the compact card tier (borderless, tonal).
 */
export function MetricCard({
  label,
  value,
  unit,
  delta,
  tone = 'aqua',
  icon,
  loading = false,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' } | null;
  tone?: MetricTone;
  icon?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="card-compact p-4 flex flex-col gap-2" aria-busy="true" aria-label={`${label} loading`}>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-20" />
      </div>
    );
  }

  const isEmpty = value === null || value === undefined || value === '';
  const deltaColor =
    delta?.direction === 'up'
      ? 'text-secondary'
      : delta?.direction === 'down'
        ? 'text-coral'
        : 'text-on-surface-variant/60';
  const deltaIcon =
    delta?.direction === 'up'
      ? 'trending_up'
      : delta?.direction === 'down'
        ? 'trending_down'
        : 'trending_flat';

  return (
    <div className="card-compact p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className={`w-6 h-6 rounded-full ${TONE_BG[tone]} flex items-center justify-center shrink-0`}
            aria-hidden="true"
          >
            <span className={`material-symbols-outlined text-[14px] ${TONE_TEXT[tone]}`}>{icon}</span>
          </span>
        )}
        <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant/60">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="tabular-nums font-body font-bold text-xl text-on-surface">
          {isEmpty ? '-' : value}
        </span>
        {!isEmpty && unit && <span className="text-xs text-on-surface-variant/60">{unit}</span>}
      </div>
      {delta && !isEmpty && (
        <span className={`flex items-center gap-0.5 text-[11px] font-medium ${deltaColor}`}>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
            {deltaIcon}
          </span>
          {delta.value}
        </span>
      )}
      {isEmpty && <span className="text-[11px] text-on-surface-variant/40">No data yet</span>}
    </div>
  );
}