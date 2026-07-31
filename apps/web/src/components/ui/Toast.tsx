/**
 * Lightweight toast system. State lives in a module-level store so
 * useToast() works from any subtree; ToastProvider renders the viewport
 * (bottom, aria-live polite, auto-dismiss).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit(): void {
  const snapshot = [...toasts];
  for (const listener of listeners) listener(snapshot);
}

function dismiss(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(kind: ToastKind, message: string): void {
  const id = nextId++;
  toasts = [...toasts.slice(-2), { id, kind, message }];
  emit();
  window.setTimeout(() => dismiss(id), 3800);
}

export function useToast() {
  return useMemo(
    () => ({
      success: (message: string) => push('success', message),
      error: (message: string) => push('error', message),
      show: (message: string, kind: ToastKind = 'info') => push(kind, message),
    }),
    [],
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>(toasts);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  return (
    <>
      {children}
      <div
        aria-live="polite"
        className="fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-container-margin pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto glass-card flex items-center gap-2.5 rounded-full px-4 py-3 max-w-md w-fit shadow-lg ${
              t.kind === 'success'
                ? 'border-secondary/50'
                : t.kind === 'error'
                  ? 'border-coral/50'
                  : 'border-primary/50'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl ${
                t.kind === 'success'
                  ? 'text-secondary'
                  : t.kind === 'error'
                    ? 'text-coral'
                    : 'text-primary'
              }`}
              aria-hidden="true"
            >
              {t.kind === 'success' ? 'check_circle' : t.kind === 'error' ? 'error' : 'water_drop'}
            </span>
            <span className="text-sm text-on-surface">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="ml-1 text-on-surface-variant hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-full"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
