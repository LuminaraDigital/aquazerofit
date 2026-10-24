/**
 * React bindings for Telegram chrome. No-ops outside a Mini App, so the
 * browser router, buttons and scroll behaviour stay as they are.
 */
import { useEffect, useId, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isTMA } from './telegram';
import {
  installTelegramChrome,
  retainClosingConfirmation,
  supportsTelegramMainButton,
  syncTelegramBackButton,
  syncTelegramMainButton,
  syncTelegramVerticalSwipes,
} from './telegramChrome';

/** Front doors. Anywhere else shows the native back button. */
const ROOTS = new Set(['/', '/welcome']);

export function useTelegramHostChrome(): void {
  useEffect(() => {
    if (!isTMA()) return;
    installTelegramChrome();
  }, []);
}

export function useTelegramBackButton(): void {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!isTMA()) return;
    const visible = !ROOTS.has(pathname);
    syncTelegramBackButton(visible, () => {
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) navigateRef.current(-1);
      else navigateRef.current('/');
    });
    return () => {
      syncTelegramBackButton(false, () => undefined);
    };
  }, [pathname]);
}

/** Re-measure after navigation and whenever the document grows. */
export function useTelegramVerticalSwipes(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isTMA()) return;
    const update = () => {
      const root = document.documentElement;
      const scrollable =
        root.scrollHeight > window.innerHeight + 8 ||
        document.body.scrollHeight > window.innerHeight + 8;
      syncTelegramVerticalSwipes(scrollable);
    };
    update();
    const frame = window.requestAnimationFrame(update);
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    observer?.observe(document.documentElement);
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [pathname]);
}

/** Enable the close confirmation only while this caller has unsaved edits. */
export function useTelegramUnsavedEdits(dirty: boolean): void {
  useEffect(() => {
    if (!dirty || !isTMA()) return;
    return retainClosingConfirmation();
  }, [dirty]);
}

/**
 * Register the screen's primary action on Telegram's main button.
 * Returns true when the native button is showing, so the screen can omit
 * the matching on-screen control instead of rendering it twice.
 */
export function useTelegramMainAction(
  action: { text: string; onClick: () => void; enabled?: boolean } | null,
): boolean {
  const onClickRef = useRef(action?.onClick);
  onClickRef.current = action?.onClick;
  const id = useId();
  const text = action?.text ?? '';
  const enabled = action?.enabled ?? true;
  const active = action !== null;

  useEffect(() => {
    if (!isTMA()) return;
    if (!active) {
      syncTelegramMainButton(null, id);
      return;
    }
    syncTelegramMainButton({
      id,
      text,
      enabled,
      onClick: () => onClickRef.current?.(),
    });
    return () => syncTelegramMainButton(null, id);
  }, [active, text, enabled, id]);

  return active && isTMA() && supportsTelegramMainButton();
}
