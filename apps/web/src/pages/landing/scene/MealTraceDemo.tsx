/**
 * Interactive 4-stage "Model looks -> You confirm -> Code counts" meal trace
 * simulator for the homepage `#features` band.
 *
 * Mirrors the actual `recipe` screenshot meal (avocado and egg sourdough toast),
 * using standard per-100g food-composition values (USDA FoodData Central /
 * AUSNUT 2011-13) multiplied deterministically in code.
 */
import { useState } from 'react';

interface PlateItem {
  key: string;
  name: string;
  defaultGrams: number;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

const MIN_GRAMS = 20;
const MAX_GRAMS = 400;

/* Per-100 g reference entries matching the recipe capture's avocado & egg sourdough toast
   (USDA FoodData Central: bread sourdough 272 kcal, avocado raw 160 kcal, egg poached 143 kcal). */
const SAMPLE_PLATE: readonly PlateItem[] = [
  {
    key: 'sourdough',
    name: 'Sourdough toast',
    defaultGrams: 75,
    kcalPer100g: 272,
    proteinPer100g: 10.8,
    carbsPer100g: 51.9,
    fatPer100g: 1.8,
  },
  {
    key: 'avocado',
    name: 'Sliced avocado',
    defaultGrams: 70,
    kcalPer100g: 160,
    proteinPer100g: 2.0,
    carbsPer100g: 8.5,
    fatPer100g: 14.7,
  },
  {
    key: 'eggs',
    name: 'Poached eggs',
    defaultGrams: 100,
    kcalPer100g: 143,
    proteinPer100g: 12.5,
    carbsPer100g: 0.7,
    fatPer100g: 9.5,
  },
];

export function MealTraceDemo() {
  const [grams, setGrams] = useState<Record<string, number>>(() =>
    Object.fromEntries(SAMPLE_PLATE.map((item) => [item.key, item.defaultGrams])),
  );
  const [confirmed, setConfirmed] = useState(false);

  const adjust = (key: string, delta: number) => {
    const current = grams[key] ?? 100;
    const next = Math.max(MIN_GRAMS, Math.min(MAX_GRAMS, current + delta));
    if (next === current) return;
    setGrams((prev) => ({ ...prev, [key]: next }));
    setConfirmed(false);
  };

  const totals = SAMPLE_PLATE.reduce(
    (acc, item) => {
      const g = grams[item.key] ?? item.defaultGrams;
      const factor = g / 100;
      return {
        kcal: acc.kcal + Math.round(item.kcalPer100g * factor),
        protein: acc.protein + item.proteinPer100g * factor,
        carbs: acc.carbs + item.carbsPer100g * factor,
        fat: acc.fat + item.fatPer100g * factor,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <div className="lp-panel mt-8 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-outline-variant/50 pb-4">
        <div>
          <p className="stat-label text-primary">Interactive meal trace</p>
          <p className="mt-1 text-[14.5px] text-on-surface-variant">
            Edit any proposed portion below. Nothing logs until you confirm — code multiplies every gram.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-secondary">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            verified_user
          </span>
          EXIF &amp; GPS stripped on upload
        </span>
      </div>

      <div className="mt-4 grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <ul className="divide-y divide-outline-variant/50">
          {SAMPLE_PLATE.map((item) => {
            const g = grams[item.key] ?? item.defaultGrams;
            const itemKcal = Math.round((item.kcalPer100g * g) / 100);
            return (
              <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-on-surface">{item.name}</p>
                  <p className="text-[13px] tabular-nums text-on-surface-variant">
                    {item.kcalPer100g} kcal/100 g →{' '}
                    <span className="font-semibold text-on-surface">{itemKcal} kcal</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={g <= MIN_GRAMS}
                    onClick={() => adjust(item.key, -15)}
                    aria-label={`Decrease ${item.name} by 15 grams`}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-outline/80 bg-surface-container-high text-on-surface transition-colors hover:border-primary disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:text-outline"
                  >
                    −
                  </button>
                  <span className="w-16 text-center text-[14px] font-semibold tabular-nums text-on-surface">
                    {g} g
                  </span>
                  <button
                    type="button"
                    disabled={g >= MAX_GRAMS}
                    onClick={() => adjust(item.key, 15)}
                    aria-label={`Increase ${item.name} by 15 grams`}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-outline/80 bg-surface-container-high text-on-surface transition-colors hover:border-primary disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:text-outline"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="rounded-xl border border-outline-variant/60 bg-surface p-4">
          <p className="stat-label">Deterministic total</p>
          <p className="mt-1 font-heading text-[44px] font-bold leading-none tabular-nums text-on-surface">
            {totals.kcal}
            <span className="ml-1.5 font-body text-[14px] font-medium text-on-surface-variant">
              kcal
            </span>
          </p>

          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-outline-variant/50 pt-3 text-[13px] tabular-nums">
            <div>
              <dt className="text-on-surface-variant">Protein</dt>
              <dd className="font-semibold text-secondary">{Math.round(totals.protein)} g</dd>
            </div>
            <div>
              <dt className="text-on-surface-variant">Carbs</dt>
              <dd className="font-semibold text-primary">{Math.round(totals.carbs)} g</dd>
            </div>
            <div>
              <dt className="text-on-surface-variant">Fat</dt>
              <dd className="font-semibold text-coral">{Math.round(totals.fat)} g</dd>
            </div>
          </dl>

          <button
            type="button"
            aria-pressed={confirmed}
            onClick={() => setConfirmed((c) => !c)}
            className={`mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-3 text-[14px] font-semibold transition-colors ${
              confirmed
                ? 'border border-secondary/50 bg-secondary/15 text-secondary'
                : 'bg-primary-fixed-dim azf-cta-text hover:brightness-110'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              {confirmed ? 'check_circle' : 'task_alt'}
            </span>
            {confirmed ? 'Added to sample day · Adjust to edit' : 'Confirm proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}
