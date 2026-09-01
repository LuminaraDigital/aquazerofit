import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { DailyNutrition, ProgressSummary, TrendPoint } from '@aquazerofit/shared';
import { api } from '@/lib/api';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { RingProgress } from '@/components/ui/RingProgress';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { CoachCard } from '@/components/coach/CoachCard';
import { ConsistencyCard } from '@/components/progress/ConsistencyCard';
import { ConsistencyChip } from '@/components/progress/ConsistencyChip';
import { ReadinessChip } from '@/components/progress/ReadinessChip';
import { WeeklyInsightCard } from '@/components/progress/WeeklyInsightCard';
import { todayWorkoutQuery, useProgressInsight, useReadiness } from '@/lib/queries';
import { MacroBar } from './MacroBar';
import { WaterCard } from './WaterCard';
import { Sparkline } from './Sparkline';
import { SuggestMealCard } from './SuggestMealCard';
import {
  asUser,
  asWorkoutSession,
  estimateDurationMinutes,
  fmtInt,
  formatLocalDate,
  todayLocalDate,
} from './lib';

interface TrendsResponse {
  kcal?: TrendPoint[];
  weight?: TrendPoint[];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const today = todayLocalDate();

  const dailyQuery = useQuery({
    queryKey: ['nutrition', 'daily', today],
    queryFn: () => api<DailyNutrition>('/analytics/nutrition/daily', { query: { date: today } }),
  });
  const profileQuery = useQuery({
    queryKey: ['me', 'user'],
    queryFn: () => api<unknown>('/me'),
  });
  const progressQuery = useQuery({
    queryKey: ['progress'],
    queryFn: () => api<ProgressSummary>('/progress/summary'),
  });
  // Shared cache key ⇒ shared queryFn; the raw envelope is unwrapped at use
  // (asWorkoutSession below), never cached pre-transformed.
  const workoutQuery = useQuery(todayWorkoutQuery);
  const trendsQuery = useQuery({
    queryKey: ['nutrition', 'trends', '30d'],
    queryFn: () => api<TrendsResponse>('/analytics/nutrition/trends', { query: { range: '30d' } }),
  });
  const insightQuery = useProgressInsight();
  const readinessQuery = useReadiness();

  const user = asUser(profileQuery.data);
  const firstName = user?.displayName?.split(' ')[0] ?? '';
  const daily = dailyQuery.data;
  const progress = progressQuery.data;
  const session = asWorkoutSession(workoutQuery.data);
  const weightSeries = trendsQuery.data?.weight ?? progress?.weightSeries ?? [];

  const headerRight = (
    <div className="flex items-center gap-2.5">
      <ConsistencyChip
        consistency={progress?.consistency}
        loading={progressQuery.isPending}
      />
      <button
        type="button"
        onClick={() => navigate('/settings')}
        aria-label="Open settings and profile"
        className="w-9 h-9 rounded-full border border-primary/50 overflow-hidden cta-gradient flex items-center justify-center text-on-primary font-bold text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {firstName ? firstName.charAt(0).toUpperCase() : <span className="material-symbols-outlined text-[18px]" aria-hidden="true">person</span>}
      </button>
    </div>
  );

  return (
    <div>
      <AppHeader right={headerRight} />

      <main className="px-container-margin">
        {/* Greeting - tighter, more personal */}
        <section className="mt-5 mb-5 reveal">
          <p className="text-sm text-on-surface-variant/70 font-medium tracking-tight">
            {formatLocalDate(today)}
          </p>
          <h1 className="font-heading font-semibold tracking-tight text-3xl text-on-surface leading-tight mt-0.5">
            {profileQuery.isLoading ? (
              <Skeleton className="h-8 w-40" />
            ) : (
              `Hey${firstName ? `, ${firstName}` : ''}`
            )}
          </h1>
        </section>

        {/* How hard the plan should push this week — supportive, never a warning */}
        <section className="mb-5 reveal reveal-2" aria-label="This week's readiness">
          <ReadinessChip readiness={readinessQuery.data} loading={readinessQuery.isPending} />
        </section>

        {dailyQuery.isError ? (
          <ErrorState
            message="We couldn't load today's nutrition."
            retry={() => void dailyQuery.refetch()}
          />
        ) : (
          <>
            {/* Calorie ring hero - the visual anchor */}
            <section className="mb-5 reveal reveal-2" aria-label="Daily calories">
              <GlassCard tier="hero" className="p-card-padding flex flex-col items-center relative overflow-hidden float-gentle">
                <div className="w-full flex justify-between items-start mb-5">
                  <div>
                    <h2 className="font-heading font-semibold uppercase tracking-[0.04em] text-lg text-on-surface-variant">
                      Nutrition
                    </h2>
                    <p className="text-xs text-on-surface-variant/60 mt-0.5">Daily goal</p>
                  </div>
                  {daily && (
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-medium text-on-surface-variant/60 uppercase tracking-wider">
                        Consumed
                      </span>
                      <span className="tabular-nums font-body font-bold text-lg text-on-surface">
                        {fmtInt(daily.kcalConsumed)}
                      </span>
                    </div>
                  )}
                </div>
                {daily ? (
                  <>
                    <div className="mb-6">
                      <RingProgress
                        value={daily.kcalConsumed}
                        target={daily.kcalTarget}
                        size={180}
                        strokeWidth={7}
                        tone="aqua"
                      >
                        <div className="flex flex-col items-center">
                          <span className="font-heading font-semibold text-[44px] text-primary tabular-nums leading-none">
                            {fmtInt(Math.max(0, daily.kcalRemaining))}
                          </span>
                          <span className="text-xs text-on-surface-variant/70 mt-1.5 uppercase tracking-wider">kcal left</span>
                        </div>
                      </RingProgress>
                    </div>
                    <div
                      className="w-full grid grid-cols-4 text-center tabular-nums mb-6"
                      aria-label={`Goal ${fmtInt(daily.kcalTarget)} minus food ${fmtInt(daily.kcalConsumed)} plus exercise ${fmtInt(daily.kcalBurned)} equals ${fmtInt(daily.kcalRemaining)} remaining`}
                    >
                      <div>
                        <p className="text-base font-bold text-on-surface">{fmtInt(daily.kcalTarget)}</p>
                        <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">Goal</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-on-surface">
                          − {fmtInt(daily.kcalConsumed)}
                        </p>
                        <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">Food</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-on-surface">
                          + {fmtInt(daily.kcalBurned)}
                        </p>
                        <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">
                          Exercise
                        </p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-primary">{fmtInt(daily.kcalRemaining)}</p>
                        <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">
                          Remaining
                        </p>
                      </div>
                    </div>
                    <div className="w-full grid grid-cols-3 gap-3">
                      <MacroBar
                        label="Protein"
                        tone="green"
                        consumed={daily.proteinG.consumed}
                        target={daily.proteinG.target}
                      />
                      <MacroBar
                        label="Carbs"
                        tone="aqua"
                        consumed={daily.carbsG.consumed}
                        target={daily.carbsG.target}
                      />
                      <MacroBar
                        label="Fat"
                        tone="coral"
                        consumed={daily.fatG.consumed}
                        target={daily.fatG.target}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-4 w-full">
                    <Skeleton className="h-44 w-44 rounded-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                )}
              </GlassCard>
            </section>

            {/* Water tracker */}
            <section className="mb-5 reveal reveal-3" aria-label="Hydration">
              {daily ? (
                <WaterCard
                  date={today}
                  consumedMl={daily.waterMl.consumed}
                  targetMl={daily.waterMl.target}
                />
              ) : (
                <Skeleton className="h-40 w-full rounded-card" />
              )}
            </section>
          </>
        )}

        {/* Your coach, what they make of the week, and the XP ladder. Placed
            above consistency because it is the surface people come back for —
            the numbers below are the evidence behind what the coach just said. */}
        <section className="mb-5 reveal reveal-3" aria-label="Your coach">
          <CoachCard />
        </section>

        {/* Consistency — activeDays/windowDays, never a resettable streak */}
        <section className="mb-5 reveal reveal-4" aria-label="Consistency">
          <ConsistencyCard
            consistency={progress?.consistency}
            loading={progressQuery.isPending}
          />
        </section>

        {/* Weekly insight */}
        <section className="mb-5 reveal reveal-4" aria-label="Your week">
          <WeeklyInsightCard insight={insightQuery.data} loading={insightQuery.isPending} />
        </section>

        {/* Today's workout */}
        <section className="mb-5 reveal reveal-4" aria-label="Today's workout">
          {workoutQuery.isLoading ? (
            <Skeleton className="h-40 w-full rounded-card" />
          ) : session && !session.focus.toLowerCase().includes('rest') ? (
            <GlassCard className="p-card-padding relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-heading font-semibold uppercase tracking-[0.04em] text-lg text-on-surface">
                    Today's Workout
                  </h3>
                  <p className="text-sm text-on-surface-variant mt-0.5">{session.focus}</p>
                </div>
                <div className="bg-secondary/10 text-secondary px-2.5 py-1 rounded-full font-bold text-[10px] tracking-widest border border-secondary/20 uppercase">
                  {session.status === 'completed' ? 'Done' : 'Planned'}
                </div>
              </div>
              <div className="flex items-center gap-4 text-on-surface-variant/70 text-sm mb-4">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    fitness_center
                  </span>
                  <span className="tabular-nums">{session.exercises.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    schedule
                  </span>
                  <span className="tabular-nums">~{estimateDurationMinutes(session)} min</span>
                </div>
                {session.kcalBurned != null && (
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                      bolt
                    </span>
                    <span className="tabular-nums">{fmtInt(session.kcalBurned)}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate(session.id ? `/workouts/${session.id}` : '/workouts')}
                className="cta-gradient w-full py-3 rounded-xl text-on-primary font-bold text-sm shadow-cta transition-all active:scale-[0.97] uppercase tracking-[0.04em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                {session.status === 'completed' ? 'View workout' : 'Start workout'}
              </button>
            </GlassCard>
          ) : (
            <GlassCard className="p-card-padding flex items-center justify-between gap-4">
              <div>
                <h3 className="font-heading font-semibold uppercase tracking-[0.04em] text-lg text-on-surface">
                  Rest &amp; Recover
                </h3>
                <p className="text-sm text-on-surface-variant/70 mt-0.5">
                  No workout scheduled. Browse the library.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/workouts')}
                className="shrink-0 py-2 px-4 rounded-xl border border-primary/60 text-primary font-bold text-sm active:scale-95 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Explore
              </button>
            </GlassCard>
          )}
        </section>

        {/* AI meal suggestion */}
        <section className="mb-5 reveal reveal-5" aria-label="AI meal suggestion">
          <SuggestMealCard date={today} />
        </section>

        {/* Weight trend */}
        <section className="mb-5 reveal reveal-6" aria-label="Weight trend">
          <GlassCard className="p-card-padding">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-heading font-semibold uppercase tracking-[0.04em] text-lg text-on-surface">
                Weight Trend
              </h3>
              <button
                type="button"
                onClick={() => navigate('/progress')}
                className="text-primary text-sm font-medium flex items-center gap-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                View all
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  chevron_right
                </span>
              </button>
            </div>
            {trendsQuery.isLoading && progressQuery.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                {progress?.currentWeightKg != null && (
                  <p className="mb-2">
                    <span className="text-3xl font-bold tabular-nums text-on-surface">
                      {progress.currentWeightKg.toFixed(1)}
                    </span>
                    <span className="text-sm text-on-surface-variant/70 ml-1">kg</span>
                  </p>
                )}
                <Sparkline points={weightSeries.slice(-14)} />
              </>
            )}
          </GlassCard>
        </section>

        {/* Achievements strip */}
        <section className="mb-8 reveal reveal-6" aria-label="Achievements">
          <h3 className="font-heading font-semibold uppercase tracking-[0.04em] text-lg text-on-surface mb-3">
            Achievements
          </h3>
          {progressQuery.isLoading ? (
            <div className="flex gap-3">
              <Skeleton className="h-24 w-28 rounded-card" />
              <Skeleton className="h-24 w-28 rounded-card" />
              <Skeleton className="h-24 w-28 rounded-card" />
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {(progress?.achievements ?? []).slice(0, 4).map(({ definition, earnedAt }) => (
                <div
                  key={definition.id}
                  className={`card-compact shrink-0 w-28 p-3 flex flex-col items-center text-center gap-1 ${earnedAt ? '' : 'opacity-35'}`}
                >
                  <span
                    className="material-symbols-outlined text-secondary text-[28px]"
                    style={earnedAt ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    aria-hidden="true"
                  >
                    {definition.icon || 'military_tech'}
                  </span>
                  <span className="text-xs font-bold text-on-surface leading-tight">
                    {definition.name}
                  </span>
                  <span className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider">
                    {earnedAt ? 'Earned' : 'Locked'}
                  </span>
                </div>
              ))}
              {(progress?.achievements ?? []).length === 0 && (
                <p className="text-sm text-on-surface-variant/70">
                  Keep logging to unlock achievements.
                </p>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Camera FAB — anchored to the centered content column, not the viewport */}
      <div className="fixed bottom-24 inset-x-0 z-40 flex max-w-md mx-auto justify-end pr-container-margin">
        <button
          type="button"
          onClick={() => navigate('/nutrition/capture')}
          aria-label="Scan a meal with your camera"
          className="cta-gradient rounded-2xl shadow-cta flex items-center justify-center text-on-primary hover:scale-105 active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          style={{ width: '52px', height: '52px' }}
        >
          <span className="material-symbols-outlined text-[28px]" aria-hidden="true">
            photo_camera
          </span>
        </button>
      </div>
    </div>
  );
}