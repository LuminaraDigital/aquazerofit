/**
 * Telegram Mini App integration (AQF-09 §2.1 client side).
 * The global is typed minimally here — we only touch the surface we need,
 * and every helper is a safe no-op outside of Telegram.
 */

interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

interface TelegramWebApp {
  initData: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  ready(): void;
  expand(): void;
  HapticFeedback?: TelegramHapticFeedback;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function getWebApp(): TelegramWebApp | undefined {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
}

/** True only when actually launched inside Telegram (initData present). */
export function isTMA(): boolean {
  return Boolean(getWebApp()?.initData);
}

/** Raw signed launch data for POST /auth/telegram, or null outside Telegram. */
export function getTelegramInitData(): string | null {
  const data = getWebApp()?.initData;
  return data ? data : null;
}

/**
 * Signal readiness, expand to full height and bind Telegram theme params
 * onto CSS custom properties on :root (as --tg-theme-*). Safe no-op on web.
 */
export function initTelegram(): void {
  const tg = getWebApp();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
  } catch {
    // Older clients may not implement both; never crash the app shell.
  }
  const theme = tg.themeParams;
  if (theme && typeof document !== 'undefined') {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme)) {
      if (typeof value === 'string' && /^#[0-9a-fA-F]{6,8}$/.test(value)) {
        root.style.setProperty(`--tg-theme-${key.replace(/_/g, '-')}`, value);
      }
    }
  }
}

export type HapticType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'error'
  | 'warning'
  | 'selection';

/** Fire haptic feedback inside Telegram; silently does nothing elsewhere. */
export function haptic(type: HapticType = 'light'): void {
  const h = getWebApp()?.HapticFeedback;
  if (!h) return;
  try {
    if (type === 'success' || type === 'error' || type === 'warning') {
      h.notificationOccurred(type);
    } else if (type === 'selection') {
      h.selectionChanged();
    } else {
      h.impactOccurred(type);
    }
  } catch {
    // Haptics are decorative — never throw.
  }
}
