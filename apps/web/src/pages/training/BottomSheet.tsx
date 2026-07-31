/**
 * Small local bottom-sheet used by the training pages (exercise detail,
 * plan-generation options, workout summary). Glass panel sliding over a
 * blurred backdrop per the log_your_weight / detail mocks.
 */
import { useEffect, type ReactNode } from 'react';

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        aria-label="Close sheet"
        className="absolute inset-0 w-full bg-surface/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute bottom-0 left-0 w-full max-h-[88vh] overflow-y-auto rounded-t-[32px] border-t border-border-aqua bg-surface-container-lowest/95 backdrop-blur-xl shadow-2xl"
      >
        <div className="mx-auto w-full max-w-md px-5 pb-8">
          <div className="flex justify-center py-3">
            <div className="h-1.5 w-12 rounded-full bg-outline-variant opacity-60" />
          </div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="heading-display font-heading text-2xl text-on-surface">{title}</h2>
            <button
              aria-label="Close"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
