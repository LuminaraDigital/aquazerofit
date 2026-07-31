export type ChipTone = 'aqua' | 'green' | 'coral' | 'navy';

const TONE: Record<ChipTone, { idle: string; active: string }> = {
  aqua: {
    idle: 'bg-primary-fixed-dim/15 text-primary-fixed-dim border-transparent',
    active: 'bg-primary-fixed-dim/25 text-primary-fixed-dim border-primary-fixed-dim',
  },
  green: {
    idle: 'bg-secondary/15 text-secondary border-transparent',
    active: 'bg-secondary/25 text-secondary border-secondary',
  },
  coral: {
    idle: 'bg-coral/15 text-coral border-transparent',
    active: 'bg-coral/25 text-coral border-coral',
  },
  navy: {
    idle: 'bg-primary/15 text-primary border-transparent',
    active: 'bg-primary/25 text-primary border-primary',
  },
};

/**
 * Pill chip with a 15% opacity accent background. Interactive when onClick
 * is given (renders a button with aria-pressed); otherwise a static badge.
 */
export function Chip({
  label,
  tone = 'aqua',
  icon,
  active = false,
  onClick,
}: {
  label: string;
  tone?: ChipTone;
  icon?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const styles = active ? TONE[tone].active : TONE[tone].idle;
  const base = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${styles}`;

  const content = (
    <>
      {icon && (
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`${base} focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:scale-95`}
      >
        {content}
      </button>
    );
  }
  return <span className={base}>{content}</span>;
}
