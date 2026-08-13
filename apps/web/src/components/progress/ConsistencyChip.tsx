/**
 * Compact consistency pill for the Dashboard header.
 *
 * Replaces the flame-and-number streak badge. It shows `activeDays/windowDays`
 * — a figure that cannot drop to zero overnight — instead of a run length that
 * can. No flame, no colour-coded state, no zero-state scolding.
 */
import type { ConsistencyStatus } from '@aquazerofit/shared';
import { Skeleton } from '@/components/ui/Skeleton';
import { consistencyAriaLabel, consistencyShortHeadline } from './consistencyCopy';

export function ConsistencyChip({
  consistency,
  loading = false,
}: {
  consistency: ConsistencyStatus | null | undefined;
  loading?: boolean;
}) {
  if (loading || !consistency) {
    return <Skeleton className="h-7 w-16 rounded-full" />;
  }

  return (
    <div
      className="flex items-center gap-1 rounded-full border border-outline-variant/50 bg-surface-container/80 px-2.5 py-1"
      aria-label={consistencyAriaLabel(consistency)}
      role="img"
    >
      <span
        className="material-symbols-outlined mr-0.5 text-[16px] text-primary"
        aria-hidden="true"
      >
        calendar_month
      </span>
      <span className="text-sm font-bold tabular-nums text-on-surface" aria-hidden="true">
        {consistencyShortHeadline(consistency)}
      </span>
    </div>
  );
}
