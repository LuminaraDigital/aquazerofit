import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { Recipe } from '@aquazerofit/shared';
import { ApiError, api } from '@/lib/api';
import { fetchPriorityHigh } from '@/lib/fetchPriority';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import {
  fmtInt,
  mealTypeForNow,
  newIdempotencyKey,
  round1,
  todayLocalDate,
} from '../dashboard/lib';

/** Approximate grams for one serving from the ingredient list (deterministic). */
function gramsPerServing(recipe: Recipe): number {
  const total = recipe.ingredients.reduce((acc, i) => acc + (i.grams || 0), 0);
  if (total > 0 && recipe.servings > 0) return Math.round(total / recipe.servings);
  return 350;
}

export default function RecipeDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show } = useToast();

  const [servings, setServings] = useState(1);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [imageFailed, setImageFailed] = useState(false);

  const recipeQuery = useQuery({
    queryKey: ['recipes', id],
    queryFn: async () => {
      // The API wraps single resources: GET /recipes/:id → { recipe }.
      const data = await api<unknown>(`/recipes/${id}`);
      const maybe =
        data && typeof data === 'object' && 'recipe' in (data as Record<string, unknown>)
          ? (data as { recipe: Recipe }).recipe
          : (data as Recipe);
      return maybe;
    },
    enabled: id.length > 0,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  const recipe = recipeQuery.data;

  const logMeal = useMutation({
    mutationFn: (r: Recipe) =>
      api('/meal-logs', {
        method: 'POST',
        body: {
          mealType: mealTypeForNow(),
          localDate: todayLocalDate(),
          items: [
            {
              name: r.name,
              grams: gramsPerServing(r) * servings,
              kcal: Math.round(r.perServing.kcal * servings),
              proteinG: round1(r.perServing.proteinG * servings),
              carbsG: round1(r.perServing.carbsG * servings),
              fatG: round1(r.perServing.fatG * servings),
            },
          ],
        },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      show('Meal logged');
      void queryClient.invalidateQueries({ queryKey: ['nutrition'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      navigate('/nutrition');
    },
    onError: () => show('Could not log this meal — please try again'),
  });

  const notFound =
    recipeQuery.isError && recipeQuery.error instanceof ApiError && recipeQuery.error.status === 404;

  return (
    <div className="max-w-md mx-auto min-h-screen pb-10">
      <AppHeader title="Recipe" back />

      <main className="mt-4">
        {recipeQuery.isLoading ? (
          <div className="px-container-margin space-y-4">
            <Skeleton className="h-64 w-full rounded-[2rem]" />
            <div className="grid grid-cols-4 gap-3">
              <Skeleton className="h-20 rounded-card" />
              <Skeleton className="h-20 rounded-card" />
              <Skeleton className="h-20 rounded-card" />
              <Skeleton className="h-20 rounded-card" />
            </div>
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
        ) : notFound ? (
          <div className="px-container-margin">
            <ErrorState message="Recipe not found." retry={() => navigate('/nutrition/meal-plan')} />
          </div>
        ) : recipeQuery.isError || !recipe ? (
          <div className="px-container-margin">
            <ErrorState
              message="We couldn't load this recipe."
              retry={() => void recipeQuery.refetch()}
            />
          </div>
        ) : (
          <>
            {/* Hero */}
            <section className="px-container-margin mb-6">
              <div className="relative w-full h-[42vh] min-h-[280px] rounded-[2rem] overflow-hidden shadow-2xl">
                {recipe.imageUrl && !imageFailed ? (
                  // Page hero and its LCP element, so eager + high priority.
                  // No width/height: `imageUrl` is remote content-record art of
                  // unknown intrinsic size, and the hero box is already pinned
                  // by the wrapper's h-[42vh] min-h-[280px], so there is no
                  // layout shift left for an attribute to remove.
                  <img
                    src={recipe.imageUrl}
                    alt={`Plated ${recipe.name}`}
                    loading="eager"
                    decoding="async"
                    {...fetchPriorityHigh()}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-[#22d3ee]/50 via-[#1a2122] to-[#090f11] flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <span className="material-symbols-outlined text-primary/30 text-[120px]">
                      restaurant
                    </span>
                  </div>
                )}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-[#090f11] via-transparent to-transparent z-10"
                  aria-hidden="true"
                />
                <div className="absolute bottom-0 left-0 w-full p-card-padding z-20">
                  <h1 className="font-heading font-semibold uppercase tracking-[0.03em] text-3xl text-white mb-2 leading-tight">
                    {recipe.name}
                  </h1>
                  <div className="flex flex-wrap gap-2">
                    {recipe.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-primary/10 border border-primary/20 backdrop-blur-md rounded-full text-primary text-sm font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Stats row: times + servings */}
            <section
              className="px-container-margin mb-4 flex items-center justify-between text-sm text-on-surface-variant"
              aria-label="Preparation details"
            >
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
                  schedule
                </span>
                <span className="tabular-nums">Prep {recipe.prepMinutes}m</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
                  skillet
                </span>
                <span className="tabular-nums">Cook {recipe.cookMinutes}m</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
                  group
                </span>
                <span className="tabular-nums">Serves {recipe.servings}</span>
              </div>
            </section>

            {/* Macros grid (per serving) */}
            <section className="px-container-margin mb-6" aria-label="Nutrition per serving">
              <div className="grid grid-cols-4 gap-3">
                <GlassCard className="p-4 flex flex-col items-center justify-center text-center">
                  <span className="text-on-surface-variant text-[11px] uppercase tracking-wider mb-1">
                    Calories
                  </span>
                  <span className="text-2xl font-bold text-primary tabular-nums">
                    {fmtInt(recipe.perServing.kcal)}
                  </span>
                </GlassCard>
                <GlassCard className="p-4 flex flex-col items-center justify-center text-center border-b-2 border-b-secondary">
                  <span className="text-on-surface-variant text-[11px] uppercase tracking-wider mb-1">
                    Protein
                  </span>
                  <span className="text-2xl font-bold text-secondary tabular-nums">
                    {Math.round(recipe.perServing.proteinG)}g
                  </span>
                </GlassCard>
                <GlassCard className="p-4 flex flex-col items-center justify-center text-center border-b-2 border-b-primary">
                  <span className="text-on-surface-variant text-[11px] uppercase tracking-wider mb-1">
                    Carbs
                  </span>
                  <span className="text-2xl font-bold text-primary tabular-nums">
                    {Math.round(recipe.perServing.carbsG)}g
                  </span>
                </GlassCard>
                <GlassCard className="p-4 flex flex-col items-center justify-center text-center border-b-2 border-b-tertiary-container">
                  <span className="text-on-surface-variant text-[11px] uppercase tracking-wider mb-1">
                    Fats
                  </span>
                  <span className="text-2xl font-bold text-tertiary-container tabular-nums">
                    {Math.round(recipe.perServing.fatG)}g
                  </span>
                </GlassCard>
              </div>
            </section>

            {/* Servings stepper */}
            <section className="px-container-margin mb-6 flex justify-between items-center">
              <div>
                <h3 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface">
                  Servings
                </h3>
                <p className="text-sm text-on-surface-variant">Adjust before logging</p>
              </div>
              <div className="flex items-center gap-4 bg-surface-container-high rounded-full p-2 border border-outline-variant">
                <button
                  type="button"
                  aria-label="One less serving"
                  onClick={() => setServings((s) => Math.max(1, s - 1))}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container text-primary active:scale-90 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    remove
                  </span>
                </button>
                <span
                  className="text-2xl font-bold text-on-surface w-6 text-center tabular-nums"
                  aria-live="polite"
                  aria-label={`${servings} servings selected`}
                >
                  {servings}
                </span>
                <button
                  type="button"
                  aria-label="One more serving"
                  onClick={() => setServings((s) => Math.min(10, s + 1))}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container text-primary active:scale-90 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    add
                  </span>
                </button>
              </div>
            </section>

            {/* Ingredients checklist */}
            <section className="px-container-margin mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                  shopping_basket
                </span>
                <h2 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface">
                  Ingredients
                </h2>
              </div>
              <ul className="space-y-3">
                {recipe.ingredients.map((ing, idx) => {
                  const isChecked = checked.has(idx);
                  return (
                    <li key={`${ing.name}-${idx}`}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        aria-label={`${ing.name}, ${ing.quantity}`}
                        onClick={() =>
                          setChecked((prev) => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            return next;
                          })
                        }
                        className={`flex items-center gap-4 w-full glass-card p-4 text-left transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${isChecked ? 'opacity-50' : ''}`}
                      >
                        <span
                          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${
                            isChecked ? 'bg-secondary border-secondary' : 'border-outline-variant'
                          }`}
                          aria-hidden="true"
                        >
                          {isChecked && (
                            <span className="material-symbols-outlined text-on-secondary text-[18px] font-bold">
                              check
                            </span>
                          )}
                        </span>
                        <span className="flex-1 flex justify-between items-center gap-2">
                          <span className="text-on-surface">{ing.name}</span>
                          <span className="text-primary text-sm font-bold tabular-nums whitespace-nowrap">
                            {ing.quantity}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Method */}
            <section className="px-container-margin mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  menu_book
                </span>
                <h2 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface">
                  Method
                </h2>
              </div>
              <ol className="space-y-6 relative border-l-2 border-primary/20 ml-4 pl-8">
                {recipe.method.map((step, idx) => (
                  <li key={idx} className="relative">
                    <span
                      className="absolute -left-11 top-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-on-primary tabular-nums"
                      aria-hidden="true"
                    >
                      {idx + 1}
                    </span>
                    <p className="text-on-surface-variant">{step}</p>
                  </li>
                ))}
              </ol>
            </section>

            {/* Log CTA */}
            <section className="px-container-margin pb-6">
              <button
                type="button"
                onClick={() => logMeal.mutate(recipe)}
                disabled={logMeal.isPending}
                className="cta-gradient w-full h-14 rounded-xl flex items-center justify-center gap-2 text-on-primary font-bold shadow-lg shadow-secondary/20 active:scale-95 transition-transform disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  restaurant
                </span>
                {logMeal.isPending
                  ? 'Logging…'
                  : `Log this meal (${fmtInt(recipe.perServing.kcal * servings)} kcal)`}
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
