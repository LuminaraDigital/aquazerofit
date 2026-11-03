/**
 * Telegram Mini App integration (AQF-09 §2.1 client side).
 * The global is typed minimally here - we only touch the surface we need,
 * and every helper is a safe no-op outside of Telegram.
 */
import {
  installTelegramChrome,
  syncTelegramChromeColors,
  telegramSupports,
} from './telegramChrome';

interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

export interface TelegramInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramBackButton {
  show(): void;
  hide(): void;
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
}

interface TelegramMainButton {
  show(): void;
  hide(): void;
  enable?(): void;
  disable?(): void;
  setText?(text: string): void;
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
  setParams?(params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
  }): void;
}

export interface TelegramWebApp {
  initData: string;
  /**
   * Client-side parse of the same launch data. Unsigned by definition, so it
   * is read only for things that are not security decisions. Here, the
   * attribution payload from the landing page's deep link. Anything that
   * grants access still goes through the server, which re-parses `initData`
   * and verifies its HMAC.
   */
  initDataUnsafe?: { start_param?: string };
  version?: string;
  platform?: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramInsets;
  contentSafeAreaInset?: TelegramInsets;
  ready(): void;
  expand(): void;
  isVersionAtLeast?(version: string): boolean;
  HapticFeedback?: TelegramHapticFeedback;
  BackButton?: TelegramBackButton;
  MainButton?: TelegramMainButton;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  /** Events are versioned individually. Callers gate with isVersionAtLeast. */
  onEvent?(event: string, handler: (...args: unknown[]) => void): void;
  offEvent?(event: string, handler: (...args: unknown[]) => void): void;
  /**
   * Stars checkout, Bot API 6.1+. Optional because an older Telegram client
   * simply does not have it. That is a real case, not a theoretical one, and
   * is why `canPayWithStars()` exists rather than an unguarded call that
   * throws inside the purchase handler.
   */
  openInvoice?(url: string, callback?: (status: InvoiceStatus) => void): void;
  openTelegramLink?(url: string): void;
  openLink?(url: string): void;
  /** Bot API 7.8+. `mediaUrl` must be a public HTTPS URL, not a blob. */
  shareToStory?(mediaUrl: string, params?: { text?: string }): void;
  /** Bot API 8.0+. The callback receives whether access was granted. */
  requestEmojiStatusAccess?(callback?: (allowed: boolean) => void): void;
}

/** Terminal states Telegram reports back from an invoice. */
export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function getWebApp(): TelegramWebApp | undefined {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
}

/** The live WebApp object, or undefined outside Telegram and in SSR. */
export function telegramWebApp(): TelegramWebApp | undefined {
  return getWebApp();
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
 * The `startapp` payload from the deep link that launched this Mini App. It is the
 * only channel by which anything survives the web → Telegram hop. Null outside
 * Telegram and for a launch that carried no payload.
 */
export function getTelegramStartParam(): string | null {
  const raw = getWebApp()?.initDataUnsafe?.start_param;
  return raw ? raw : null;
}

// ---------------------------------------------------------------------------
// SDK loading
//
// The SDK used to be a blocking <script> in index.html, fetched from
// telegram.org on every page load, including the landing page, whose entire
// job is to convert visitors who are *not* in Telegram yet. That put a
// third-party, render-blocking request in front of the marketing site for
// everyone, and made the page hang for precisely the audience least able to
// afford it: the corporate networks that block telegram.org outright, whose
// users are the ones who need the browser fallback the page offers.
//
// So the SDK is now fetched only when the page is actually a Mini App launch,
// detected without it. Telegram passes its launch data in the URL fragment
// (#tgWebAppData=…), and its own SDK mirrors that into sessionStorage so a
// reload inside the Mini App still works. Both are readable before any script
// loads, which is what makes the detection possible.
// ---------------------------------------------------------------------------

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';

/**
 * Budget for the SDK fetch. A blocked or black-holed telegram.org must not
 * hold the app shell forever; on timeout we render anyway and the user lands
 * on the normal sign-in path rather than on a spinner.
 */
const SDK_TIMEOUT_MS = 5000;

/** Where Telegram's own SDK caches launch params across in-app reloads. */
const TG_SESSION_KEY = '__telegram__initParams';

/**
 * Does this page load look like a Telegram Mini App launch? Answered without
 * the SDK, so it can decide whether to fetch it at all.
 */
export function looksLikeTelegramLaunch(): boolean {
  if (typeof window === 'undefined') return false;
  if (getWebApp()?.initData) return true;
  const surface = `${window.location.hash}${window.location.search}`;
  if (/[#&?]tgWebApp(Data|Version|Platform)=/.test(surface)) return true;
  try {
    return Boolean(window.sessionStorage.getItem(TG_SESSION_KEY));
  } catch {
    // Storage denied (private mode, third-party context). That is not a launch signal.
    return false;
  }
}

let sdkLoad: Promise<boolean> | null = null;

/** Fetch the Telegram SDK once. Resolves false if it fails or times out. */
export function loadTelegramSdk(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (getWebApp()) return Promise.resolve(true);
  sdkLoad ??= new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok && Boolean(getWebApp()));
    };
    const timer = window.setTimeout(() => finish(false), SDK_TIMEOUT_MS);
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });
  return sdkLoad;
}

/**
 * Bootstrap Telegram if, and only if, this is a Mini App launch. On the web
 * this resolves immediately having touched no third-party origin at all.
 */
export async function ensureTelegram(): Promise<boolean> {
  if (!looksLikeTelegramLaunch()) return false;
  const loaded = await loadTelegramSdk();
  if (!loaded) return false;
  initTelegram();
  return isTMA();
}

// ---------------------------------------------------------------------------
// Theme binding
//
// The Mini App is one of two delivery targets, and until now the client's
// theme was written to --tg-theme-* and read by nobody. The binding below
// closes that at the token layer (styles/index.css declares every palette
// entry as an --azf-* channel triplet), so no component has to opt in and a
// new component cannot forget to.
//
// The line drawn between "follows the host" and "stays AquaZeroFit":
//
//   BOUND    page background, the surface/container ramp, primary text,
//            secondary/hint text, hairline outlines. These are chrome. The
//            user picked them in their client and the app should sit inside
//            it rather than punch a hole in it.
//
//   BRAND    aqua primary, mint secondary, coral/tertiary, the error ramp,
//            the CTA gradient and every on-* pairing. On a dark host these
//            stay the shipped light-on-dark ramp: repainting them from a chat
//            client would make AquaZeroFit unrecognisable and break pairs
//            like `bg-secondary text-on-secondary`.
//
// A light host is different. The shipped foregrounds are light (#8aebff on
// white is about 1.3:1), so a light colorScheme cannot keep them. It binds
// the host background and text, then darkens each brand foreground until it
// clears WCAG AA on that background and flips the matching on-* ink so
// buttons stay readable. An explicit dark colorScheme with a light background
// keeps the shipped dark palette instead of painting light text on white.
// See resolveTelegramAppearance below and its tests.
// ---------------------------------------------------------------------------

/** sRGB channel triplet, 0-255. */
export type Rgb = readonly [number, number, number];

/** Smallest contrast we will accept for body-sized text (WCAG 2.1 AA). */
const AA_TEXT_CONTRAST = 4.5;

/**
 * Floor used when painting ink. A step coarser than 4.5, so the colour axe
 * measures still clears AA after rounding and after it sits on a card that is
 * a hair darker than the page.
 */
const AA_INK_CONTRAST = 4.8;

/**
 * Shipped brand foregrounds. On a dark host they stay as written. They are
 * also the contrast floor for adopting a dark host background: if any of
 * them would fall under AA, the background is not a dark theme. Mirrors the
 * --azf-* brand block in styles/index.css.
 */
const FIXED_BRAND_FOREGROUNDS: readonly Rgb[] = [
  [138, 235, 255], // primary
  [69, 223, 164], // secondary
  [47, 217, 244], // primary-fixed-dim / surface-tint
  [255, 170, 178], // tertiary-container
  [255, 178, 185], // coral
  [255, 180, 171], // error
  [187, 201, 205], // on-surface-variant fallback
];

/**
 * Container ramp offsets, expressed as a fraction of the distance from the
 * background to the foreground. Taken from the shipped palette's own spacing
 * (#0e1416 -> #161d1e -> ... -> #343a3c) so a bound host keeps the same sense
 * of depth, and so the ramp runs the correct direction whatever the host's
 * polarity. It always steps *towards* the host's text colour.
 */
const CONTAINER_RAMP = {
  '--azf-surface-container-lowest': -0.025,
  '--azf-surface-container-low': 0.04,
  '--azf-surface-container': 0.06,
  '--azf-surface-container-high': 0.11,
  '--azf-surface-container-highest': 0.16,
  '--azf-surface-bright': 0.185,
  '--azf-outline-variant': 0.22,
  '--azf-outline': 0.55,
} as const;

/** Every property the binding may write, so a failed rebind can clear cleanly. */
const BOUND_PROPERTIES: readonly string[] = [
  '--azf-surface',
  '--azf-surface-dim',
  '--azf-on-surface',
  '--azf-on-surface-variant',
  ...Object.keys(CONTAINER_RAMP),
];

/** Parse `#rrggbb` / `#rrggbbaa`; alpha is dropped. Null on anything else. */
export function parseHexColor(value: string | undefined): Rgb | null {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) return null;
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function toLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.1 relative contrast ratio, 1..21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

/** Linear interpolation between two colours; t may overshoot and is clamped. */
function mix(from: Rgb, to: Rgb, t: number): Rgb {
  const channel = (a: number, b: number): number =>
    Math.max(0, Math.min(255, Math.round(a + (b - a) * t)));
  return [channel(from[0], to[0]), channel(from[1], to[1]), channel(from[2], to[2])];
}

function channels(color: Rgb): string {
  return `${color[0]} ${color[1]} ${color[2]}`;
}

/**
 * True when a candidate page background keeps every fixed brand foreground at
 * AA. Dark hosts pass. Light hosts do not, and take the light-theme path.
 */
export function keepsBrandLegible(background: Rgb): boolean {
  return FIXED_BRAND_FOREGROUNDS.every(
    (fg) => contrastRatio(fg, background) >= AA_TEXT_CONTRAST,
  );
}

/** Fallback page colour when a light client sends no bg_color. */
const DEFAULT_LIGHT_BG: Rgb = [244, 248, 249];
const DEFAULT_LIGHT_TEXT: Rgb = [23, 29, 31];

/**
 * Shipped brand colours that light themes darken. Same hues, lower luminance,
 * so headings and buttons stay AquaZeroFit and still clear AA on white.
 */
const LIGHT_BRAND: Readonly<Record<string, Rgb>> = {
  '--azf-primary': [138, 235, 255],
  '--azf-secondary': [69, 223, 164],
  '--azf-tertiary': [255, 210, 213],
  '--azf-error': [255, 180, 171],
  '--azf-success': [69, 223, 164],
  '--azf-warning': [255, 196, 90],
  '--azf-info': [138, 235, 255],
  '--azf-coral': [255, 178, 185],
  '--azf-tertiary-container': [255, 170, 178],
  '--azf-surface-tint': [47, 217, 244],
  '--azf-primary-fixed-dim': [47, 217, 244],
  '--azf-secondary-fixed-dim': [69, 223, 164],
  '--azf-tertiary-fixed-dim': [255, 178, 185],
};

const ON_ROLE: Readonly<Record<string, string>> = {
  '--azf-primary': '--azf-on-primary',
  '--azf-secondary': '--azf-on-secondary',
  '--azf-tertiary': '--azf-on-tertiary',
  '--azf-error': '--azf-on-error',
  '--azf-success': '--azf-on-success',
  '--azf-warning': '--azf-on-warning',
  '--azf-info': '--azf-on-info',
  '--azf-tertiary-container': '--azf-on-tertiary-container',
};

/** Every property the binding may write, so a failed rebind can clear cleanly. */
export const TELEGRAM_APPEARANCE_PROPERTIES: readonly string[] = [
  ...BOUND_PROPERTIES,
  ...Object.keys(LIGHT_BRAND),
  ...Object.values(ON_ROLE),
  '--azf-cta-text',
];

export interface TelegramAppearance {
  /** CSS custom properties. Empty means keep the shipped palette. */
  vars: Record<string, string>;
  scheme: 'light' | 'dark' | null;
}

/** Colour painted at `alpha` over the page. Chip washes are this composite. */
function over(color: Rgb, background: Rgb, alpha: number): Rgb {
  return mix(background, color, alpha);
}

/**
 * Darken until the ink clears AA on the page and on a 25% wash of itself.
 * Chips render the same token as text on `bg-token/15` and `/25`. Meeting AA
 * only against the page leaves those labels short of 4.5:1.
 */
function darkenUntil(color: Rgb, background: Rgb): Rgb {
  const steps = 60;
  for (let step = 0; step <= steps; step += 1) {
    const candidate = mix(color, [0, 0, 0], step / steps);
    const onPage = contrastRatio(candidate, background) >= AA_INK_CONTRAST;
    const onChip = contrastRatio(candidate, over(candidate, background, 0.25)) >= AA_TEXT_CONTRAST;
    if (onPage && onChip) return candidate;
  }
  return [0, 0, 0];
}

export function rgbToHex(color: Rgb): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function inkForFills(fills: readonly Rgb[]): Rgb {
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];
  const worst = (ink: Rgb) => Math.min(...fills.map((fill) => contrastRatio(ink, fill)));
  return worst(white) >= worst(black) ? white : black;
}

function neutralVars(
  background: Rgb,
  theme: Record<string, string> | undefined,
  anchor: Rgb,
  text: Rgb | null,
): Record<string, string> {
  const bound: Record<string, string> = {
    '--azf-surface': channels(background),
    '--azf-surface-dim': channels(background),
  };
  for (const [property, t] of Object.entries(CONTAINER_RAMP)) {
    bound[property] = channels(mix(background, anchor, t));
  }
  if (text && contrastRatio(text, background) >= AA_TEXT_CONTRAST) {
    bound['--azf-on-surface'] = channels(text);
  }
  // Telegram's hint colour is routinely below AA against its own background
  // (#708499 on #17212b is 4.2:1). Rather than drop it or accept it, walk it
  // towards the text colour until it passes. The host's intent survives, the
  // contrast floor holds.
  const hint = parseHexColor(theme?.['hint_color']);
  if (hint) {
    for (let step = 0; step <= 10; step += 1) {
      const candidate = mix(hint, anchor, step / 10);
      if (contrastRatio(candidate, background) >= AA_INK_CONTRAST) {
        bound['--azf-on-surface-variant'] = channels(candidate);
        break;
      }
    }
  }
  return bound;
}

/**
 * Map Telegram theme params onto the token layer.
 *
 * Dark hosts bind neutrals only, and only while the shipped brand foregrounds
 * stay at AA. Light hosts (colorScheme light, or a light bg_color when the
 * scheme is unset) bind neutrals and a darkened brand ramp. An empty `vars`
 * map means "keep the shipped palette". Pure, so the contrast rules are
 * testable without a DOM.
 */
export function resolveTelegramAppearance(
  theme: Record<string, string> | undefined,
  colorScheme?: 'light' | 'dark',
): TelegramAppearance {
  const parsed = parseHexColor(theme?.['bg_color']);
  const background = parsed ?? (colorScheme === 'light' ? DEFAULT_LIGHT_BG : null);
  if (!background) return { vars: {}, scheme: null };

  const brandOk = keepsBrandLegible(background);
  const blackOk = contrastRatio([0, 0, 0], background) >= AA_TEXT_CONTRAST;
  const wantLight = colorScheme === 'light' || (colorScheme !== 'dark' && !brandOk && blackOk);

  if (wantLight && !brandOk && blackOk) {
    const supplied = parseHexColor(theme?.['text_color']);
    const text =
      supplied && contrastRatio(supplied, background) >= AA_TEXT_CONTRAST
        ? supplied
        : colorScheme === 'light' && !parsed
          ? DEFAULT_LIGHT_TEXT
          : null;
    const readableText = text && contrastRatio(text, background) >= AA_TEXT_CONTRAST ? text : null;
    const anchor: Rgb = readableText ?? [0, 0, 0];
    const vars = neutralVars(background, theme, anchor, readableText ?? anchor);
    const fills: Rgb[] = [];
    for (const [property, source] of Object.entries(LIGHT_BRAND)) {
      const darkened = darkenUntil(source, background);
      vars[property] = channels(darkened);
      fills.push(darkened);
      const onRole = ON_ROLE[property];
      if (onRole) vars[onRole] = channels(inkForFills([darkened]));
    }
    const tint = darkenUntil(LIGHT_BRAND['--azf-surface-tint'] ?? [47, 217, 244], background);
    const secondary = darkenUntil(LIGHT_BRAND['--azf-secondary'] ?? [69, 223, 164], background);
    vars['--azf-cta-text'] = rgbToHex(inkForFills([tint, secondary]));
    return { vars, scheme: 'light' };
  }

  if (!brandOk) return { vars: {}, scheme: null };

  const text = parseHexColor(theme?.['text_color']);
  const textIsReadable = text !== null && contrastRatio(text, background) >= AA_TEXT_CONTRAST;
  const anchor: Rgb = textIsReadable && text ? text : [255, 255, 255];
  return {
    vars: neutralVars(background, theme, anchor, textIsReadable ? text : null),
    scheme: 'dark',
  };
}

/**
 * Neutrals only, for callers that predate the light brand ramp.
 * Prefer resolveTelegramAppearance for new code.
 */
export function resolveTelegramNeutrals(
  theme: Record<string, string> | undefined,
  colorScheme?: 'light' | 'dark',
): Record<string, string> {
  const { vars } = resolveTelegramAppearance(theme, colorScheme);
  const neutrals: Record<string, string> = {};
  for (const property of BOUND_PROPERTIES) {
    const value = vars[property];
    if (value) neutrals[property] = value;
  }
  return neutrals;
}

/**
 * Colour passed to setHeaderColor / setBackgroundColor.
 *
 * Bot API 6.9+ accepts any #RRGGBB. Older 6.1 clients accept only the host
 * bg_color (the keyword or that exact hex). When the painted surface is the
 * host background, pass the hex on both. Otherwise fall back to the keyword
 * until arbitrary hex is allowed, then pass the painted surface.
 */
export function telegramHostColor(
  paintedHex: string,
  themeBg: string | undefined,
  arbitraryHex: boolean,
): string {
  const painted = paintedHex.toLowerCase();
  if (arbitraryHex) return painted;
  if (themeBg && parseHexColor(themeBg) && themeBg.toLowerCase() === painted) return painted;
  return 'bg_color';
}

/**
 * Write (or clear) the theme binding on :root. Returns whether a host theme
 * was bound, which is also what `html[data-tg-theme]` in the stylesheet keys
 * off. A no-op outside Telegram: the browser target must be byte-identical,
 * so this returns before touching the document.
 */
export function applyTelegramTheme(): boolean {
  if (!isTMA() || typeof document === 'undefined') return false;
  const tg = getWebApp();
  const theme = tg?.themeParams;
  const root = document.documentElement;

  // Keep publishing the raw params: they are the documented Mini App surface
  // and cost nothing, even though the binding below is what the app reads.
  if (theme) {
    for (const [key, value] of Object.entries(theme)) {
      if (parseHexColor(value)) {
        root.style.setProperty(`--tg-theme-${key.replace(/_/g, '-')}`, value);
      }
    }
  }

  root.classList.add('tg-active');
  const appearance = resolveTelegramAppearance(theme, tg?.colorScheme);
  for (const property of TELEGRAM_APPEARANCE_PROPERTIES) root.style.removeProperty(property);
  if (appearance.scheme === null) {
    delete root.dataset['tgTheme'];
    syncTelegramChromeColors();
    return false;
  }
  for (const [property, value] of Object.entries(appearance.vars)) {
    root.style.setProperty(property, value);
  }
  root.dataset['tgTheme'] = appearance.scheme;
  syncTelegramChromeColors();
  return true;
}

/**
 * Signal readiness, expand to full height and bind the client theme onto the
 * app's token layer. Safe no-op on web.
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
  applyTelegramTheme();
  installTelegramChrome();
  try {
    // Bot API 6.1+. Without this, switching theme in Telegram would leave the
    // app on the theme it launched with until the user reloaded it.
    // themeChanged itself arrived with isVersionAtLeast, so gate the subscribe.
    if (typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast('6.1')) {
      tg.onEvent?.('themeChanged', () => {
        applyTelegramTheme();
      });
    }
  } catch {
    // Theme updates are an enhancement, never a reason to fail bootstrap.
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
  // HapticFeedback arrived in Bot API 6.1, with isVersionAtLeast.
  if (!telegramSupports('6.1')) return;
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
    // Haptics are decorative - never throw.
  }
}

/**
 * Open an external / Telegram share URL. Uses Telegram.WebApp.openTelegramLink
 * inside TMA when available; falls back to window.open.
 */
export function openTelegramLink(url: string): void {
  const tg = getWebApp();
  try {
    // openTelegramLink and openLink are Bot API 6.1+.
    if (telegramSupports('6.1') && tg?.openTelegramLink && url.startsWith('https://t.me/')) {
      tg.openTelegramLink(url);
      return;
    }
    if (telegramSupports('6.1') && tg?.openLink) {
      tg.openLink(url);
      return;
    }
  } catch {
    // fall through
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Can this client complete a Stars purchase?
 *
 * Two conditions, both required. `openInvoice` arrived in Bot API 6.1, so an
 * older Telegram build reaches this code with the method absent; and outside
 * Telegram entirely there is no invoice surface at all. The browser path is
 * not a degraded case to work around. It is the segment whose network blocks
 * Telegram, and the honest thing to show them is "open this in Telegram to
 * buy", not a button that silently does nothing.
 */
export function canPayWithStars(): boolean {
  const tg = getWebApp();
  return Boolean(
    tg?.initData && typeof tg.openInvoice === 'function' && telegramSupports('6.1'),
  );
}

/**
 * Open a Stars invoice and resolve with Telegram's terminal status.
 *
 * Resolves rather than rejects on every outcome including `failed`: a
 * cancelled purchase is an ordinary user decision, and modelling it as an
 * exception pushes callers into try/catch for the common path. Resolves
 * `failed` when the client cannot pay, so one branch handles all of it.
 */
export function openStarsInvoice(url: string): Promise<InvoiceStatus> {
  const tg = getWebApp();
  const openInvoice = tg?.openInvoice;
  // Bound to a local before the closure: `tg.openInvoice` is an optional
  // property, so narrowing it here does not survive into the Promise callback.
  // openInvoice is Bot API 6.1+.
  if (!telegramSupports('6.1') || !openInvoice) return Promise.resolve('failed');
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: InvoiceStatus) => {
      if (settled) return;
      settled = true;
      resolve(status);
    };
    // Telegram is documented to always invoke the callback, but a client that
    // closes the invoice without firing it would otherwise leave the caller's
    // spinner running forever. Five minutes is well past any real checkout.
    const timer = setTimeout(() => finish('pending'), 5 * 60 * 1000);
    openInvoice.call(tg, url, (status) => {
      clearTimeout(timer);
      finish(status);
    });
  });
}

/**
 * Caption limit for a story posted by a non-Premium account. Premium allows
 * 2048, but the caption is built before we could know which the user has, so
 * it is cut to the limit everyone can post.
 */
const STORY_CAPTION_MAX = 200;

/** Can this client open Telegram's story editor? Bot API 7.8+, in Telegram. */
export function canShareToStory(): boolean {
  return telegramSupports('7.8') && typeof getWebApp()?.shareToStory === 'function';
}

/**
 * Open the story editor with `mediaUrl` and a caption. Returns false when the
 * client cannot, so the caller can leave the button out rather than offer one
 * that does nothing. The media must be a public HTTPS URL: Telegram fetches
 * it itself, so a canvas blob from this page is not something it can see.
 */
export function shareToStory(mediaUrl: string, caption: string): boolean {
  const tg = getWebApp();
  if (!canShareToStory() || !tg?.shareToStory) return false;
  try {
    tg.shareToStory(mediaUrl, { text: caption.slice(0, STORY_CAPTION_MAX) });
    return true;
  } catch {
    return false;
  }
}

/** Can this client ask for emoji-status access? Bot API 8.0+, in Telegram. */
export function canManageEmojiStatus(): boolean {
  return telegramSupports('8.0') && typeof getWebApp()?.requestEmojiStatusAccess === 'function';
}

/**
 * Show Telegram's own permission prompt for managing the user's emoji status.
 * Resolves with the user's answer; resolves false when the client cannot ask,
 * so "not supported" and "declined" share the one branch that stores nothing.
 */
export function requestEmojiStatusAccess(): Promise<boolean> {
  const tg = getWebApp();
  const request = tg?.requestEmojiStatusAccess;
  if (!canManageEmojiStatus() || !request) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      request.call(tg, (allowed) => resolve(allowed === true));
    } catch {
      resolve(false);
    }
  });
}
