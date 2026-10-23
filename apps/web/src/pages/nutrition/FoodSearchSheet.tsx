import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Food, MealLogItem } from '@aquazerofit/shared';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { fmtInt, round1 } from '../dashboard/lib';
import { GramsStepper } from './GramsStepper';
import { itemFromFood } from './nutritionMath';

function normaliseFoods(raw: unknown): Food[] {
  if (Array.isArray(raw)) return raw as Food[];
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Food[];
    if (Array.isArray(o.foods)) return o.foods as Food[];
  }
  return [];
}

/**
 * Bottom-sheet food search (debounced GET /foods?search=) with a grams portion
 * stepper. Calls onPick with a fully computed MealLogItem.
 */
export function FoodSearchSheet({
  open,
  title,
  onClose,
  onPick,
  pending = false,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onPick: (item: MealLogItem) => void;
  /** True while the caller's log mutation is in flight: disables Add so a
   *  double-tap cannot submit twice. */
  pending?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState(100);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, onClose);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (!open) {
      setTerm('');
      setDebounced('');
      setSelected(null);
      setGrams(100);
    }
  }, [open]);

  const foodsQuery = useQuery({
    queryKey: ['foods', debounced],
    queryFn: () => api<unknown>('/foods', { query: { search: debounced, limit: 20 } }),
    enabled: open && debounced.length >= 2,
  });
  const foods = normaliseFoods(foodsQuery.data);

  if (!open) return null;

  const preview = selected ? itemFromFood(selected, grams) : null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title ?? 'Add food'}>
      <button
        type="button"
        aria-label="Close food search"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-surface-container-high rounded-t-3xl border-t border-border-aqua p-5 pb-8 max-h-[85vh] overflow-y-auto outline-none"
      >
        <div className="w-12 h-1.5 bg-outline-variant rounded-full mx-auto mb-4" aria-hidden="true" />
        <h3 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface mb-4">
          {title ?? 'Add food'}
        </h3>

        {!selected ? (
          <>
            <Input
              label="Search foods"
              icon="search"
              value={term}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTerm(e.target.value)}
              placeholder="e.g. chicken breast"
              autoFocus
            />
            <div className="mt-4 space-y-2" aria-live="polite">
              {foodsQuery.isFetching && (
                <>
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </>
              )}
              {!foodsQuery.isFetching && debounced.length >= 2 && foods.length === 0 && (
                <EmptyState
                  icon="search_off"
                  title="No foods found"
                  body="Try a shorter or different name."
                />
              )}
              {!foodsQuery.isFetching &&
                foods.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => {
                      setSelected(food);
                      setGrams(food.commonServings[0]?.grams ?? 100);
                    }}
                    className="w-full flex justify-between items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant text-left active:scale-[0.99] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <div>
                      <p className="font-bold text-on-surface">{food.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {food.brand ? `${food.brand} · ` : ''}
                        {food.category}
                      </p>
                    </div>
                    <span className="text-sm text-primary font-bold tabular-nums whitespace-nowrap">
                      {Math.round(food.per100g.kcal)} kcal/100g
                    </span>
                  </button>
                ))}
              {debounced.length < 2 && !foodsQuery.isFetching && (
                <p className="text-sm text-on-surface-variant text-center py-6">
                  Type at least two letters to search the food library.
                </p>
              )}
            </div>
          </>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-primary text-sm font-medium mb-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_back
              </span>
              Back to search
            </button>
            <p className="font-bold text-on-surface text-lg mb-1">{selected.name}</p>
            <p className="text-xs text-on-surface-variant mb-4">
              {Math.round(selected.per100g.kcal)} kcal · P {round1(selected.per100g.proteinG)}g · C{' '}
              {round1(selected.per100g.carbsG)}g · F {round1(selected.per100g.fatG)}g per 100g
            </p>
            {selected.commonServings.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selected.commonServings.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setGrams(s.grams)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                      grams === s.grams
                        ? 'border-primary text-on-primary bg-primary'
                        : 'border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {s.label} ({s.grams}g)
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-on-surface">Portion</span>
              <GramsStepper value={grams} onChange={setGrams} label={selected.name} />
            </div>
            {preview && (
              <div className="rounded-xl bg-surface-container-low border border-outline-variant p-4 mb-4 tabular-nums">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-on-surface-variant">Calories</span>
                  <span className="font-bold text-primary">{fmtInt(preview.kcal)} kcal</span>
                </div>
                <div className="flex justify-between text-xs text-on-surface-variant">
                  <span>Protein {preview.proteinG}g</span>
                  <span>Carbs {preview.carbsG}g</span>
                  <span>Fat {preview.fatG}g</span>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => preview && !pending && onPick(preview)}
              disabled={pending || !preview}
              className="cta-gradient w-full h-14 rounded-xl text-on-primary font-bold active:scale-[0.98] transition-transform disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {pending ? 'Adding…' : `Add ${grams}g`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
