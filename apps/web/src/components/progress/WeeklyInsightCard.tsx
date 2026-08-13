/**
 * Weekly insight (GET /api/v1/progress/insight).
 *
 * The supportive narrative leads; the deterministic "what changed" lines
 * follow. Direction is *not* valence: an "up" arrow and a "down" arrow are
 * rendered in the same neutral ink, because colouring a weight increase as bad
 * is precisely the shame mechanic this surface exists to remove. Direction is
 * also spoken for assistive tech rather than left to the glyph.
 *
 * The endpoint always answers 200 for an authenticated user — new user, free
 * tier, consent off, guardrail block, credits exhausted, AI outage — so there
 * is no error treatment here: a quiet skeleton, then content.
 *
 * `ai.model` says why a deterministic narrative was served. Where that maps to
 * something the user could act on, a single quiet footnote is added *below*
 * the insight. The insight is never gated, blurred or teased behind it.
 */
import { Link } from 'react-router-dom';
import type { InsightMetric, ProgressInsight } from '@aquazerofit/shared';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';

const DIRECTION_ICON: Record<ProgressInsight['changes'][number]['direction'], string> = {
  up: 'arrow_upward',
  down: 'arrow_downward',
  steady: 'trending_flat',
};

/** Spoken, so meaning never rests on the arrow glyph alone. */
const DIRECTION_WORD: Record<ProgressInsight['changes'][number]['direction'], string> = {
  up: 'Up:',
  down: 'Down:',
  steady: 'Unchanged:',
};

/**
 * Why the served narrative was deterministic rather than model-authored.
 * `insufficient-data` deliberately has no footnote: the narrative already says
 * "keep logging", and a second nudge on an empty week is nagging.
 */
const INSIGHT_FALLBACK_NOTE: Record<string, { text: string; to?: string; cta?: string }> = {
  'premium-required-fallback': {
    text: 'This summary is written from your own numbers. A coach-written note comes with premium.',
    to: '/plan',
    cta: 'Your plan',
  },
  'consent-off-fallback': {
    text: 'This summary is written from your own numbers. Turn on AI personalisation for a coach-written note.',
    to: '/settings#privacy-consents',
    cta: 'Settings',
  },
};

const METRIC_LABEL: Record<InsightMetric, string> = {
  weight: 'Weight',
  workouts: 'Training',
  intake: 'Intake',
  hydration: 'Hydration',
  logging: 'Logging',
};

export function WeeklyInsightCard({
  insight,
  loading = false,
  className = '',
}: {
  insight: ProgressInsight | null | undefined;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <GlassCard className={`p-5 ${className}`}>
        <div aria-busy="true" aria-label="Weekly insight loading" className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </GlassCard>
    );
  }

  // Endpoint not reachable (offline / not rolled out) — stay quiet, not alarmed.
  if (!insight) return null;

  const note = INSIGHT_FALLBACK_NOTE[insight.ai.model];

  return (
    <GlassCard className={`p-5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="heading-display font-heading text-2xl text-on-surface">Your week</h2>
        <span className="shrink-0 text-xs tabular-nums text-on-surface-variant">
          Last {insight.periodDays} days
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-on-surface">{insight.narrative}</p>

      {insight.changes.length > 0 && (
        <>
          <h3 className="mt-4 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
            What changed
          </h3>
          <ul className="mt-2 space-y-2">
            {insight.changes.map((change) => (
              <li key={`${change.metric}-${change.direction}`} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-container-high/70"
                  aria-hidden="true"
                >
                  {/* Same ink for every direction — an arrow reports, it does not judge. */}
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                    {DIRECTION_ICON[change.direction]}
                  </span>
                </span>
                <span className="min-w-0 text-sm leading-snug text-on-surface-variant">
                  <span className="sr-only">
                    {METRIC_LABEL[change.metric]}. {DIRECTION_WORD[change.direction]}{' '}
                  </span>
                  {change.label}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Footnote only — never a gate, never a blur over the content above. */}
      {note && (
        <p className="mt-4 border-t border-outline-variant/30 pt-3 text-xs leading-relaxed text-on-surface-variant">
          {note.text}
          {note.to && note.cta && (
            <>
              {' '}
              <Link
                to={note.to}
                className="text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                {note.cta}
              </Link>
            </>
          )}
        </p>
      )}
    </GlassCard>
  );
}
