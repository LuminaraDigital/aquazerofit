/**
 * Consistency — the replacement for the punishing streak counter.
 *
 * The hero number is `activeDays of windowDays`, which only ever grows with
 * effort and cannot be reset to zero by a missed day. The current run is
 * demoted to supporting text, the all-time best stays visible so a short run
 * never erases past effort, and nothing on this surface renders a missed day:
 * absent, not struck through, greyed out or counted against the user.
 *
 * All copy resolves through ./consistencyCopy — see that file for the full
 * vocabulary.
 */
import type { ConsistencyStatus } from '@aquazerofit/shared';
import { GlassCard } from '@/components/ui/GlassCard';
import { Chip } from '@/components/ui/Chip';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  CONSISTENCY_EMPTY_HEADLINE,
  CONSISTENCY_STATE_COPY,
  consistencyBestLabel,
  consistencyBody,
  consistencyFraction,
  consistencyRunLabel,
} from './consistencyCopy';

export function ConsistencyCard({
  consistency,
  loading = false,
  className = '',
}: {
  consistency: ConsistencyStatus | null | undefined;
  loading?: boolean;
  className?: string;
}) {
  if (loading || !consistency) {
    return (
      <GlassCard className={`p-5 ${className}`}>
        <div aria-busy="true" aria-label="Consistency loading" className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </GlassCard>
    );
  }

  const state = CONSISTENCY_STATE_COPY[consistency.state];
  const run = consistencyRunLabel(consistency);
  const best = consistencyBestLabel(consistency);
  const hasActivity = consistency.activeDays > 0;
  const pct = Math.round(consistencyFraction(consistency) * 100);

  return (
    <GlassCard className={`p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="heading-display font-heading text-2xl text-on-surface">Consistency</h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Rolling {consistency.windowDays}-day window
          </p>
        </div>
        <span className="shrink-0">
          <Chip label={state.label} icon={state.icon} tone="aqua" />
        </span>
      </div>

      {hasActivity ? (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-body text-4xl font-bold tabular-nums leading-none text-primary">
            {consistency.activeDays}
          </span>
          <span className="text-sm text-on-surface-variant">
            of the last {consistency.windowDays} days
          </span>
        </p>
      ) : (
        <p className="mt-4 font-heading text-2xl font-semibold leading-tight text-on-surface">
          {CONSISTENCY_EMPTY_HEADLINE}
        </p>
      )}

      {/* Proportion only — the meter never marks an individual day as missed. */}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-outline-variant/40"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
        {consistencyBody(consistency)}
      </p>

      {(run !== null || best !== null) && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-on-surface-variant">
          {run !== null && <li>{run}</li>}
          {best !== null && <li>{best}</li>}
        </ul>
      )}
    </GlassCard>
  );
}
