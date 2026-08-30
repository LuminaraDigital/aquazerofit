import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  DailyNutrition,
  Food,
  MealLog,
  MealLogItem,
  MealType,
  TrendPoint,
} from '@aquazerofit/shared';
import { api } from '@/lib/api';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { RingProgress } from '@/components/ui/RingProgress';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { MacroBar } from '../dashboard/MacroBar';
import { WaterCard } from '../dashboard/WaterCard';
import { BarcodeSheet } from './BarcodeSheet';
import { CircularMacroRing } from '@/components/ui/CircularMacroRing';
import { AquaCalendarPicker, type DayStatus } from '@/components/ui/AquaCalendarPicker';
import { AquaStatusline } from '@/components/ui/AquaStatusline';
import { useDeepLinkRouter } from '@/lib/deeplink';
import {
  insertPendingMealLog,
  isPendingId,
  optimisticPatch,
  pendingMealLog,
} from '@/lib/optimistic';
import {
  MEAL_ICON,
  MEAL_LABEL,
  MEAL_TYPES,
  fmtInt,
  formatShortDate,
  newIdempotencyKey,
  round1,
  shiftLocalDate,
  todayLocalDate,
} from '../dashboard/lib';

// ---------------------------------------------------------------- shared bits

/** Grams stepper used by the food sheet, meal editing and photo analysis review. */
export function GramsStepper({
  value,
  onChange,
  label,
  step = 10,
  min = 5,
  max = 2000,
}: {
  value: number;
  onChange: (grams: number) => void;
  label?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  return (
    <div className="flex items-center gap-2 bg-surface-container rounded-full p-1 border border-outline-variant">
      <button
        type="button"
        aria-label={`Decrease ${label ?? 'portion'} by ${step} grams`}
        onClick={() => onChange(clamp(value - step))}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-high text-primary active:scale-90 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          remove
        </span>
      </button>
      <label className="sr-only" htmlFor={`grams-${label ?? 'portion'}`}>
        {label ?? 'Portion'} grams
      </label>
      <input
        id={`grams-${label ?? 'portion'}`}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        className="w-14 bg-transparent text-center font-bold tabular-nums text-on-surface focus:outline-none"
      />
      <span className="text-xs text-on-surface-variant pr-1">g</span>
      <button
        type="button"
        aria-label={`Increase ${label ?? 'portion'} by ${step} grams`}
        onClick={() => onChange(clamp(value + step))}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-high text-primary active:scale-90 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          add
        </span>
      </button>
    </div>
  );
}

function normaliseFoods(raw: unknown): Food[] {
  if (Array.isArray(raw)) return raw as Food[];
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Food[];
    if (Array.isArray(o.foods)) return o.foods as Food[];
  }
  return [];
}

/** Deterministic client-side kcal/macros from per-100g values (never model-estimated). */
export function itemFromFood(food: Food, grams: number): MealLogItem {
  const factor = grams / 100;
  return {
    foodId: food.id,
    name: food.name,
    grams,
    kcal: Math.round(food.per100g.kcal * factor),
    proteinG: round1(food.per100g.proteinG * factor),
    carbsG: round1(food.per100g.carbsG * factor),
    fatG: round1(food.per100g.fatG * factor),
  };
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
  /** True while the caller's log mutation is in flight — disables Add so a
   *  double-tap cannot submit twice. */
  pending?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState(100);

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
      <div className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-surface-container-high rounded-t-3xl border-t border-border-aqua p-5 pb-8 max-h-[85vh] overflow-y-auto">
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

// ------------------------------------------------------------------ page

interface TrendsResponse {
  kcal?: TrendPoint[];
}

/** Per-item scale factors from originally logged values (deterministic rescale). */
function rescaleItem(original: MealLogItem, grams: number): MealLogItem {
  const factor = original.grams > 0 ? grams / original.grams : 0;
  return {
    ...original,
    grams,
    kcal: Math.round(original.kcal * factor),
    proteinG: round1(original.proteinG * factor),
    carbsG: round1(original.carbsG * factor),
    fatG: round1(original.fatG * factor),
  };
}

export default function Nutrition() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show } = useToast();

  useDeepLinkRouter(navigate);

  const today = todayLocalDate();
  const [date, setDate] = useState(today);
  const isToday = date === today;

  const [addSheetMeal, setAddSheetMeal] = useState<MealType | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showStatusline, setShowStatusline] = useState(false);
  const [microOpen, setMicroOpen] = useState(false);
  const [macroRingMode, setMacroRingMode] = useState<'concentric' | 'single'>('concentric');
  const [editingLog, setEditingLog] = useState<MealLog | null>(null);
  // Each editable row keeps the ORIGINAL logged item beside the shown one, so
  // rescaling stays anchored to the right food even after a sibling row is
  // removed (an index lookup into the unfiltered list rebased onto the wrong
  // item once a row above it was deleted).
  const [editRows, setEditRows] = useState<{ original: MealLogItem; current: MealLogItem }[]>([]);

  // One idempotency key per sheet opening, not per request: a double-tap on
  // Add re-sends the SAME key, which the API replays instead of double-logging
  // (same pattern as LogWeight). Regenerated whenever a log sheet opens.
  const addKeyRef = useRef(newIdempotencyKey());
  useEffect(() => {
    if (addSheetMeal !== null || barcodeOpen) addKeyRef.current = newIdempotencyKey();
  }, [addSheetMeal, barcodeOpen]);

  const dailyQuery = useQuery({
    queryKey: ['nutrition', 'daily', date],
    queryFn: () => api<DailyNutrition>('/analytics/nutrition/daily', { query: { date } }),
  });
  const trendsQuery = useQuery({
    queryKey: ['nutrition', 'trends', '7d'],
    queryFn: () => api<TrendsResponse>('/analytics/nutrition/trends', { query: { range: '7d' } }),
  });

  const yesterdayDate = shiftLocalDate(date, -1);
  const yesterdayQuery = useQuery({
    queryKey: ['nutrition', 'daily', yesterdayDate],
    queryFn: () => api<DailyNutrition>('/analytics/nutrition/daily', { query: { date: yesterdayDate } }),
  });

  const daily = dailyQuery.data;

  const invalidateLogs = () => {
    void queryClient.invalidateQueries({ queryKey: ['nutrition'] });
    void queryClient.invalidateQueries({ queryKey: ['progress'] });
  };

  const copyYesterdayMeals = useMutation({
    mutationFn: async () => {
      const prevDaily = yesterdayQuery.data;
      if (!prevDaily) throw new Error("Yesterday's nutrition data not loaded");
      const promises: Promise<unknown>[] = [];
      for (const mt of MEAL_TYPES) {
        const logs = prevDaily.meals[mt] ?? [];
        for (const log of logs) {
          if (log.items.length > 0) {
            promises.push(
              api('/meal-logs', {
                method: 'POST',
                body: { mealType: mt, items: log.items, localDate: date },
                idempotencyKey: newIdempotencyKey(),
              }),
            );
          }
        }
      }
      if (promises.length === 0) {
        throw new Error('No logged meals found from yesterday to copy');
      }
      await Promise.all(promises);
    },
    onSuccess: () => {
      show("Copied yesterday's meals!");
      invalidateLogs();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Could not copy yesterday's meals";
      show(msg);
    },
  });

  /**
   * Logging a meal is the app's most repeated write, so the row goes into the
   * cache before the request leaves — but only the row.
   *
   * The day's totals (kcalConsumed, kcalRemaining, the macro rings) are folded
   * by the server against the user's targets, and this is the one screen where
   * inventing a calorie number would be read as fact. So the optimistic write
   * is deliberately partial: the entry appears in its meal section immediately,
   * flagged pending, while the rings hold the last figure the server actually
   * reported until the settle-time invalidation replaces the lot.
   */
  const addMealPatch = optimisticPatch<DailyNutrition, { mealType: MealType; item: MealLogItem }>(
    queryClient,
    ['nutrition', 'daily', date],
    (previous, { mealType, item }) =>
      insertPendingMealLog(
        previous,
        pendingMealLog({ key: addKeyRef.current, mealType, items: [item], localDate: date }),
      ),
  );

  const addMeal = useMutation({
    mutationFn: ({ mealType, item }: { mealType: MealType; item: MealLogItem }) =>
      api('/meal-logs', {
        method: 'POST',
        body: { mealType, items: [item], localDate: date },
        idempotencyKey: addKeyRef.current,
      }),
    ...addMealPatch,
    onError: (_err, _vars, context) => {
      addMealPatch.onError(context);
      show('Could not log that food — please try again');
    },
    onSuccess: () => {
      setAddSheetMeal(null);
      show('Meal logged');
    },
    onSettled: () => invalidateLogs(),
  });

  const updateMeal = useMutation({
    mutationFn: (log: MealLog) =>
      api(`/meal-logs/${log.id}`, {
        method: 'PUT',
        body: {
          mealType: log.mealType,
          items: editRows.map((r) => r.current),
          localDate: log.localDate,
        },
      }),
    onSuccess: () => {
      setEditingLog(null);
      show('Meal updated');
      invalidateLogs();
    },
    onError: () => show('Could not update the meal — please try again'),
  });

  const deleteMeal = useMutation({
    mutationFn: (id: string) => api(`/meal-logs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      show('Entry removed');
      invalidateLogs();
    },
    onError: () => show('Could not delete the entry — please try again'),
  });

  const kcalTrend = trendsQuery.data?.kcal ?? [];
  const maxTrend = Math.max(1, ...kcalTrend.map((p) => p.value));

  const micronutrients = useMemo(() => {
    if (!daily) return { fiberG: 0, sugarG: 0, sodiumMg: 0, potassiumMg: 0, calciumMg: 0, ironMg: 0 };
    let fiberG = 0;
    let sugarG = 0;
    let sodiumMg = 0;
    let potassiumMg = 0;
    let calciumMg = 0;
    let ironMg = 0;

    for (const mt of MEAL_TYPES) {
      const logs = daily.meals[mt] ?? [];
      for (const log of logs) {
        for (const item of log.items) {
          if (item.fiberG) fiberG += item.fiberG;
          if (item.sugarG) sugarG += item.sugarG;
          if (item.sodiumMg) sodiumMg += item.sodiumMg;
          if (item.potassiumMg) potassiumMg += item.potassiumMg;
          if (item.calciumMg) calciumMg += item.calciumMg;
          if (item.ironMg) ironMg += item.ironMg;
        }
      }
    }

    return {
      fiberG: round1(fiberG),
      sugarG: round1(sugarG),
      sodiumMg: Math.round(sodiumMg),
      potassiumMg: Math.round(potassiumMg),
      calciumMg: Math.round(calciumMg),
      ironMg: round1(ironMg),
    };
  }, [daily]);

  const totalLoggedMeals = useMemo(
    () => (daily ? MEAL_TYPES.reduce((acc, mt) => acc + (daily.meals[mt]?.length ?? 0), 0) : 0),
    [daily]
  );

  const statusData = useMemo<Record<string, DayStatus>>(() => {
    const map: Record<string, DayStatus> = {};
    const kcalTrend = trendsQuery.data?.kcal ?? [];
    for (const pt of kcalTrend) {
      if (pt.value > 0) {
        map[pt.date] = {
          logged: true,
          targetMet: daily?.kcalTarget ? pt.value >= daily.kcalTarget * 0.9 : false,
          streak: true,
        };
      }
    }
    if (daily) {
      const totalMeals = MEAL_TYPES.reduce((acc, mt) => acc + (daily.meals[mt]?.length ?? 0), 0);
      map[date] = {
        logged: totalMeals > 0,
        targetMet: daily.kcalConsumed >= daily.kcalTarget * 0.9 && daily.kcalConsumed <= daily.kcalTarget * 1.1,
        streak: totalMeals > 0,
      };
    }
    return map;
  }, [trendsQuery.data, daily, date]);

  return (
    <div>
      <AppHeader
        title="Nutrition"
        showStatuslineToggle
        onToggleStatusline={() => setShowStatusline((s) => !s)}
        showCalendarTrigger
        onOpenCalendar={() => setCalendarOpen(true)}
      />

      {showStatusline && <AquaStatusline className="mx-container-margin mt-3 mb-1" />}

      <main className="px-container-margin">
        {/* Date selector */}
        <section className="mt-4 mb-4 flex items-center justify-between" aria-label="Selected day">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setDate((d) => shiftLocalDate(d, -1))}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-high border border-outline-variant text-on-surface active:scale-90 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              chevron_left
            </span>
          </button>
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="flex items-center gap-1 font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface hover:text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span>{isToday ? 'Today' : formatShortDate(date)}</span>
              <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
                calendar_today
              </span>
            </button>
            {!isToday && (
              <button
                type="button"
                onClick={() => setDate(today)}
                className="text-primary text-xs font-bold uppercase tracking-widest focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Back to today
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Next day"
            onClick={() => setDate((d) => shiftLocalDate(d, 1))}
            disabled={isToday}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-high border border-outline-variant text-on-surface active:scale-90 transition-transform disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              chevron_right
            </span>
          </button>
        </section>

        {dailyQuery.isError ? (
          <ErrorState
            message="We couldn't load this day's nutrition."
            retry={() => void dailyQuery.refetch()}
          />
        ) : !daily ? (
          <div className="space-y-4">
            <Skeleton className="h-56 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
        ) : (
          <>
            {/* Calories remaining card with formula row */}
            <section className="mb-4" aria-label="Calories remaining">
              <GlassCard className="p-card-padding">
                <div className="flex flex-col items-center">
                  <div className="w-full flex items-center justify-between mb-4">
                    <h2 className="font-heading font-semibold uppercase tracking-[0.02em] text-2xl text-on-surface">
                      Calories Remaining
                    </h2>
                    <button
                      type="button"
                      onClick={() => setMacroRingMode((m) => (m === 'concentric' ? 'single' : 'concentric'))}
                      aria-label="Toggle macro ring view mode"
                      className="px-2.5 py-1 rounded-full text-xs font-bold border border-outline-variant/50 bg-surface-container-high text-primary hover:bg-surface-container-highest transition-colors flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">donut_large</span>
                      <span>{macroRingMode === 'concentric' ? 'Concentric' : 'Single'}</span>
                    </button>
                  </div>

                  <div className="mb-5 w-full flex justify-center">
                    {macroRingMode === 'concentric' ? (
                      <CircularMacroRing
                        calories={{ consumed: daily.kcalConsumed, target: daily.kcalTarget }}
                        protein={daily.proteinG}
                        carbs={daily.carbsG}
                        fat={daily.fatG}
                        water={daily.waterMl}
                        size={250}
                      />
                    ) : (
                      <RingProgress
                        value={daily.kcalConsumed}
                        target={daily.kcalTarget}
                        size={160}
                        strokeWidth={8}
                        tone="aqua"
                      >
                        <div className="flex flex-col items-center">
                          <span className="text-3xl font-bold text-primary tabular-nums">
                            {fmtInt(Math.max(0, daily.kcalRemaining))}
                          </span>
                          <span className="text-sm text-on-surface-variant">kcal left</span>
                        </div>
                      </RingProgress>
                    )}
                  </div>
                  <div
                    className="w-full grid grid-cols-4 text-center tabular-nums"
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
                </div>
              </GlassCard>
            </section>

            {/* Macro bars */}
            <section className="mb-4" aria-label="Macros">
              <GlassCard className="p-card-padding space-y-4">
                <MacroBar
                  variant="full"
                  label="Protein"
                  tone="green"
                  consumed={daily.proteinG.consumed}
                  target={daily.proteinG.target}
                />
                <MacroBar
                  variant="full"
                  label="Carbs"
                  tone="aqua"
                  consumed={daily.carbsG.consumed}
                  target={daily.carbsG.target}
                />
                <MacroBar
                  variant="full"
                  label="Fats"
                  tone="coral"
                  consumed={daily.fatG.consumed}
                  target={daily.fatG.target}
                />
              </GlassCard>
            </section>

            {/* Water */}
            <section className="mb-4" aria-label="Hydration">
              <WaterCard
                date={date}
                consumedMl={daily.waterMl.consumed}
                targetMl={daily.waterMl.target}
              />
            </section>

            {/* Micronutrient breakdown accordion */}
            <section className="mb-4" aria-label="Micronutrient breakdown">
              <GlassCard className="p-card-padding">
                <button
                  type="button"
                  onClick={() => setMicroOpen((o) => !o)}
                  className="w-full flex justify-between items-center text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[22px]" aria-hidden="true">
                      biotech
                    </span>
                    <h3 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface">
                      Micronutrients
                    </h3>
                  </div>
                  <span
                    className="material-symbols-outlined text-on-surface-variant transition-transform duration-200"
                    style={{ transform: microOpen ? 'rotate(180deg)' : 'none' }}
                    aria-hidden="true"
                  >
                    expand_more
                  </span>
                </button>

                {microOpen && (
                  <div className="mt-4 pt-3 border-t border-outline-variant/40 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm animate-fade-in">
                    <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <span className="text-xs text-on-surface-variant block">Dietary Fiber</span>
                      <span className="font-bold text-on-surface tabular-nums">{micronutrients.fiberG} g</span>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <span className="text-xs text-on-surface-variant block">Sugars</span>
                      <span className="font-bold text-on-surface tabular-nums">{micronutrients.sugarG} g</span>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <span className="text-xs text-on-surface-variant block">Sodium</span>
                      <span className="font-bold text-on-surface tabular-nums">{micronutrients.sodiumMg} mg</span>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <span className="text-xs text-on-surface-variant block">Potassium</span>
                      <span className="font-bold text-on-surface tabular-nums">{micronutrients.potassiumMg} mg</span>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <span className="text-xs text-on-surface-variant block">Calcium</span>
                      <span className="font-bold text-on-surface tabular-nums">{micronutrients.calciumMg} mg</span>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <span className="text-xs text-on-surface-variant block">Iron</span>
                      <span className="font-bold text-on-surface tabular-nums">{micronutrients.ironMg} mg</span>
                    </div>
                  </div>
                )}
              </GlassCard>
            </section>

            {/* Quick actions */}
            <section className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Quick actions">
              <button
                type="button"
                onClick={() => navigate('/nutrition/capture')}
                className="glass-card p-4 flex flex-col items-start gap-2 active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  photo_camera
                </span>
                <span className="font-bold text-on-surface text-sm text-left">Scan your meal</span>
                <span className="text-xs text-on-surface-variant text-left">Smart Scan AI</span>
              </button>
              <button
                type="button"
                onClick={() => setBarcodeOpen(true)}
                className="glass-card p-4 flex flex-col items-start gap-2 active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  barcode_scanner
                </span>
                <span className="font-bold text-on-surface text-sm text-left">Scan barcode</span>
                <span className="text-xs text-on-surface-variant text-left">Packaged foods</span>
              </button>
              <button
                type="button"
                onClick={() => copyYesterdayMeals.mutate()}
                disabled={copyYesterdayMeals.isPending}
                className="glass-card p-4 flex flex-col items-start gap-2 active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-emerald-400" aria-hidden="true">
                  content_copy
                </span>
                <span className="font-bold text-on-surface text-sm text-left">
                  {copyYesterdayMeals.isPending ? 'Copying…' : "Copy Yesterday's"}
                </span>
                <span className="text-xs text-on-surface-variant text-left">Duplicate meals</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/nutrition/meal-plan')}
                className="glass-card p-4 flex flex-col items-start gap-2 active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                  smart_toy
                </span>
                <span className="font-bold text-on-surface text-sm text-left">AI meal plan</span>
                <span className="text-xs text-on-surface-variant text-left">
                  Suggestions for target
                </span>
              </button>
            </section>

            {/* Meal timeline */}
            <section className="mb-4" aria-label="Meal timeline">
              <h3 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface mb-3">
                Meal Timeline
              </h3>
              {totalLoggedMeals === 0 && (
                <div className="mb-3">
                  <EmptyState
                    icon="restaurant"
                    title="Nothing logged yet"
                    body={
                      isToday
                        ? 'Log your first meal by searching foods or scanning your plate.'
                        : 'No meals were logged on this day.'
                    }
                    action={
                      isToday ? (
                        <button
                          type="button"
                          onClick={() => setAddSheetMeal('breakfast')}
                          className="cta-gradient px-6 py-3 rounded-xl text-on-primary font-bold active:scale-95 transition-transform"
                        >
                          Add a meal
                        </button>
                      ) : undefined
                    }
                  />
                </div>
              )}
              <div className="space-y-4">
                {MEAL_TYPES.map((mealType) => {
                  const logs = daily.meals[mealType] ?? [];
                  const mealKcal = logs.reduce((acc, l) => acc + l.totalKcal, 0);
                  return (
                    <div key={mealType}>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="material-symbols-outlined text-primary text-[20px]"
                            aria-hidden="true"
                          >
                            {MEAL_ICON[mealType]}
                          </span>
                          <h4 className="font-bold text-on-surface">{MEAL_LABEL[mealType]}</h4>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-primary text-sm font-bold tabular-nums">
                            {logs.length > 0 ? `${fmtInt(mealKcal)} kcal` : ''}
                          </span>
                          <button
                            type="button"
                            aria-label={`Add food to ${MEAL_LABEL[mealType]}`}
                            onClick={() => setAddSheetMeal(mealType)}
                            className="text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              add_circle
                            </span>
                          </button>
                        </div>
                      </div>
                      {logs.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => setAddSheetMeal(mealType)}
                          className="w-full flex gap-4 p-3 bg-surface-container-low border border-outline-variant rounded-2xl items-center text-left active:scale-[0.99] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-outline" aria-hidden="true">
                              add_a_photo
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-on-surface">Not logged</p>
                            <p className="text-xs text-on-surface-variant">
                              Tap to add your {MEAL_LABEL[mealType].toLowerCase()}
                            </p>
                          </div>
                        </button>
                      ) : (
                        <div className="space-y-2">
                          {logs.map((log) => {
                            // Optimistic row: on screen, but not yet a fact the
                            // server would confirm. Say so, and do not offer
                            // edit or delete against an id that does not exist.
                            const pending = isPendingId(log.id);
                            return (
                            <div
                              key={log.id}
                              aria-busy={pending || undefined}
                              className={`p-3 bg-surface-container-low border border-outline-variant rounded-2xl ${
                                pending ? 'opacity-60' : ''
                              }`}
                            >
                              <div className="flex justify-between items-start mb-1">
                                <p className="text-sm font-bold text-on-surface">
                                  {log.items.map((i) => i.name).join(', ')}
                                </p>
                                <span className="text-primary text-sm font-bold tabular-nums whitespace-nowrap ml-3">
                                  {pending ? 'Saving…' : `${fmtInt(log.totalKcal)} kcal`}
                                </span>
                              </div>
                              <p className="text-xs text-on-surface-variant tabular-nums mb-2">
                                {log.items
                                  .map((i) => `${i.name} ${Math.round(i.grams)}g`)
                                  .join(' · ')}
                              </p>
                              <div className="flex justify-between items-center">
                                <p className="text-[11px] text-on-surface-variant tabular-nums">
                                  P {round1(log.totalProteinG)}g · C {round1(log.totalCarbsG)}g · F{' '}
                                  {round1(log.totalFatG)}g
                                  {log.source === 'photo' && ' · from photo'}
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    aria-label={`Edit ${MEAL_LABEL[mealType]} entry`}
                                    onClick={() => {
                                      setEditingLog(log);
                                      setEditRows(
                                        log.items.map((i) => ({ original: i, current: { ...i } })),
                                      );
                                    }}
                                    disabled={pending}
                                    className="text-on-surface-variant hover:text-primary disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                  >
                                    <span
                                      className="material-symbols-outlined text-[20px]"
                                      aria-hidden="true"
                                    >
                                      edit
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${MEAL_LABEL[mealType]} entry`}
                                    onClick={() => deleteMeal.mutate(log.id)}
                                    disabled={pending || deleteMeal.isPending}
                                    className="text-on-surface-variant hover:text-tertiary-container disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                  >
                                    <span
                                      className="material-symbols-outlined text-[20px]"
                                      aria-hidden="true"
                                    >
                                      delete
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Weekly calorie trend */}
            <section className="mb-8" aria-label="Weekly calorie trend">
              <GlassCard className="p-card-padding">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface">
                    Weekly Calorie Trend
                  </h3>
                  {kcalTrend.length > 0 && (
                    <span className="text-sm text-secondary tabular-nums">
                      Avg:{' '}
                      {fmtInt(kcalTrend.reduce((a, p) => a + p.value, 0) / kcalTrend.length)}
                    </span>
                  )}
                </div>
                {trendsQuery.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : kcalTrend.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">
                    Log meals for a few days to see your trend.
                  </p>
                ) : (
                  <div
                    className="flex items-end justify-between h-32 gap-2"
                    role="img"
                    aria-label="Bar chart of calories per day for the last week"
                  >
                    {kcalTrend.slice(-7).map((p) => {
                      const h = Math.max(4, Math.round((p.value / maxTrend) * 100));
                      const isSelected = p.date === date;
                      return (
                        <div key={p.date} className="flex flex-col items-center flex-1 gap-2 h-full justify-end">
                          <div
                            className={`w-full rounded-t-lg ${
                              isSelected
                                ? 'cta-gradient shadow-[0_0_15px_rgba(47,217,244,0.4)]'
                                : p.value > 0
                                  ? 'bg-primary/20'
                                  : 'bg-surface-container-highest'
                            }`}
                            style={{ height: `${h}%` }}
                          />
                          <span
                            className={`text-[10px] ${isSelected ? 'text-primary font-bold' : 'text-on-surface-variant'}`}
                          >
                            {new Date(`${p.date}T12:00:00`)
                              .toLocaleDateString(undefined, { weekday: 'narrow' })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassCard>
            </section>
          </>
        )}
      </main>

      {/* Add-food sheet */}
      <FoodSearchSheet
        open={addSheetMeal !== null}
        title={addSheetMeal ? `Add to ${MEAL_LABEL[addSheetMeal]}` : undefined}
        onClose={() => setAddSheetMeal(null)}
        pending={addMeal.isPending}
        onPick={(item) => {
          if (addSheetMeal && !addMeal.isPending) addMeal.mutate({ mealType: addSheetMeal, item });
        }}
      />

      {/* Barcode scan & log sheet (wger/OFF barcode lookup) */}
      <BarcodeSheet
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onLog={(item, mealType) => {
          setBarcodeOpen(false);
          if (!addMeal.isPending) addMeal.mutate({ mealType, item });
        }}
      />

      {/* Edit-meal sheet */}
      {editingLog && (
        <div
          className="fixed inset-0 z-[60]"
          role="dialog"
          aria-modal="true"
          aria-label="Edit meal entry"
        >
          <button
            type="button"
            aria-label="Close edit"
            onClick={() => setEditingLog(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-surface-container-high rounded-t-3xl border-t border-border-aqua p-5 pb-8 max-h-[85vh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-outline-variant rounded-full mx-auto mb-4" aria-hidden="true" />
            <h3 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface mb-4">
              Edit {MEAL_LABEL[editingLog.mealType]}
            </h3>
            <div className="space-y-3 mb-4">
              {editRows.map(({ current: item, original }, idx) => (
                <div
                  key={`${original.name}-${idx}`}
                  className="p-3 rounded-xl bg-surface-container-low border border-outline-variant"
                >
                  <div className="flex justify-between items-center gap-3 mb-2">
                    <p className="font-bold text-on-surface text-sm">{item.name}</p>
                    <span className="text-primary text-sm font-bold tabular-nums whitespace-nowrap">
                      {fmtInt(item.kcal)} kcal
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <GramsStepper
                      value={Math.round(item.grams)}
                      label={item.name}
                      onChange={(grams) =>
                        setEditRows((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, current: rescaleItem(r.original, grams) } : r,
                          ),
                        )
                      }
                    />
                    {editRows.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => setEditRows((rows) => rows.filter((_, i) => i !== idx))}
                        className="text-on-surface-variant hover:text-tertiary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          delete
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateMeal.mutate(editingLog)}
              disabled={updateMeal.isPending || editRows.length === 0}
              className="cta-gradient w-full h-14 rounded-xl text-on-primary font-bold active:scale-[0.98] transition-transform disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {updateMeal.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Month calendar picker modal */}
      <AquaCalendarPicker
        open={calendarOpen}
        selectedDate={date}
        onSelectDate={(newDate) => setDate(newDate)}
        onClose={() => setCalendarOpen(false)}
        statusData={statusData}
      />
    </div>
  );
}
