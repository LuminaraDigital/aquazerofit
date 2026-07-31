import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon?: string;
  /** Optional right-side adornment (e.g. show/hide password toggle). */
  trailing?: ReactNode;
}

/** Glass-style input with an associated label, aqua focus glow and inline error. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, icon, trailing, id, className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-on-surface-variant ml-1">
        {label}
      </label>
      <div
        className={`flex items-center bg-surface-container-lowest border rounded-2xl px-4 py-3.5 transition-all focus-within:border-primary focus-within:shadow-[0_0_10px_rgba(138,235,255,0.2)] ${
          error ? 'border-tertiary-container' : 'border-outline-variant'
        }`}
      >
        {icon && (
          <span className="material-symbols-outlined text-outline mr-3" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`bg-transparent border-none outline-none focus:ring-0 w-full text-on-surface placeholder:text-outline/50 font-body text-base ${className}`}
          {...rest}
        />
        {trailing}
      </div>
      {error && (
        <p id={errorId} className="flex items-center gap-1 ml-1 text-xs text-tertiary-container">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            error
          </span>
          {error}
        </p>
      )}
    </div>
  );
});
