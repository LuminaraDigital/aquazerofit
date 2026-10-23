import { useEffect } from 'react';
import { trackFriction } from '@/lib/retention';
import { SecondaryButton } from './SecondaryButton';

export function ErrorState({
  message,
  retry,
  surface = 'unknown',
}: {
  message?: string;
  retry?: () => void;
  /** Optional route/surface label for drop-off telemetry. */
  surface?: string;
}) {
  useEffect(() => {
    trackFriction('error_encountered', {
      surface,
      message: message ?? 'generic_load_failure',
    });
  }, [message, surface]);

  return (
    <div role="alert" className="glass-card p-8 flex flex-col items-center text-center gap-3">
      <span
        className="w-14 h-14 rounded-full bg-coral/15 flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="material-symbols-outlined text-3xl text-coral">error</span>
      </span>
      <h3 className="font-heading font-semibold uppercase tracking-wide text-lg text-on-surface">
        Something went wrong
      </h3>
      <p className="text-sm text-on-surface-variant max-w-xs">
        {message ?? 'We could not load this right now. Please try again.'}
      </p>
      {retry && (
        <SecondaryButton onClick={retry} className="mt-2 max-w-[200px] min-h-[48px]">
          Try again
        </SecondaryButton>
      )}
    </div>
  );
}
