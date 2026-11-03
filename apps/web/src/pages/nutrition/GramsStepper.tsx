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
