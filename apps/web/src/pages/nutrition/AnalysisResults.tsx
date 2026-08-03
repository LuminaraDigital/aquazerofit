import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { MealLogItem, VisionJob } from '@aquazerofit/shared';
import { AQUA_CHARACTER } from '@aquazerofit/shared';
import { api } from '@/lib/api';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Chip } from '@/components/ui/Chip';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { ShareMoment } from '@/components/share/ShareMoment';
import type { ShareCardPayload } from '@/lib/shareCard';
import { useMe } from '@/lib/queries';
import { FoodSearchSheet, GramsStepper } from './Nutrition';
import { fmtInt, round1, todayLocalDate } from '../dashboard/lib';

/** Review item: keeps per-gram ratios so edits recompute deterministically in code. */
interface ReviewItem {
  key: string;
  foodId?: string;
  name: string;
  grams: number;
  perGram: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  confidence: number | null;
}

function confidenceTone(c: number): { label: string; tone: 'green' | 'aqua' | 'coral' } {
  if (c >= 0.75) return { label: `High ${Math.round(c * 100)}%`, tone: 'green' };
  if (c >= 0.5) return { label: `Medium ${Math.round(c * 100)}%`, tone: 'aqua' };
  return { label: `Low ${Math.round(c * 100)}%`, tone: 'coral' };
}

function toMealLogItem(item: ReviewItem): MealLogItem {
  return {
    foodId: item.foodId,
    name: item.name,
    grams: item.grams,
    kcal: Math.round(item.perGram.kcal * item.grams),
    proteinG: round1(item.perGram.proteinG * item.grams),
    carbsG: round1(item.perGram.carbsG * item.grams),
    fatG: round1(item.perGram.fatG * item.grams),
  };
}

export default function AnalysisResults() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const me = useMe();

  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null);

  const jobQuery = useQuery({
    queryKey: ['vision', jobId],
    queryFn: async () => {
      // GET /meal-photos/:jobId responds { job }.
      const data = await api<unknown>(`/meal-photos/${jobId}`);
      return data && typeof data === 'object' && 'job' in (data as Record<string, unknown>)
        ? (data as { job: VisionJob }).job
        : (data as VisionJob);
    },
    enabled: jobId.length > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'processing' ? 1000 : false;
    },
  });

  const job = jobQuery.data;

  // Seed the editable list once when predictions arrive - never auto-commit.
  useEffect(() => {
    if (job?.status === 'succeeded' && items === null) {
      setItems(
        job.predictions.map((p, i) => ({
          key: `pred-${i}`,
          foodId: p.foodId,
          name: p.name,
          grams: Math.max(1, Math.round(p.estimatedGrams)),
          perGram: {
            kcal: p.estimatedGrams > 0 ? p.kcal / p.estimatedGrams : 0,
            proteinG: p.estimatedGrams > 0 ? p.proteinG / p.estimatedGrams : 0,
            carbsG: p.estimatedGrams > 0 ? p.carbsG / p.estimatedGrams : 0,
            fatG: p.estimatedGrams > 0 ? p.fatG / p.estimatedGrams : 0,
          },
          confidence: typeof p.confidence === 'number' ? p.confidence : null,
        })),
      );
    }
  }, [job, items]);

  const computed = useMemo(() => (items ?? []).map(toMealLogItem), [items]);
  const totals = useMemo(
    () =>
      computed.reduce(
        (acc, i) => ({
          kcal: acc.kcal + i.kcal,
          proteinG: acc.proteinG + i.proteinG,
          carbsG: acc.carbsG + i.carbsG,
          fatG: acc.fatG + i.fatG,
        }),
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      ),
    [computed],
  );

  const confirm = useMutation({
    mutationFn: () =>
      api(`/meal-photos/${jobId}/confirm`, {
        method: 'POST',
        body: {
          mealType: job?.mealType ?? 'lunch',
          localDate: todayLocalDate(),
          items: computed,
        },
      }),
    onSuccess: () => {
      show('Meal logged from photo');
      void queryClient.invalidateQueries({ queryKey: ['nutrition'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      setSharePayload({
        kind: 'meal',
        headline: `${fmtInt(totals.kcal)} kcal logged`,
        subline: `${computed.length} item${computed.length === 1 ? '' : 's'} · ${job?.mealType ?? 'meal'}`,
        stats: [
          { label: 'Protein', value: `${Math.round(totals.proteinG)}g` },
          { label: 'Carbs', value: `${Math.round(totals.carbsG)}g` },
          { label: 'Fat', value: `${Math.round(totals.fatG)}g` },
        ],
        catchphrase: AQUA_CHARACTER.catchphrases[0],
      });
      setShareOpen(true);
    },
    onError: () => show('Could not save the meal - please try again'),
  });

  const scanning = !job || job.status === 'queued' || job.status === 'processing';

  return (
    <div className="max-w-md mx-auto min-h-screen pb-10">
      <AppHeader title="Analysis Results" back />

      <main className="px-container-margin mt-4 space-y-6">
        {jobQuery.isError ? (
          <ErrorState
            message="We couldn't load this analysis."
            retry={() => void jobQuery.refetch()}
          />
        ) : scanning ? (
          /* Scanning state */
          <section aria-live="polite">
            <GlassCard className="p-card-padding flex flex-col items-center text-center">
              <div className="relative w-32 h-32 mb-6" aria-hidden="true">
                <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
                <div className="absolute inset-2 rounded-full border-2 border-primary/50 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[48px]">
                    filter_center_focus
                  </span>
                </div>
              </div>
              <h2 className="font-heading font-semibold uppercase tracking-[0.02em] text-2xl text-on-surface mb-1">
                Analyzing your meal
              </h2>
              <p className="text-sm text-on-surface-variant mb-6">
                Our AI is identifying what's on your plate…
              </p>
              <div className="w-full space-y-3">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            </GlassCard>
          </section>
        ) : job.status === 'failed' ? (
          /* Failed state - never auto-commits, offer retry and manual path */
          <section>
            <ErrorState
              message={job.error ?? "We couldn't identify this meal from the photo."}
              retry={() => navigate('/nutrition/capture')}
            />
            <button
              type="button"
              onClick={() => navigate('/nutrition')}
              className="mt-4 w-full py-3 rounded-xl border border-primary text-primary font-bold active:scale-95 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Log it manually instead
            </button>
          </section>
        ) : (
          /* Succeeded (or already confirmed) - editable review */
          <>
            <section aria-label="Analysis summary">
              <GlassCard className="p-card-padding flex items-center justify-between">
                <div>
                  <h2 className="text-sm text-on-surface-variant mb-1">Estimated Calories</h2>
                  <p className="text-3xl font-bold text-primary tabular-nums">
                    {fmtInt(totals.kcal)}{' '}
                    <span className="text-sm font-medium text-on-surface-variant">kcal</span>
                  </p>
                </div>
                <div className="text-right text-xs text-on-surface-variant tabular-nums space-y-1">
                  <p>
                    Protein <span className="text-secondary font-bold">{round1(totals.proteinG)}g</span>
                  </p>
                  <p>
                    Carbs <span className="text-primary font-bold">{round1(totals.carbsG)}g</span>
                  </p>
                  <p>
                    Fat{' '}
                    <span className="text-tertiary-container font-bold">{round1(totals.fatG)}g</span>
                  </p>
                </div>
              </GlassCard>
            </section>

            <section className="space-y-3" aria-label="Detected items">
              <div className="flex justify-between items-center">
                <h3 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                    list_alt
                  </span>
                  Analysis Breakdown
                </h3>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="text-primary text-sm font-bold flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    add_circle
                  </span>
                  Add item
                </button>
              </div>

              {(items ?? []).length === 0 && (
                <GlassCard className="p-card-padding text-center">
                  <p className="text-sm text-on-surface-variant">
                    No items on the list - add what was on your plate before confirming.
                  </p>
                </GlassCard>
              )}

              {(items ?? []).map((item, idx) => {
                const display = toMealLogItem(item);
                return (
                  <GlassCard key={item.key} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1">
                        <label
                          className="text-[11px] uppercase tracking-wide text-on-surface-variant block mb-1"
                          htmlFor={`item-name-${item.key}`}
                        >
                          Item name
                        </label>
                        <input
                          id={`item-name-${item.key}`}
                          type="text"
                          value={item.name}
                          onChange={(e) =>
                            setItems((prev) =>
                              (prev ?? []).map((it, i) =>
                                i === idx ? { ...it, name: e.target.value } : it,
                              ),
                            )
                          }
                          className="w-full bg-transparent border-b-2 border-border-aqua focus:border-primary text-on-surface font-bold py-1 focus:outline-none transition-colors"
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() =>
                          setItems((prev) => (prev ?? []).filter((_, i) => i !== idx))
                        }
                        className="text-on-surface-variant hover:text-tertiary-container mt-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          delete
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between mb-3">
                      <GramsStepper
                        value={item.grams}
                        label={item.name}
                        onChange={(grams) =>
                          setItems((prev) =>
                            (prev ?? []).map((it, i) => (i === idx ? { ...it, grams } : it)),
                          )
                        }
                      />
                      <span className="text-primary font-bold tabular-nums whitespace-nowrap">
                        {fmtInt(display.kcal)} kcal
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-on-surface-variant tabular-nums">
                        P {display.proteinG}g · C {display.carbsG}g · F {display.fatG}g
                      </p>
                      {item.confidence != null &&
                        (() => {
                          const c = confidenceTone(item.confidence);
                          return <Chip label={c.label} tone={c.tone} />;
                        })()}
                    </div>
                  </GlassCard>
                );
              })}
            </section>

            {/* Disclaimer + confirm */}
            <section className="space-y-4 pb-6">
              <p className="text-xs text-on-surface-variant text-center px-4">
                These are AI estimates - please check the items and portions before saving. Nothing
                is added to your log until you confirm.
              </p>
              <button
                type="button"
                onClick={() => confirm.mutate()}
                disabled={confirm.isPending || computed.length === 0 || job.status === 'confirmed'}
                className="cta-gradient w-full py-4 rounded-xl font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-primary shadow-lg shadow-secondary/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span>
                  {job.status === 'confirmed'
                    ? 'Already logged'
                    : confirm.isPending
                      ? 'Saving…'
                      : 'Looks right, log it'}
                </span>
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
            </section>
          </>
        )}
      </main>

      {/* Add missing item via food search */}
      <FoodSearchSheet
        open={addOpen}
        title="Add a missing item"
        onClose={() => setAddOpen(false)}
        onPick={(picked) => {
          setItems((prev) => [
            ...(prev ?? []),
            {
              key: `manual-${Date.now()}`,
              foodId: picked.foodId,
              name: picked.name,
              grams: picked.grams,
              perGram: {
                kcal: picked.grams > 0 ? picked.kcal / picked.grams : 0,
                proteinG: picked.grams > 0 ? picked.proteinG / picked.grams : 0,
                carbsG: picked.grams > 0 ? picked.carbsG / picked.grams : 0,
                fatG: picked.grams > 0 ? picked.fatG / picked.grams : 0,
              },
              confidence: null,
            },
          ]);
          setAddOpen(false);
        }}
      />

      <ShareMoment
        open={shareOpen}
        onClose={() => {
          setShareOpen(false);
          navigate('/nutrition');
        }}
        payload={sharePayload}
        userId={me.data?.id ?? null}
        invitePath="/welcome"
      />
    </div>
  );
}
