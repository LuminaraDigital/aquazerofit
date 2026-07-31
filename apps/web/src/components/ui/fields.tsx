/**
 * Reusable form field primitives shared by Onboarding and Settings:
 * Switch, UnitToggle, SegmentedOptions and OptionCardGroup.
 */
import { useId } from 'react';

// ---------- Switch ----------

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name; visually hidden (pair with visible text next to it). */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-secondary' : 'bg-surface-container-highest'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

// ---------- UnitToggle ----------

export function UnitToggle({
  value,
  onChange,
}: {
  value: 'metric' | 'imperial';
  onChange: (next: 'metric' | 'imperial') => void;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      className="inline-flex rounded-full border border-outline-variant bg-surface-container-lowest p-1"
    >
      <span id={`${id}-label`} className="sr-only">
        Unit preference
      </span>
      {(['metric', 'imperial'] as const).map((unit) => (
        <button
          key={unit}
          type="button"
          role="radio"
          aria-checked={value === unit}
          onClick={() => onChange(unit)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
            value === unit
              ? 'bg-primary/20 text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {unit === 'metric' ? 'Metric' : 'Imperial'}
        </button>
      ))}
    </div>
  );
}

// ---------- SegmentedOptions (small horizontal pills) ----------

export function SegmentedOptions<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (next: T) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <span id={id} className="block text-sm font-medium text-on-surface-variant ml-1">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2.5 rounded-full border text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
              value === opt.value
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- OptionCardGroup (large selection cards) ----------

export function OptionCardGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; title: string; body?: string; icon?: string }[];
  value: T | null;
  onChange: (next: T) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <span id={id} className="block text-sm font-medium text-on-surface-variant ml-1">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-3">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={opt.body ? `${opt.title}. ${opt.body}` : opt.title}
              onClick={() => onChange(opt.value)}
              className={`glass-card flex items-center gap-4 p-4 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.98] ${
                active ? 'border-primary shadow-[0_0_15px_rgba(138,235,255,0.15)]' : ''
              }`}
            >
              {opt.icon && (
                <span
                  className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                    active ? 'bg-primary/20 text-primary' : 'bg-surface-container-high text-on-surface-variant'
                  }`}
                  aria-hidden="true"
                >
                  <span className="material-symbols-outlined">{opt.icon}</span>
                </span>
              )}
              <span className="min-w-0">
                <span
                  className={`block font-heading font-semibold uppercase tracking-wide ${
                    active ? 'text-primary' : 'text-on-surface'
                  }`}
                >
                  {opt.title}
                </span>
                {opt.body && (
                  <span className="block text-xs text-on-surface-variant mt-0.5">{opt.body}</span>
                )}
              </span>
              {active && (
                <span
                  className="material-symbols-outlined ml-auto text-primary shrink-0"
                  aria-hidden="true"
                >
                  check_circle
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
