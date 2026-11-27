/**
 * The landing page's signature piece: a live targets label.
 *
 * Runs `computeTargets` from `@aquazerofit/shared` — the exact pure function
 * executed on saved profiles — with Corner Card 16px/8px radii, WCAG 1.4.11
 * control borders (`border-outline/75`), >= 44px touch targets, and the
 * Mifflin-St Jeor working visible above the fold on standard laptops.
 */
import { useId, useMemo, useState } from 'react';
import {
  ACTIVITY_FACTORS,
  computeTargets,
  type ActivityLevel,
  type Goal,
  type Sex,
} from '@aquazerofit/shared';

const SEX_OPTIONS: Array<{ value: Sex; label: string; offset: string }> = [
  { value: 'female', label: 'Female', offset: '− 161' },
  { value: 'male', label: 'Male', offset: '+ 5' },
  { value: 'unspecified', label: 'Not stated', offset: '− 78' },
];

const GOAL_OPTIONS: Array<{ value: Goal; label: string }> = [
  { value: 'lose', label: 'Lose' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain' },
];

const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; label: string }> = [
  { value: 'sedentary', label: 'Mostly sitting' },
  { value: 'light', label: 'Light · 1–3 days' },
  { value: 'moderate', label: 'Moderate · 3–5 days' },
  { value: 'active', label: 'Hard · 6–7 days' },
  { value: 'veryActive', label: 'Physical job + training' },
];

const fmt = new Intl.NumberFormat('en-AU');

function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-[13px] text-on-surface-variant">{legend}</legend>
      <div className="flex gap-1 rounded-xl border border-outline/75 bg-surface-container-lowest p-1">
        {options.map((option) => (
          <label key={option.value} className="relative flex-auto">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer absolute inset-0 cursor-pointer opacity-0"
            />
            <span className="flex min-h-[40px] items-center justify-center whitespace-nowrap rounded-xl px-2 text-center text-[13px] font-medium text-on-surface-variant transition-colors duration-150 hover:text-on-surface peer-checked:bg-surface-container-highest peer-checked:text-on-surface peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-primary sm:min-h-[36px]">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Slider({
  label,
  unit,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] text-on-surface-variant">
          {label}
        </label>
        <span className="text-[15px] font-semibold tabular-nums text-on-surface">
          {value}&nbsp;{unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={`${value} ${unit}`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 w-full cursor-pointer accent-primary"
      />
    </div>
  );
}

function Row({
  label,
  value,
  dotClass,
  strong = false,
}: {
  label: string;
  value: string;
  dotClass?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-t border-outline-variant/60 py-1.5">
      <dt className={`flex items-center gap-2 ${strong ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}`}>
        {dotClass && <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="font-semibold tabular-nums text-on-surface">{value}</dd>
    </div>
  );
}

export function TargetsLabel() {
  const [sex, setSex] = useState<Sex>('female');
  const [age, setAge] = useState(34);
  const [heightCm, setHeightCm] = useState(168);
  const [weightKg, setWeightKg] = useState(72);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<Goal>('lose');
  const activityId = useId();

  const t = useMemo(
    () => computeTargets({ userId: 'landing-demo', sex, age, heightCm, weightKg, activityLevel, goal }),
    [sex, age, heightCm, weightKg, activityLevel, goal],
  );

  const offset = SEX_OPTIONS.find((o) => o.value === sex)!.offset;
  const adjustment = t.clamped ? null : t.kcalTarget - t.tdee;

  const pKcal = t.proteinG * 4;
  const cKcal = t.carbsG * 4;
  const fKcal = t.fatG * 9;
  const totalMacroKcal = Math.max(1, pKcal + cKcal + fKcal);
  const pShare = pKcal / totalMacroKcal;
  const cShare = cKcal / totalMacroKcal;
  const fShare = 1 - pShare - cShare;

  return (
    <section
      id="calculator"
      aria-labelledby="calculator-title"
      className="lp-panel scroll-mt-24 border-primary-fixed-dim/40 p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="calculator-title" className="font-heading text-[26px] font-bold leading-none text-on-surface">
          Daily targets
        </h2>
        <p className="text-[13px] text-on-surface-variant">Try it. Nothing is saved.</p>
      </div>
      <div className="mt-2.5 h-1.5 bg-on-surface" aria-hidden="true" />

      <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
        <Segmented legend="Sex, for the formula only" name="calc-sex" options={SEX_OPTIONS} value={sex} onChange={setSex} />
        <Segmented legend="Goal" name="calc-goal" options={GOAL_OPTIONS} value={goal} onChange={setGoal} />
        <Slider label="Age" unit="yr" min={16} max={90} value={age} onChange={setAge} />
        <Slider label="Height" unit="cm" min={140} max={210} value={heightCm} onChange={setHeightCm} />
        <Slider label="Weight" unit="kg" min={40} max={160} value={weightKg} onChange={setWeightKg} />
        <div className="min-w-0">
          <label htmlFor={activityId} className="mb-1.5 block text-[13px] text-on-surface-variant">
            Activity
          </label>
          <select
            id={activityId}
            value={activityLevel}
            onChange={(event) => setActivityLevel(event.target.value as ActivityLevel)}
            className="h-11 w-full cursor-pointer rounded-xl border border-outline/80 bg-surface-container-lowest px-3 py-0 text-[14px] leading-normal text-on-surface sm:h-10"
          >
            {ACTIVITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 h-1.5 bg-on-surface" aria-hidden="true" />
      <dl className="flex items-end justify-between gap-4 py-2">
        <dt className="font-heading text-[24px] font-bold leading-none text-on-surface">Calories</dt>
        <dd className="font-heading text-[clamp(2.75rem,2.2rem+2.5vw,4rem)] font-bold leading-[0.85] tracking-[-0.02em] tabular-nums text-on-surface">
          {fmt.format(t.kcalTarget)}
          <span className="ml-1.5 align-baseline font-body text-sm font-medium tracking-normal text-on-surface-variant">
            kcal
          </span>
        </dd>
      </dl>

      {/* Proportional macro split bar (static flex-grow, zero layout-width animation) */}
      <div
        className="mb-2.5 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-container-lowest"
        aria-hidden="true"
      >
        <span className="h-full bg-secondary" style={{ flexGrow: pShare }} />
        <span className="h-full bg-primary" style={{ flexGrow: cShare }} />
        <span className="h-full bg-coral" style={{ flexGrow: fShare }} />
      </div>

      <dl className="text-[15px]">
        <Row label="Protein" value={`${t.proteinG} g`} dotClass="bg-secondary" strong />
        <Row label="Carbohydrate" value={`${t.carbsG} g`} dotClass="bg-primary" strong />
        <Row label="Fat" value={`${t.fatG} g`} dotClass="bg-coral" strong />
        <Row label="Water" value={`${(t.waterMl / 1000).toFixed(1)} L`} strong />
      </dl>
      <div className="h-0.5 bg-on-surface" aria-hidden="true" />

      <div className="mt-3 space-y-0.5 font-mono text-[12px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
        <p>
          BMR = 10 × {weightKg} + 6.25 × {heightCm} − 5 × {age} {offset} ={' '}
          <span className="text-on-surface">{fmt.format(t.bmr)}</span>
        </p>
        <p>
          × {ACTIVITY_FACTORS[activityLevel]} activity ={' '}
          <span className="text-on-surface">{fmt.format(t.tdee)}</span> to maintain
        </p>
        {adjustment !== null && adjustment !== 0 && (
          <p>
            {adjustment < 0 ? '−' : '+'} {fmt.format(Math.abs(adjustment))} for a safe weekly{' '}
            {adjustment < 0 ? 'loss' : 'gain'} = <span className="text-on-surface">{fmt.format(t.kcalTarget)}</span>
          </p>
        )}
      </div>
      {t.clamped && (
        <p role="status" className="mt-2.5 rounded-xl border border-coral/40 bg-coral/[0.08] px-3 py-2 text-[13px] leading-relaxed text-on-surface">
          {t.clampReason}
        </p>
      )}
      <p className="mt-3 border-t border-outline-variant/50 pt-2.5 text-[12.5px] leading-relaxed text-on-surface-variant">
        Mifflin–St Jeor, the same function the app runs on your saved profile. General wellness
        guidance, not medical advice.
      </p>
    </section>
  );
}
