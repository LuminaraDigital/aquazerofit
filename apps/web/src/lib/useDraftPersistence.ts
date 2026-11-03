/**
 * Persist in-progress form text across accidental navigation / refresh.
 * Clears on explicit clear() (successful submit). Fires page_abandoned when
 * the tab hides with a non-empty draft that was never cleared.
 */
import { useCallback, useEffect, useRef } from 'react';
import { trackFriction } from './retention';

export function useDraftPersistence<T>(opts: {
  storageKey: string;
  value: T;
  enabled?: boolean;
  /** Return true when the draft is worth keeping / reporting as abandoned. */
  isDirty: (value: T) => boolean;
  /** Route or surface label for abandon telemetry. */
  surface: string;
  onRestore?: (stored: T) => void;
}): { clear: () => void } {
  const { storageKey, value, enabled = true, isDirty, surface, onRestore } = opts;
  const restoredRef = useRef(false);
  const abandonedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as T;
      if (isDirty(parsed)) onRestore?.(parsed);
    } catch {
      // corrupt or unavailable - start fresh
    }
  }, [enabled, storageKey, isDirty, onRestore]);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (isDirty(value)) {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore quota
    }
  }, [enabled, storageKey, value, isDirty]);

  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (abandonedRef.current) return;
      if (!isDirty(valueRef.current)) return;
      abandonedRef.current = true;
      trackFriction('page_abandoned', { surface });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, surface, isDirty]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { clear };
}
