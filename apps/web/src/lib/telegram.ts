/**
 * Telegram Mini App integration (AQF-09 §2.1 client side).
 * The global is typed minimally here - we only touch the surface we need,
 * and every helper is a safe no-op outside of Telegram.
 */

interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

interface TelegramWebApp {
  initData: string;
  /**
   * Client-side parse of the same launch data. Unsigned by definition, so it
   * is read only for things that are not security decisions — here, the
   * attribution payload from the landing page's deep link. Anything that
   * grants access still goes through the server, which re-parses `initData`
   * and verifies its HMAC.
   */
  initDataUnsafe?: { start_param?: string };
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  ready(): void;
  expand(): void;
  HapticFeedback?: TelegramHapticFeedback;
  /** Present from Bot API 6.1; older clients simply never fire theme updates. */
  onEvent?(event: 'themeChanged', handler: () => void): void;
  offEvent?(event: 'themeChanged', handler: () => void): void;
  /**
   * Stars checkout, Bot API 6.1+. Optional because an older Telegram client
   * simply does not have it — which is a real case, not a theoretical one, and
   * is why `canPayWithStars()` exists rather than an unguarded call that
   * throws inside the purchase handler.
   */
  openInvoice?(url: string, callback?: (status: InvoiceStatus) => void): void;
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
 * The `startapp` payload from the deep link that launched this Mini App — the
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
// telegram.org on every page load — including the landing page, whose entire
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
    // Storage denied (private mode, third-party context) — not a launch signal.
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
 * Bootstrap Telegram if — and only if — this is a Mini App launch. On the web
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
//            secondary/hint text, hairline outlines. These are chrome — the
//            user picked them in their client and the app should sit inside
//            it rather than punch a hole in it.
//
//   BRAND    aqua primary, mint secondary, coral/tertiary, the error ramp,
//            the CTA gradient and every on-* pairing. These are the product's
//            identity and, just as importantly, ~200 usages across the app
//            assume this exact light-on-dark ramp. Repainting them from a
//            chat client would make AquaZeroFit unrecognisable *and* break
//            pairs like `bg-secondary text-on-secondary`.
//
// Because the brand foregrounds are fixed and light, the bound surface is not
// free to be anything: a white host background would leave #8aebff headings
// at 1.3:1. So every candidate background is gated on keeping the fixed brand
// foregrounds at WCAG AA, and a host theme that fails the gate (any light
// Telegram theme) binds nothing at all and renders the shipped dark palette,
// which is readable. That is a measured decision, not an assumption that the
// host is dark — see resolveTelegramNeutrals below and its tests.
// ---------------------------------------------------------------------------

/** sRGB channel triplet, 0-255. */
export type Rgb = readonly [number, number, number];

/** Smallest contrast we will accept for body-sized text (WCAG 2.1 AA). */
const AA_TEXT_CONTRAST = 4.5;

/**
 * Brand foregrounds that are painted directly on the page surface and are
 * never rebound. The palest of these is what limits how light a bound host
 * background may be. Mirrors the --azf-* brand block in styles/index.css.
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
 * polarity — it always steps *towards* the host's text colour.
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
 * AA. This is the whole light/dark question, answered by measurement rather
 * than by reading colorScheme.
 */
export function keepsBrandLegible(background: Rgb): boolean {
  return FIXED_BRAND_FOREGROUNDS.every(
    (fg) => contrastRatio(fg, background) >= AA_TEXT_CONTRAST,
  );
}

/**
 * Map Telegram theme params onto the --azf-* neutrals.
 *
 * Returns an empty map — meaning "keep the shipped palette" — when the theme
 * is missing, unparseable, or light enough that binding it would drop the
 * fixed brand foregrounds below AA. Pure, so the contrast rules are testable
 * without a DOM.
 */
export function resolveTelegramNeutrals(
  theme: Record<string, string> | undefined,
): Record<string, string> {
  const background = parseHexColor(theme?.['bg_color']);
  if (!background || !keepsBrandLegible(background)) return {};

  const text = parseHexColor(theme?.['text_color']);
  const textIsReadable =
    text !== null && contrastRatio(text, background) >= AA_TEXT_CONTRAST;
  // The ramp needs a foreground anchor even if the host's own text colour is
  // unusable. The background passed the gate, so it is dark: white is safe.
  const anchor: Rgb = textIsReadable && text ? text : [255, 255, 255];

  const bound: Record<string, string> = {
    '--azf-surface': channels(background),
    '--azf-surface-dim': channels(background),
  };
  for (const [property, t] of Object.entries(CONTAINER_RAMP)) {
    bound[property] = channels(mix(background, anchor, t));
  }
  if (textIsReadable && text) bound['--azf-on-surface'] = channels(text);

  // Telegram's hint colour is routinely below AA against its own background
  // (#708499 on #17212b is 4.2:1). Rather than drop it or accept it, walk it
  // towards the text colour until it passes — the host's intent survives, the
  // contrast floor holds.
  const hint = parseHexColor(theme?.['hint_color']);
  if (hint) {
    for (let step = 0; step <= 10; step += 1) {
      const candidate = mix(hint, anchor, step / 10);
      if (contrastRatio(candidate, background) >= AA_TEXT_CONTRAST) {
        bound['--azf-on-surface-variant'] = channels(candidate);
        break;
      }
    }
  }
  return bound;
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

  const bound = resolveTelegramNeutrals(theme);
  for (const property of BOUND_PROPERTIES) root.style.removeProperty(property);
  if (Object.keys(bound).length === 0) {
    delete root.dataset['tgTheme'];
    return false;
  }
  for (const [property, value] of Object.entries(bound)) {
    root.style.setProperty(property, value);
  }
  root.dataset['tgTheme'] = tg?.colorScheme ?? 'dark';
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
  try {
    // Bot API 6.1+. Without this, switching theme in Telegram would leave the
    // app on the theme it launched with until the user reloaded it.
    tg.onEvent?.('themeChanged', () => {
      applyTelegramTheme();
    });
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
  const tg = getWebApp() as TelegramWebApp & {
    openTelegramLink?: (u: string) => void;
    openLink?: (u: string) => void;
  } | undefined;
  try {
    if (tg?.openTelegramLink && url.startsWith('https://t.me/')) {
      tg.openTelegramLink(url);
      return;
    }
    if (tg?.openLink) {
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
 * not a degraded case to work around — it is the segment whose network blocks
 * Telegram, and the honest thing to show them is "open this in Telegram to
 * buy", not a button that silently does nothing.
 */
export function canPayWithStars(): boolean {
  const tg = getWebApp();
  return Boolean(tg?.initData && typeof tg.openInvoice === 'function');
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
  if (!openInvoice) return Promise.resolve('failed');
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
