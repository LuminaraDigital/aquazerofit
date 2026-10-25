/**
 * The Fight Camp switch: a 44px target through an invisible margin (AZF-P1
 * §6.1), named by visible text through `labelledBy`, and still under reduced
 * motion. Kept apart from the shared Switch on purpose: its R1a callers must
 * render exactly as before while Fight Camp is off.
 */
export function ToggleSwitch({
  checked,
  onChange,
  labelledBy,
  describedBy,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Id of the visible text that names the switch. */
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none before:absolute before:-inset-2 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 ${
        checked ? 'bg-primary' : 'bg-outline-variant'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 h-5 w-5 rounded-full bg-surface transition-transform motion-reduce:transition-none ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
