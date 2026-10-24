/**
 * Your Progress - pixel reference: your_progress.
 * Range selector (7d/30d/90d), weight hero with hand-rolled SVG line chart
 * (smooth path, gradient fill, goal line, min/max labels), calorie trend bars
 * vs target, stats MetricCards, macro donut, achievements grid, Log-weight CTA
 * and data export.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ProgressSummary, TrendPoint } from '@aquazerofit/shared';
import { AQUA_CHARACTER } from '@aquazerofit/shared';
import { api, ApiError } from '@/lib/api';
import { orNull } from '@/lib/envelopes';
import { normalizeWorkoutStats, type WorkoutStatsResponse } from '@/lib/contracts';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { Chip } from '@/components/ui/Chip';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Skeleton, ProgressSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { ShareMoment } from '@/components/share/ShareMoment';
import { ConsistencyCard } from '@/components/progress/ConsistencyCard';
import { ReadinessChip } from '@/components/progress/ReadinessChip';
import { WeeklyInsightCard } from '@/components/progress/WeeklyInsightCard';
import {
  consistencyHeadline,
  consistencyShortHeadline,
  CONSISTENCY_EMPTY_HEADLINE,
} from '@/components/progress/consistencyCopy';
import type { ShareCardPayload } from '@/lib/shareCard';
import { useMe, useProgressInsight, useReadiness, useTargets, queryKeys } from '@/lib/queries';
const WeightChart = lazy(() => import('./progressCharts').then((m) => ({ default: m.WeightChart })));
const KcalBars = lazy(() => import('./progressCharts').then((m) => ({ default: m.KcalBars })));
const MacroDonut = lazy(() => import('./progressCharts').then((m) => ({ default: m.MacroDonut })));
const Sparkline = lazy(() => import('../dashboard/Sparkline').then((m) => ({ default: m.Sparkline })));

type Range = '7d' | '30d' | '90d';
const RANGES: Range[] = ['7d', '30d', '90d'];
const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 };

interface NutritionTrends {
  kcal: TrendPoint[];
  weight: TrendPoint[];
  macros?: {
    proteinG?: TrendPoint[];
    carbsG?: TrendPoint[];
    fatG?: TrendPoint[];
  };
}

// ---------- chart helpers (hand-rolled SVG only) ----------
function cutToRange(series: TrendPoint[], range: Range): TrendPoint[] {
  const from = new Date();
  from.setDate(from.getDate() - RANGE_DAYS[range]);
  const fromStr = from.toLocaleDateString('en-CA');
  return series.filter((p) => p.date >= fromStr);
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ---------- page ----------

export default function Progress() {
  const navigate = useNavigate();
  const toast = useToast();
  const me = useMe();
  const [range, setRange] = useState<Range>('30d');
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null);

  const progressQuery = useQuery({
    queryKey: queryKeys.progress,
    queryFn: () => api<ProgressSummary>('/progress/summary'),
  });
  const trendsQuery = useQuery({
    queryKey: queryKeys.nutritionTrends(range),
    queryFn: () => api<NutritionTrends>('/analytics/nutrition/trends', { query: { range } }),
  });
  // Shared ['targets'] key: useTargets caches the unwrapped targets object;
  // caching the raw { targets } envelope here made kcalTarget read undefined.
  const targetsQuery = useTargets();
  const insightQuery = useProgressInsight();
  const readinessQuery = useReadiness();
  // Deterministic training stats (Brzycki e1RM + weekly volume). Optional
  // read model - the block stays hidden while the endpoint rolls out (404).
  const workoutStatsQuery = useQuery({
    queryKey: ['workout-stats'],
    queryFn: async () => {
      const raw = await orNull(() => api<WorkoutStatsResponse>('/workouts/stats'));
      return raw ? normalizeWorkoutStats(raw) : null;
    },
  });
  const workoutStats = workoutStatsQuery.data ?? null;
  const weeklyVolume: TrendPoint[] = useMemo(
    () => (workoutStats?.weekly ?? []).map((w) => ({ date: w.week, value: w.volumeKg })),
    [workoutStats],
  );
  const topE1rm = useMemo(
    () =>
      [...(workoutStats?.perExercise ?? [])]
        .sort((a, b) => b.e1rmKg - a.e1rmKg)
        .slice(0, 5),
    [workoutStats],
  );

  const summary = progressQuery.data;
  const weightSeries = useMemo(
    () => (summary ? cutToRange(summary.weightSeries, range) : []),
    [summary, range],
  );

  const macroAvg = useMemo(() => {
    const m = trendsQuery.data?.macros;
    const avg = (s?: TrendPoint[]) =>
      s && s.length ? s.reduce((a, p) => a + p.value, 0) / s.length : 0;
    return { protein: avg(m?.proteinG), carbs: avg(m?.carbsG), fat: avg(m?.fatG) };
  }, [trendsQuery.data]);

  const exportData = async () => {
    try {
      const bundle = await api<unknown>('/me/export');
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aquazerofit-export-${new Date().toLocaleDateString('en-CA')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Your data export has been downloaded');
    } catch {
      toast.error('Export failed - please try again');
    }
  };

  const delta =
    summary && summary.currentWeightKg !== null && summary.startWeightKg !== null
      ? summary.currentWeightKg - summary.startWeightKg
      : null;

  return (
    <div className="w-full px-5">
      <AppHeader />

      <div className="mt-4 flex items-center justify-between">
        <h1 className="heading-display font-heading text-3xl text-on-surface">Your Progress</h1>
      </div>

      {/* range selector */}
      <div className="mt-4 flex gap-2" role="tablist" aria-label="Time range">
        {RANGES.map((r) => (
          <Chip key={r} label={r} active={range === r} onClick={() => setRange(r)} />
        ))}
      </div>

      {progressQuery.isPending ? (
        <ProgressSkeleton />
      ) : progressQuery.isError ? (
        <div className="mt-5">
          <ErrorState
            message="Could not load your progress."
            retry={() => void progressQuery.refetch()}
          />
        </div>
      ) : summary ? (
        <div className="mt-5 space-y-6">
          {/* ---- readiness ---- */}
          <section aria-label="This week's readiness">
            <ReadinessChip readiness={readinessQuery.data} loading={readinessQuery.isPending} />
          </section>

          {/* ---- consistency (replaces the streak counter) ---- */}
          <section aria-label="Consistency">
            <ConsistencyCard consistency={summary.consistency} />
          </section>

          {/* ---- weekly insight ---- */}
          <section aria-label="Your week">
            <WeeklyInsightCard insight={insightQuery.data} loading={insightQuery.isPending} />
          </section>

          {/* ---- weight hero ---- */}
          <section aria-label="Weight progress">
            <div className="grid grid-cols-2 gap-4">
              <GlassCard className="p-5">
                <span className="text-sm text-on-surface-variant">Current Weight</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-primary tabular-nums">
                    {summary.currentWeightKg?.toFixed(1) ?? '-'}
                  </span>
                  <span className="text-sm text-on-surface-variant">kg</span>
                </div>
              </GlassCard>
              <GlassCard className="p-5">
                <span className="text-sm text-on-surface-variant">Since start</span>
                {/* Direction is reported, not judged: a gain is not rendered as
                    a failure and a loss is not rendered as a reward. Same ink
                    either way - the sign carries the information. */}
                <div className="mt-2 flex items-center gap-1">
                  <span
                    className="material-symbols-outlined text-on-surface-variant"
                    aria-hidden="true"
                  >
                    {delta !== null && delta <= 0 ? 'trending_down' : 'trending_up'}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-on-surface">
                    {delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg` : '-'}
                  </span>
                </div>
              </GlassCard>
            </div>

            <GlassCard className="mt-4 space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h2 className="heading-display font-heading text-2xl text-on-surface">
                  Weight Journey
                </h2>
                {summary.targetWeightKg !== null && (
                  <span className="text-xs font-bold text-secondary tabular-nums">
                    Goal {summary.targetWeightKg.toFixed(1)} kg
                  </span>
                )}
              </div>
              {weightSeries.length === 0 ? (
                <EmptyState
                  icon="monitor_weight"
                  title="No weigh-ins yet"
                  body="Log your first weight to start your journey chart."
                />
              ) : (
                <Suspense fallback={null}>
                  <WeightChart series={weightSeries} goal={summary.targetWeightKg} />
                </Suspense>
              )}
            </GlassCard>
          </section>

          {/* ---- calorie trend ---- */}
          <section aria-label="Calorie trend">
            <GlassCard className="space-y-3 p-5">
              <h2 className="heading-display font-heading text-2xl text-on-surface">
                Calorie Trend
              </h2>
              {trendsQuery.isPending ? (
                <Skeleton className="h-36 w-full rounded-card" />
              ) : trendsQuery.isError ? (
                <ErrorState
                  message="Could not load nutrition trends."
                  retry={() => void trendsQuery.refetch()}
                />
              ) : (trendsQuery.data.kcal ?? []).length === 0 ? (
                <EmptyState
                  icon="restaurant"
                  title="No meals logged"
                  body="Log meals to see your calorie trend against your target."
                />
              ) : (
                <Suspense fallback={null}>
                  <KcalBars
                    series={trendsQuery.data.kcal}
                    target={targetsQuery.data?.kcalTarget ?? null}
                  />
                </Suspense>
              )}
            </GlassCard>
          </section>

          {/* ---- stats row ---- */}
          {/* Consistency is the card above; these are cumulative totals only -
              nothing here can be reset by a missed day. */}
          <section aria-label="Statistics" className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Workouts"
              value={summary.workoutsCompleted}
              tone="green"
              icon="fitness_center"
              loading={progressQuery.isPending}
            />
            <MetricCard
              label="Burned"
              value={summary.totalKcalBurned}
              unit="kcal"
              tone="coral"
              icon="bolt"
              loading={progressQuery.isPending}
            />
          </section>

          {/* ---- training stats (wger stats read model) ---- */}
          {workoutStats && (
            <section aria-label="Training stats">
              <GlassCard className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="heading-display font-heading text-2xl text-on-surface">
                    Training Stats
                  </h2>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    e1RM · {workoutStats.formulaVersion}
                  </span>
                </div>

                {weeklyVolume.length === 0 && topE1rm.length === 0 ? (
                  <EmptyState
                    icon="exercise"
                    title="No training stats yet"
                    body="Complete a workout and log your set weights to see weekly volume and strength estimates."
                  />
                ) : (
                  <>
                    {weeklyVolume.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                          Weekly volume (kg)
                        </h3>
                        <Suspense fallback={null}>
                        <Sparkline
                          points={weeklyVolume}
                          label={`Weekly training volume, latest week ${weeklyVolume[weeklyVolume.length - 1]?.value ?? 0} kilograms`}
                        />
                        </Suspense>
                        <p className="mt-1 text-xs text-on-surface-variant tabular-nums">
                          {workoutStats.weekly[workoutStats.weekly.length - 1]?.sets ?? 0} sets this
                          week
                        </p>
                      </div>
                    )}
                    {topE1rm.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                          Top estimated 1RM
                        </h3>
                        <ul className="space-y-2">
                          {topE1rm.map((ex, i) => (
                            <li
                              key={ex.exerciseId}
                              className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2"
                            >
                              <span className="flex min-w-0 items-center gap-2 text-sm text-on-surface">
                                <span className="w-4 flex-shrink-0 text-center text-xs font-bold text-on-surface-variant tabular-nums">
                                  {i + 1}
                                </span>
                                <span className="truncate">{ex.name}</span>
                              </span>
                              <span className="flex-shrink-0 text-sm tabular-nums">
                                <span className="font-bold text-primary">{ex.e1rmKg} kg</span>
                                {ex.bestWeightKg > 0 && (
                                  <span className="ml-2 text-xs text-on-surface-variant">
                                    best {ex.bestWeightKg} kg
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </GlassCard>
            </section>
          )}

          {/* ---- macro split ---- */}
          <section aria-label="Nutrition breakdown">
            <GlassCard className="space-y-3 p-5">
              <h2 className="heading-display font-heading text-2xl text-on-surface">
                Avg Macro Split
              </h2>
              {macroAvg.protein + macroAvg.carbs + macroAvg.fat === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  Log some meals and your average macro split will appear here.
                </p>
              ) : (
                <Suspense fallback={null}>
                  <MacroDonut
                    protein={macroAvg.protein}
                    carbs={macroAvg.carbs}
                    fat={macroAvg.fat}
                  />
                </Suspense>
              )}
            </GlassCard>
          </section>

          {/* ---- achievements ---- */}
          <section aria-label="Achievements">
            <h2 className="heading-display mb-4 font-heading text-2xl text-on-surface">
              Milestones & Badges
            </h2>
            {summary.achievements.length === 0 ? (
              <EmptyState
                icon="military_tech"
                title="No badges yet"
                body="Keep logging and training - your first badge is close."
              />
            ) : (
              <ul className="grid grid-cols-3 gap-4">
                {summary.achievements.map(({ definition, earnedAt }) => (
                  <li key={definition.id} className="flex flex-col items-center gap-2 text-center">
                    {earnedAt ? (
                      <div className="cta-gradient rounded-full p-[2px] shadow-[0_0_15px_rgba(138,235,255,0.4)]">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-container-high">
                          <span
                            className="material-symbols-outlined text-4xl text-primary"
                            aria-hidden="true"
                          >
                            {definition.icon || 'military_tech'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-full border-2 border-dashed border-outline-variant p-[2px] opacity-40 grayscale">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-container-lowest">
                          <span
                            className="material-symbols-outlined text-4xl text-on-surface-variant"
                            aria-hidden="true"
                          >
                            lock
                          </span>
                        </div>
                      </div>
                    )}
                    <span
                      className={`text-xs ${earnedAt ? 'text-on-surface' : 'text-on-surface-variant'}`}
                    >
                      {definition.name}
                    </span>
                    {earnedAt && (
                      <span className="text-[10px] text-on-surface-variant tabular-nums">
                        {shortDate(earnedAt.slice(0, 10))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- actions ---- */}
          <section className="space-y-3 pb-4">
            <PrimaryButton onClick={() => navigate('/progress/log-weight')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                monitor_weight
              </span>
              Log weight
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                // Shares the window figure, never a run length: a shared card
                // must not be able to say a run was lost.
                const c = summary.consistency;
                setSharePayload({
                  kind: 'consistency',
                  headline:
                    c.activeDays > 0 ? consistencyHeadline(c) : CONSISTENCY_EMPTY_HEADLINE,
                  subline: `${summary.workoutsCompleted} workouts · ${summary.totalKcalBurned} kcal burned`,
                  stats: [
                    { label: 'Active days', value: consistencyShortHeadline(c) },
                    { label: 'Workouts', value: String(summary.workoutsCompleted) },
                    {
                      label: 'Burned',
                      value:
                        summary.totalKcalBurned >= 1000
                          ? `${Math.round(summary.totalKcalBurned / 100) / 10}k`
                          : String(summary.totalKcalBurned),
                    },
                  ],
                  catchphrase: AQUA_CHARACTER.catchphrases[1],
                });
                setShareOpen(true);
              }}
            >
              Share progress
            </SecondaryButton>
            <SecondaryButton onClick={() => navigate('/challenges')}>
              Buddy huddles
            </SecondaryButton>
            <button
              onClick={() => void exportData()}
              className="w-full text-center text-sm text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Export my data (JSON)
            </button>
          </section>
        </div>
      ) : null}

      <ShareMoment
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        payload={sharePayload}
        userId={me.data?.id ?? null}
        invitePath="/welcome"
      />
    </div>
  );
}
