import { clampPct } from './lib';

export type MacroTone = 'green' | 'aqua' | 'coral';

const TONE_TEXT: Record<MacroTone, string> = {
  green: 'text-secondary',
  aqua: 'text-primary',
  coral: 'text-tertiary-container',
};

const TONE_FILL: Record<MacroTone, string> = {
  green: 'bg-secondary',
  aqua: 'bg-primary',
  coral: 'bg-tertiary-container',
};

interface MacroBarProps {
  label: string;
  consumed: number;
  target: number;
  tone: MacroTone;
  /** compact = 3-up grid style (dashboard); full = row with g/target (nutrition) */
  variant?: 'compact' | 'full';
}

/** Semantic macro progress bar per DESIGN.md (protein green, carbs aqua, fat coral). */
export function MacroBar({ label, consumed, target, tone, variant = 'compact' }: MacroBarProps) {
  const pct = clampPct(consumed, target);
  const bar = (
    <div
      className={`w-full ${variant === 'compact' ? 'h-1.5 bg-outline-variant' : 'h-2 bg-surface-container-highest'} rounded-full overflow-hidden`}
      role="progressbar"
      aria-label={`${label} ${Math.round(consumed)} of ${Math.round(target)} grams`}
      aria-valuenow={Math.round(consumed)}
      aria-valuemin={0}
      aria-valuemax={Math.round(target)}
    >
      <div
        className={`h-full ${TONE_FILL[tone]} rounded-full transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );

  if (variant === 'full') {
    return (
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium text-on-surface">{label}</span>
          <span className="text-sm font-bold tabular-nums text-on-surface">
            {Math.round(consumed)}/{Math.round(target)}g
          </span>
        </div>
        {bar}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[12px] font-bold">
        <span className={`${TONE_TEXT[tone]} uppercase`}>{label}</span>
        <span className="text-on-surface tabular-nums">{Math.round(consumed)}g</span>
      </div>
      {bar}
    </div>
  );
}
