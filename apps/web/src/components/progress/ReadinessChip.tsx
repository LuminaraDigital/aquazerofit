/**
 * Readiness chip (GET /api/v1/plans/readiness).
 *
 * `protect` is not a downgrade and is never dressed as one: all three modes
 * share the same calm aqua treatment, the same icon weight and the same
 * neutral surface. There is no amber, no red and no alert glyph anywhere in
 * this component — a protect week is the app absorbing a hard week on the
 * user's behalf, and it should read that way.
 *
 * The mode is always stated in words as well as by icon, so nothing here
 * depends on colour to be understood.
 */
import { useId, useState } from 'react';
import type { ReadinessAssessment, ReadinessMode } from '@aquazerofit/shared';
import { Skeleton } from '@/components/ui/Skeleton';

interface ReadinessModeCopy {
  label: string;
  /** Material symbol — supportive, never a warning triangle. */
  icon: string;
}

export const READINESS_MODE_COPY: Record<ReadinessMode, ReadinessModeCopy> = {
  protect: { label: 'Protect', icon: 'shield' },
  maintain: { label: 'Maintain', icon: 'balance' },
  progress: { label: 'Progress', icon: 'trending_up' },
};

export function ReadinessChip({
  readiness,
  loading = false,
  className = '',
}: {
  readiness: ReadinessAssessment | null | undefined;
  loading?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (loading) {
    return <Skeleton className={`h-16 w-full rounded-xl ${className}`} />;
  }

  // Endpoint not reachable yet (rolling out) — stay quiet rather than alarm.
  if (!readiness) return null;

  const mode = READINESS_MODE_COPY[readiness.mode];
  const hasSignals = readiness.signals.length > 0;

  const summary = (
    <>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12"
        aria-hidden="true"
      >
        <span className="material-symbols-outlined text-[18px] text-primary">{mode.icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-widest text-primary">
          {mode.label} week
        </span>
        <span className="block text-sm leading-snug text-on-surface">{readiness.headline}</span>
      </span>
    </>
  );

  return (
    <div className={`card-compact p-3 ${className}`}>
      {hasSignals ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {summary}
          <span className="shrink-0 text-xs font-medium text-primary">
            {open ? 'Hide' : 'Why'}
            <span
              className="material-symbols-outlined ml-0.5 align-middle text-[16px]"
              aria-hidden="true"
            >
              {open ? 'expand_less' : 'expand_more'}
            </span>
          </span>
        </button>
      ) : (
        <div className="flex w-full items-center gap-3">{summary}</div>
      )}

      {hasSignals && (
        <ul
          id={panelId}
          hidden={!open}
          className="mt-3 space-y-2 border-t border-outline-variant/30 pt-3"
        >
          {readiness.signals.map((signal) => (
            <li key={signal.label} className="text-sm leading-snug">
              <span className="font-medium text-on-surface">{signal.label}</span>
              <span className="mt-0.5 block text-on-surface-variant">{signal.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
