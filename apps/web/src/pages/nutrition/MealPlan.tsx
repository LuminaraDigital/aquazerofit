import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { DailyNutrition, MealType } from '@aquazerofit/shared';
import { api } from '@/lib/api';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  MEAL_LABEL,
  MEAL_TYPES,
  asRecommendation,
  fmtInt,
  newIdempotencyKey,
  todayLocalDate,
  type RecommendationWithRecipe,
} from '../dashboard/lib';

type SlotStatus = 'loading' | 'ready' | 'error';

interface Slot {
  status: SlotStatus;
  rec: RecommendationWithRecipe | null;
  feedback: 'up' | 'down' | null;
  logged: boolean;
}

const GRADIENTS: Record<MealType, string> = {
  breakfast: 'from-[#2fd9f4]/40 via-[#1a2122] to-[#0e1416]',
  lunch: 'from-[#45dfa4]/40 via-[#1a2122] to-[#0e1416]',
  dinner: 'from-[#22d3ee]/30 via-[#161d1e] to-[#0e1416]',
  snack: 'from-[#ffb2b9]/30 via-[#1a2122] to-[#0e1416]',
};

const emptySlots = (): Record<MealType, Slot> => ({
  breakfast: { status: 'loading', rec: null, feedback: null, logged: false },
  lunch: { status: 'loading', rec: null, feedback: null, logged: false },
  dinner: { status: 'loading', rec: null, feedback: null, logged: false },
  snack: { status: 'loading', rec: null, feedback: null, logged: false },
});

export default function MealPlan() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const today = todayLocalDate();

  const [slots, setSlots] = useState<Record<MealType, Slot>>(emptySlots);
  const startedRef = useRef(false);

  const dailyQuery = useQuery({
    queryKey: ['nutrition', 'daily', today],
    queryFn: () => api<DailyNutrition>('/analytics/nutrition/daily', { query: { date: today } }),
  });
  const daily = dailyQuery.data;

  const generate = useCallback(
    async (mealType: MealType) => {
      setSlots((s) => ({
        ...s,
        [mealType]: { status: 'loading', rec: null, feedback: null, logged: false },
      }));
      try {
        const raw = await api<unknown>('/recommendations/meals', {
          method: 'POST',
          body: { mealType, localDate: today },
        });
        const rec = asRecommendation(raw);
        setSlots((s) => ({
          ...s,
          [mealType]: rec
            ? { status: 'ready', rec, feedback: rec.feedback ?? null, logged: false }
            : { status: 'error', rec: null, feedback: null, logged: false },
        }));
      } catch {
        setSlots((s) => ({
          ...s,
          [mealType]: { status: 'error', rec: null, feedback: null, logged: false },
        }));
      }
    },
    [today],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    MEAL_TYPES.forEach((mt) => void generate(mt));
  }, [generate]);

  const logRec = useMutation({
    mutationFn: (id: string) =>
      api(`/recommendations/${id}/log`, { method: 'POST', idempotencyKey: newIdempotencyKey() }),
    onSuccess: (_data, id) => {
      show('Added to your log');
      setSlots((s) => {
        const next = { ...s };
        for (const mt of MEAL_TYPES) {
          if (next[mt].rec?.id === id) next[mt] = { ...next[mt], logged: true };
        }
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['nutrition'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
    onError: () => show('Could not log that meal — please try again'),
  });

  const sendFeedback = useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: 'up' | 'down' }) =>
      api(`/recommendations/${id}/feedback`, { method: 'POST', body: { feedback } }),
    onError: () => show('Feedback failed to send'),
  });

  const ready = MEAL_TYPES.map((mt) => slots[mt]).filter(
    (s): s is Slot & { rec: RecommendationWithRecipe } => s.status === 'ready' && s.rec !== null,
  );
  const plannedKcal = ready.reduce((a, s) => a + s.rec.kcal, 0);
  const plannedProtein = ready.reduce((a, s) => a + s.rec.proteinG, 0);

  return (
    <div className="max-w-md mx-auto min-h-screen pb-10">
      <AppHeader title="Meal Plan" back />

      <main className="px-container-margin mt-4">
        {/* Header */}
        <section className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="font-heading font-semibold uppercase tracking-[0.03em] text-3xl text-on-surface">
              Your AI Meal Plan
            </h1>
            <p className="text-base text-on-surface-variant">Fueling your aquatic performance.</p>
          </div>
          <button
            type="button"
            aria-label="Regenerate the whole plan"
            onClick={() => MEAL_TYPES.forEach((mt) => void generate(mt))}
            className="w-12 h-12 flex items-center justify-center rounded-full glass-card text-secondary transition-transform active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              refresh
            </span>
          </button>
        </section>

        {/* Daily totals vs targets */}
        <section className="mb-6" aria-label="Planned totals">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-primary">
              Today's Selection
            </h2>
            <span className="text-sm text-secondary font-medium tabular-nums">
              {ready.length} meals · {fmtInt(plannedKcal)} kcal
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Planned kcal"
              value={fmtInt(plannedKcal)}
              unit={daily ? `/ ${fmtInt(daily.kcalTarget)}` : undefined}
              tone="aqua"
              icon="bolt"
              loading={dailyQuery.isLoading}
            />
            <MetricCard
              label="Planned protein"
              value={fmtInt(plannedProtein)}
              unit={daily ? `g / ${fmtInt(daily.proteinG.target)}g` : 'g'}
              tone="green"
              icon="fitness_center"
              loading={dailyQuery.isLoading}
            />
          </div>
        </section>

        {/* Meal cards */}
        <section className="space-y-4 mb-8" aria-label="Suggested meals">
          {MEAL_TYPES.map((mealType) => {
            const slot = slots[mealType];
            if (slot.status === 'loading') {
              return (
                <GlassCard key={mealType} className="overflow-hidden">
                  <Skeleton className="h-32 w-full" />
                  <div className="p-card-padding space-y-3">
                    <Skeleton className="h-6 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                </GlassCard>
              );
            }
            if (slot.status === 'error' || !slot.rec) {
              return (
                <GlassCard key={mealType} className="p-card-padding flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-on-surface">{MEAL_LABEL[mealType]}</p>
                    <p className="text-sm text-on-surface-variant">
                      Couldn't generate a suggestion.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generate(mealType)}
                    className="shrink-0 py-2 px-4 rounded-xl border border-primary text-primary font-bold active:scale-95 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Retry
                  </button>
                </GlassCard>
              );
            }
            const rec = slot.rec;
            return (
              <GlassCard key={mealType} className="overflow-hidden">
                {/* Gradient image placeholder header */}
                <div className={`relative h-32 bg-gradient-to-br ${GRADIENTS[mealType]}`}>
                  <span
                    className="absolute inset-0 flex items-center justify-center material-symbols-outlined text-on-surface/20 text-[64px]"
                    aria-hidden="true"
                  >
                    restaurant
                  </span>
                  <span className="absolute top-3 left-3 bg-surface/60 backdrop-blur-md text-on-surface px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                    {MEAL_LABEL[mealType]}
                  </span>
                  <span className="absolute bottom-3 right-3 bg-secondary text-on-secondary px-2 py-1 rounded-lg text-sm font-bold flex items-center gap-1 shadow-lg tabular-nums">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                      bolt
                    </span>
                    {fmtInt(rec.kcal)} kcal
                  </span>
                </div>

                <div className="p-card-padding">
                  <div className="flex justify-between items-start gap-3 mb-1">
                    <h3 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface">
                      {rec.name}
                    </h3>
                    <button
                      type="button"
                      aria-label={`Regenerate ${MEAL_LABEL[mealType]} suggestion`}
                      onClick={() => void generate(mealType)}
                      className="text-on-surface-variant hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        refresh
                      </span>
                    </button>
                  </div>
                  <p className="text-xs text-on-surface-variant tabular-nums mb-2">
                    P {Math.round(rec.proteinG)}g · C {Math.round(rec.carbsG)}g · F{' '}
                    {Math.round(rec.fatG)}g
                  </p>
                  <p className="text-sm text-on-surface-variant mb-4">{rec.rationale}</p>

                  {rec.recipeId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/recipes/${rec.recipeId}`)}
                      className="mb-4 text-primary text-sm font-bold flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      View recipe
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                        chevron_right
                      </span>
                    </button>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => logRec.mutate(rec.id)}
                      disabled={slot.logged || logRec.isPending}
                      className="flex-1 h-12 rounded-xl cta-gradient text-on-primary font-bold active:scale-[0.98] transition-transform disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {slot.logged ? 'Logged ✓' : 'Log this'}
                    </button>
                    <button
                      type="button"
                      aria-label="This suggestion is good"
                      aria-pressed={slot.feedback === 'up'}
                      onClick={() => {
                        setSlots((s) => ({ ...s, [mealType]: { ...s[mealType], feedback: 'up' } }));
                        sendFeedback.mutate({ id: rec.id, feedback: 'up' });
                      }}
                      className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                        slot.feedback === 'up'
                          ? 'border-secondary text-secondary bg-secondary/10'
                          : 'border-outline-variant text-on-surface-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        thumb_up
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="This suggestion is not for me"
                      aria-pressed={slot.feedback === 'down'}
                      onClick={() => {
                        setSlots((s) => ({
                          ...s,
                          [mealType]: { ...s[mealType], feedback: 'down' },
                        }));
                        sendFeedback.mutate({ id: rec.id, feedback: 'down' });
                      }}
                      className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                        slot.feedback === 'down'
                          ? 'border-tertiary-container text-tertiary-container bg-tertiary-container/10'
                          : 'border-outline-variant text-on-surface-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        thumb_down
                      </span>
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </section>

        {/* Regenerate callout */}
        <section className="mb-8">
          <GlassCard className="p-6 relative overflow-hidden">
            <div
              className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16"
              aria-hidden="true"
            />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 cta-gradient rounded-full flex items-center justify-center text-on-primary">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    smart_toy
                  </span>
                </div>
                <h4 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface">
                  Not feeling these?
                </h4>
              </div>
              <p className="text-base text-on-surface-variant mb-5">
                Regenerate a fresh plan built around what you have left today — your targets,
                preferences and allergies are always respected.
              </p>
              <button
                type="button"
                onClick={() => MEAL_TYPES.forEach((mt) => void generate(mt))}
                className="w-full py-4 cta-gradient text-on-primary rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  auto_fix_high
                </span>
                Regenerate My Meal Plan
              </button>
            </div>
          </GlassCard>
        </section>
      </main>
    </div>
  );
}
