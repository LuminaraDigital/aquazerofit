/**
 * Your Progress — pixel reference: your_progress.
 * Range selector (7d/30d/90d), weight hero with hand-rolled SVG line chart
 * (smooth path, gradient fill, goal line, min/max labels), calorie trend bars
 * vs target, stats MetricCards, macro donut, achievements grid, Log-weight CTA
 * and data export.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { DerivedTargets, ProgressSummary, TrendPoint } from '@aquazerofit/shared';
import { api, ApiError } from '@/lib/api';
import { normalizeWorkoutStats, type WorkoutStatsResponse } from '@/lib/contracts';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { Chip } from '@/components/ui/Chip';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { Sparkline } from '../dashboard/Sparkline';

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

interface Pt {
  x: number;
  y: number;
}

/** Catmull-Rom → cubic bezier smooth path. */
function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

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

function WeightChart({
  series,
  goal,
}: {
  series: TrendPoint[];
  goal: number | null;
}) {
  const W = 360;
  const H = 170;
  const PAD = 14;
  const values = series.map((p) => p.value);
  const withGoal = goal !== null ? [...values, goal] : values;
  const min = Math.min(...withGoal);
  const max = Math.max(...withGoal);
  const span = Math.max(0.5, max - min);
  const x = (i: number) => PAD + (i / Math.max(1, series.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2 - 18);
  const pts = series.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const line = smoothPath(pts);
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z` : '';
  const minIdx = values.indexOf(Math.min(...values));
  const maxIdx = values.indexOf(Math.max(...values));
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <figure aria-label={`Weight chart from ${first ? shortDate(first.date) : ''} to ${last ? shortDate(last.date) : ''}. Latest ${last ? last.value.toFixed(1) : '–'} kilograms${goal !== null ? `, goal ${goal.toFixed(1)} kilograms` : ''}.`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="azfWeightArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8aebff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#8aebff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {goal !== null && (
          <>
            <line
              x1={PAD}
              x2={W - PAD}
              y1={y(goal)}
              y2={y(goal)}
              stroke="#45dfa4"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />
            <text x={W - PAD} y={y(goal) - 5} textAnchor="end" fontSize="10" fontWeight="700" fill="#45dfa4">
              Goal: {goal.toFixed(1)}kg
            </text>
          </>
        )}
        {area && <path d={area} fill="url(#azfWeightArea)" />}
        <path d={line} fill="none" stroke="#8aebff" strokeWidth="3" strokeLinecap="round" />
        {pts.length > 0 && (
          <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4" fill="#8aebff" />
        )}
        {minIdx >= 0 && pts[minIdx] && (
          <text x={pts[minIdx].x} y={Math.min(H - 4, pts[minIdx].y + 14)} textAnchor="middle" fontSize="9" fill="#bbc9cd">
            {values[minIdx].toFixed(1)}
          </text>
        )}
        {maxIdx >= 0 && pts[maxIdx] && maxIdx !== minIdx && (
          <text x={pts[maxIdx].x} y={Math.max(10, pts[maxIdx].y - 8)} textAnchor="middle" fontSize="9" fill="#bbc9cd">
            {values[maxIdx].toFixed(1)}
          </text>
        )}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        <span>{first ? shortDate(first.date) : ''}</span>
        <span>{last ? shortDate(last.date) : ''}</span>
      </figcaption>
    </figure>
  );
}

function KcalBars({ series, target }: { series: TrendPoint[]; target: number | null }) {
  const W = 360;
  const H = 140;
  const PAD = 10;
  const max = Math.max(target ?? 0, ...series.map((p) => p.value), 1);
  const bw = Math.max(2, (W - PAD * 2) / Math.max(1, series.length) - 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const avg = series.length
    ? Math.round(series.reduce((a, p) => a + p.value, 0) / series.length)
    : 0;

  return (
    <figure aria-label={`Daily calorie intake bars. Average ${avg} kilocalories${target !== null ? ` against a target of ${target}` : ''}.`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-hidden="true">
        {series.map((p, i) => {
          const over = target !== null && p.value > target;
          return (
            <rect
              key={p.date}
              x={PAD + i * ((W - PAD * 2) / Math.max(1, series.length)) + 1}
              y={y(p.value)}
              width={bw}
              height={Math.max(1, H - PAD - y(p.value))}
              rx={Math.min(3, bw / 2)}
              fill={over ? '#ffb2b9' : '#2fd9f4'}
              opacity={over ? 0.85 : 0.7}
            />
          );
        })}
        {target !== null && (
          <>
            <line x1={PAD} x2={W - PAD} y1={y(target)} y2={y(target)} stroke="#45dfa4" strokeDasharray="4 4" strokeWidth="1.5" />
            <text x={W - PAD} y={y(target) - 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#45dfa4">
              Target {target}
            </text>
          </>
        )}
      </svg>
      <figcaption className="mt-1 text-xs text-on-surface-variant">
        Avg <span className="font-bold text-on-surface tabular-nums">{avg} kcal</span> / day
      </figcaption>
    </figure>
  );
}

function MacroDonut({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const kcal = { p: protein * 4, c: carbs * 4, f: fat * 9 };
  const total = Math.max(1, kcal.p + kcal.c + kcal.f);
  const R = 52;
  const C = 2 * Math.PI * R;
  const segs = [
    { key: 'Protein', frac: kcal.p / total, color: '#45dfa4', grams: protein },
    { key: 'Carbs', frac: kcal.c / total, color: '#2fd9f4', grams: carbs },
    { key: 'Fat', frac: kcal.f / total, color: '#ffb2b9', grams: fat },
  ];
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <figure
        aria-label={`Average macro split: protein ${Math.round((kcal.p / total) * 100)} percent, carbs ${Math.round((kcal.c / total) * 100)} percent, fat ${Math.round((kcal.f / total) * 100)} percent of calories.`}
      >
        <svg viewBox="0 0 140 140" className="h-32 w-32" role="img" aria-hidden="true">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#1E4C74" strokeWidth="14" />
          {segs.map((s) => {
            const el = (
              <circle
                key={s.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, s.frac * C - 2)} ${C}`}
                strokeDashoffset={-offset * C}
                transform="rotate(-90 70 70)"
              />
            );
            offset += s.frac;
            return el;
          })}
        </svg>
      </figure>
      <ul className="space-y-2">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-on-surface-variant">{s.key}</span>
            <span className="font-bold text-on-surface tabular-nums">
              {Math.round(s.grams)}g · {Math.round(s.frac * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- page ----------

/** Treat NOT_FOUND as "endpoint not live yet" (backend rolls out in parallel). */
async function orNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export default function Progress() {
  const navigate = useNavigate();
  const toast = useToast();
  const [range, setRange] = useState<Range>('30d');

  const progressQuery = useQuery({
    queryKey: ['progress'],
    queryFn: () => api<ProgressSummary>('/progress/summary'),
  });
  const trendsQuery = useQuery({
    queryKey: ['nutrition', 'trends', range],
    queryFn: () => api<NutritionTrends>('/analytics/nutrition/trends', { query: { range } }),
  });
  const targetsQuery = useQuery({
    queryKey: ['targets'],
    queryFn: () => api<DerivedTargets>('/me/targets'),
  });
  // Deterministic training stats (Brzycki e1RM + weekly volume). Optional
  // read model — the block stays hidden while the endpoint rolls out (404).
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
      toast.error('Export failed — please try again');
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
        <div className="mt-5 space-y-4">
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-64 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      ) : progressQuery.isError ? (
        <div className="mt-5">
          <ErrorState
            message="Could not load your progress."
            retry={() => void progressQuery.refetch()}
          />
        </div>
      ) : summary ? (
        <div className="mt-5 space-y-6">
          {/* ---- weight hero ---- */}
          <section aria-label="Weight progress">
            <div className="grid grid-cols-2 gap-4">
              <GlassCard className="p-5">
                <span className="text-sm text-on-surface-variant">Current Weight</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-primary tabular-nums">
                    {summary.currentWeightKg?.toFixed(1) ?? '–'}
                  </span>
                  <span className="text-sm text-on-surface-variant">kg</span>
                </div>
              </GlassCard>
              <GlassCard className="p-5">
                <span className="text-sm text-on-surface-variant">Since start</span>
                <div className="mt-2 flex items-center gap-1">
                  <span
                    className={`material-symbols-outlined ${delta !== null && delta <= 0 ? 'text-secondary' : 'text-coral'}`}
                    aria-hidden="true"
                  >
                    {delta !== null && delta <= 0 ? 'trending_down' : 'trending_up'}
                  </span>
                  <span
                    className={`text-sm font-bold tabular-nums ${delta !== null && delta <= 0 ? 'text-secondary' : 'text-coral'}`}
                  >
                    {delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg` : '–'}
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
                <WeightChart series={weightSeries} goal={summary.targetWeightKg} />
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
                <KcalBars
                  series={trendsQuery.data.kcal}
                  target={targetsQuery.data?.kcalTarget ?? null}
                />
              )}
            </GlassCard>
          </section>

          {/* ---- stats row ---- */}
          <section aria-label="Statistics" className="grid grid-cols-3 gap-3">
            <MetricCard
              label="Streak"
              value={summary.streakDays}
              unit="days"
              tone="aqua"
              icon="local_fire_department"
              loading={progressQuery.isPending}
            />
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
                        <Sparkline
                          points={weeklyVolume}
                          label={`Weekly training volume, latest week ${weeklyVolume[weeklyVolume.length - 1]?.value ?? 0} kilograms`}
                        />
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
                <MacroDonut
                  protein={macroAvg.protein}
                  carbs={macroAvg.carbs}
                  fat={macroAvg.fat}
                />
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
                body="Keep logging and training — your first badge is close."
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
            <button
              onClick={() => void exportData()}
              className="w-full text-center text-sm text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Export my data (JSON)
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
