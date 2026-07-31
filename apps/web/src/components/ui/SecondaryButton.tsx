import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: ReactNode;
}

/**
 * Ghost button with a soft aqua border and subtle hover fill.
 * Lighter visual weight than PrimaryButton - used for secondary actions.
 */
export function SecondaryButton({
  loading = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...rest
}: SecondaryButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`w-full min-h-[52px] rounded-2xl border border-primary/60 bg-transparent font-heading font-semibold uppercase tracking-[0.04em] text-sm text-primary transition-all hover:bg-primary/8 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 px-6 ${className}`}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin"
        />
      )}
      {children}
    </button>
  );
}