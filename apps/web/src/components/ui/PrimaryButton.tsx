import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: ReactNode;
}

/**
 * CTA-gradient primary button - 52px tap target, refined shadow, tactile press.
 * The gradient has an inner light (top highlight) for depth.
 */
export function PrimaryButton({
  loading = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...rest
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`cta-gradient w-full min-h-[52px] rounded-2xl font-heading font-semibold uppercase tracking-[0.04em] text-sm text-[#001f25] transition-all active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 px-6 ${className}`}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="w-4 h-4 rounded-full border-2 border-[#001f25]/30 border-t-[#001f25] animate-spin"
        />
      )}
      {children}
    </button>
  );
}