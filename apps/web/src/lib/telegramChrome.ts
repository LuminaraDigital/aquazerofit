/**
 * Telegram Mini App chrome: back button, main button, viewport, safe areas,
 * header and background colours, swipe lock, closing confirmation.
 *
 * Every WebApp call is behind isVersionAtLeast. Outside Telegram, or on a
 * client older than the method, each helper returns without touching the host.
 * The browser target stays on the shipped layout.
 */
import {
  contrastRatio,
  isTMA,
  parseHexColor,
  rgbToHex,
  telegramHostColor,
  telegramWebApp,
  type Rgb,
  type TelegramInsets,
  type TelegramWebApp,
} from './telegram';

const AA_TEXT_CONTRAST = 4.5;
const SHIPPED_SURFACE = '#0e1416';

const SAFE_SIDES = ['top', 'bottom', 'left', 'right'] as const;

export function telegramSupports(version: string): boolean {
  const tg = telegramWebApp();
  if (!tg?.initData || typeof tg.isVersionAtLeast !== 'function') return false;
  try {
    return tg.isVersionAtLeast(version) === true;
  } catch {
    return false;
  }
}

function call(fn: (() => void) | undefined): void {
  if (!fn) return;
  try {
    fn();
  } catch {
    // Host chrome is an enhancement. A throw must not take down the shell.
  }
}

/** Hex of the surface the theme binding actually painted, or the shipped dark. */
export function activeSurfaceHex(): string {
  if (typeof document === 'undefined') return SHIPPED_SURFACE;
  const raw = document.documentElement.style.getPropertyValue('--azf-surface').trim();
  const parts = raw.split(/\s+/).map(Number);
  if (
    parts.length === 3 &&
    parts.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
  ) {
    return rgbToHex(parts as unknown as Rgb);
  }
  return SHIPPED_SURFACE;
}

/** Match the Telegram header and page background to the painted surface. */
export function syncTelegramChromeColors(): void {
  if (!isTMA() || !telegramSupports('6.1')) return;
  const tg = telegramWebApp();
  if (!tg?.setHeaderColor && !tg?.setBackgroundColor) return;
  const painted = activeSurfaceHex();
  const color = telegramHostColor(painted, tg.themeParams?.['bg_color'], telegramSupports('6.9'));
  if (tg.setHeaderColor) call(() => tg.setHeaderColor?.(color));
  if (tg.setBackgroundColor) call(() => tg.setBackgroundColor?.(color));
}

function publishInset(name: string, inset: TelegramInsets | undefined): void {
  if (!inset || typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const side of SAFE_SIDES) {
    const value = inset[side];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
    root.style.setProperty(`--tg-${name}-inset-${side}`, `${value}px`);
  }
}

/** Copy safeAreaInset and contentSafeAreaInset onto the documented CSS variables. */
export function publishTelegramSafeAreas(): void {
  if (!telegramSupports('8.0')) return;
  const tg = telegramWebApp();
  publishInset('safe-area', tg?.safeAreaInset);
  publishInset('content-safe-area', tg?.contentSafeAreaInset);
}

/** viewportStableHeight drives layout. Ignore in-flight resizes. */
export function publishTelegramViewport(isStateStable = true): void {
  if (!isStateStable || !telegramSupports('6.0') || typeof document === 'undefined') return;
  const height = telegramWebApp()?.viewportStableHeight;
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return;
  document.documentElement.style.setProperty('--tg-viewport-stable-height', `${Math.round(height)}px`);
}

let chromeDetach: (() => void) | null = null;

/**
 * Mark the document as a Mini App and subscribe to viewport and safe-area
 * changes. Idempotent. Theme rebinding stays in initTelegram.
 */
export function installTelegramChrome(): void {
  if (!isTMA() || typeof document === 'undefined') return;
  document.documentElement.classList.add('tg-active');
  publishTelegramViewport();
  publishTelegramSafeAreas();
  syncTelegramChromeColors();
  if (chromeDetach) return;
  const tg = telegramWebApp();
  if (!tg?.onEvent) return;

  const onViewport = (event?: unknown) => {
    const stable =
      !event ||
      typeof event !== 'object' ||
      (event as { isStateStable?: boolean }).isStateStable !== false;
    publishTelegramViewport(stable);
  };
  const onSafe = () => publishTelegramSafeAreas();

  if (telegramSupports('6.0')) tg.onEvent('viewportChanged', onViewport);
  if (telegramSupports('8.0')) {
    tg.onEvent('safeAreaChanged', onSafe);
    tg.onEvent('contentSafeAreaChanged', onSafe);
  }
  chromeDetach = () => {
    try {
      tg.offEvent?.('viewportChanged', onViewport);
      tg.offEvent?.('safeAreaChanged', onSafe);
      tg.offEvent?.('contentSafeAreaChanged', onSafe);
    } catch {
      // Unsubscribing is best-effort.
    }
    chromeDetach = null;
  };
}

/**
 * Disable vertical swipes while the page itself scrolls, so a drag does not
 * collapse the Mini App. Non-scrollable screens keep the host gesture.
 * Bot API 7.7+.
 */
export function syncTelegramVerticalSwipes(scrollable: boolean): void {
  if (!telegramSupports('7.7')) return;
  const tg = telegramWebApp();
  if (scrollable) call(() => tg?.disableVerticalSwipes?.());
  else call(() => tg?.enableVerticalSwipes?.());
}

function syncClosing(enabled: boolean): void {
  if (!telegramSupports('6.2')) return;
  const tg = telegramWebApp();
  if (enabled) call(() => tg?.enableClosingConfirmation?.());
  else call(() => tg?.disableClosingConfirmation?.());
}

let dirtySources = 0;

/** Reference-counted. Confirmation stays on while any mounted form is dirty. */
export function retainClosingConfirmation(): () => void {
  dirtySources += 1;
  syncClosing(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    dirtySources = Math.max(0, dirtySources - 1);
    syncClosing(dirtySources > 0);
  };
}

let backHandler: (() => void) | null = null;

/** Show the native back button on non-root routes. Bot API 6.1+. */
export function syncTelegramBackButton(visible: boolean, onBack: () => void): void {
  if (!telegramSupports('6.1')) return;
  const button = telegramWebApp()?.BackButton;
  if (!button) return;
  if (backHandler) call(() => button.offClick(backHandler!));
  backHandler = onBack;
  call(() => button.onClick(onBack));
  if (visible) call(() => button.show());
  else call(() => button.hide());
}

export interface MainButtonAction {
  id: string;
  text: string;
  enabled: boolean;
  onClick: () => void;
}

let mainOwner: string | null = null;
let mainHandler: (() => void) | null = null;

export function supportsTelegramMainButton(): boolean {
  const button = telegramWebApp()?.MainButton;
  return telegramSupports('6.1') && typeof button?.show === 'function' && typeof button?.onClick === 'function';
}

/**
 * Solid colours for the native button. Prefer the host pair when it already
 * clears AA. Otherwise a brand pair that does, light or dark.
 */
export function mainButtonPalette(
  theme: Record<string, string> | undefined,
  scheme: 'light' | 'dark' | undefined,
): { color: string; textColor: string } {
  const background = parseHexColor(theme?.['button_color']);
  const text = parseHexColor(theme?.['button_text_color']);
  if (background && text && contrastRatio(text, background) >= AA_TEXT_CONTRAST) {
    return { color: rgbToHex(background), textColor: rgbToHex(text) };
  }
  if (scheme === 'light') return { color: '#0f6f82', textColor: '#ffffff' };
  return { color: '#2fd9f4', textColor: '#00363e' };
}

export function syncTelegramMainButton(action: MainButtonAction | null, ownerId?: string): void {
  if (!supportsTelegramMainButton()) return;
  const button = telegramWebApp()?.MainButton;
  if (!button) return;
  if (action === null) {
    if (ownerId && mainOwner !== ownerId) return;
    if (mainHandler) call(() => button.offClick(mainHandler!));
    mainHandler = null;
    mainOwner = null;
    call(() => button.hide());
    return;
  }
  if (mainHandler) call(() => button.offClick(mainHandler!));
  mainOwner = action.id;
  mainHandler = action.onClick;
  const tg = telegramWebApp() as TelegramWebApp;
  const colors = mainButtonPalette(tg.themeParams, tg.colorScheme);
  call(() =>
    button.setParams?.({
      text: action.text,
      color: colors.color,
      text_color: colors.textColor,
      is_active: action.enabled,
      is_visible: true,
    }),
  );
  call(() => button.onClick(action.onClick));
  if (action.enabled) call(() => button.enable?.());
  else call(() => button.disable?.());
  call(() => button.show());
}

export interface DeviceSignals {
  inTelegram: boolean;
  platform?: string;
  colorScheme?: 'light' | 'dark';
  deviceMemory?: number;
  hardwareConcurrency?: number;
  prefersReducedMotion?: boolean;
}

/**
 * Static CSS background instead of the WebGL aurora.
 * Only inside Telegram: Android, a light scheme (the shader is a dark ocean),
 * deviceMemory <= 4, hardwareConcurrency <= 4, or reduced motion.
 * Outside Telegram this is always false. Reduced motion there already skips
 * the shader and leaves the existing canvas stack alone.
 */
export function shouldUseStaticTelegramBackground(signals: DeviceSignals): boolean {
  if (!signals.inTelegram) return false;
  if (signals.prefersReducedMotion) return true;
  if (signals.colorScheme === 'light') return true;
  const platform = (signals.platform ?? '').toLowerCase();
  if (platform === 'android' || platform.startsWith('android')) return true;
  if (typeof signals.deviceMemory === 'number' && signals.deviceMemory <= 4) return true;
  if (typeof signals.hardwareConcurrency === 'number' && signals.hardwareConcurrency <= 4) return true;
  return false;
}

/** Drop module state so unit tests do not leak subscriptions across cases. */
export function resetTelegramChromeForTests(): void {
  chromeDetach?.();
  chromeDetach = null;
  dirtySources = 0;
  backHandler = null;
  mainHandler = null;
  mainOwner = null;
}
