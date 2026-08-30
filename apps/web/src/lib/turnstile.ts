/**
 * Cloudflare Turnstile loader (client half of apps/api/src/platform/botProtection.ts).
 *
 * The site key arrives at RUNTIME from GET /auth/captcha rather than from a
 * VITE_ build-time constant. That matters more than it looks: a build-time key
 * is missed silently — the widget simply never renders and the form goes out
 * unprotected — and it cannot be rotated without rebuilding and redeploying
 * the whole client. On a host where the build and the runtime are separate
 * steps, "someone forgot to set it in the build environment" is the expected
 * failure, not a hypothetical one.
 *
 * A deployment with no keys answers `{ enabled: false }`, the script is never
 * requested, and the forms behave exactly as they did before bot protection
 * existed — which is what the offline demo, local dev and the test suite need.
 */
import { api } from './api';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/**
 * Budget for the script fetch, matching lib/telegram's SDK timeout. A network
 * that drops packets rather than refusing them fires no `error` event, so this
 * is the only thing that turns "blocked forever" into a visible failure the
 * user can retry.
 */
const SCRIPT_TIMEOUT_MS = 5000;

export type CaptchaConfig = { enabled: false } | { enabled: true; siteKey: string };

export interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  appearance?: 'always' | 'execute' | 'interaction-only';
  action?: string;
}

interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const DISABLED: CaptchaConfig = { enabled: false };

let configPromise: Promise<CaptchaConfig> | null = null;
let loader: Promise<TurnstileApi> | null = null;

/**
 * Fetch the deployment's bot-protection config, once per page load.
 *
 * Memoised because several forms may mount over one session and the answer
 * cannot change without a redeploy. A failed lookup resolves to disabled
 * rather than rejecting: if this endpoint is unreachable the API is down and
 * the submit is going to fail on its own terms — blocking the form behind a
 * challenge that can never load would replace a clear error with a dead page.
 * The server still enforces independently, so a client that wrongly believes
 * it is unprotected simply gets its submit refused.
 */
export function fetchCaptchaConfig(): Promise<CaptchaConfig> {
  configPromise ??= (async () => {
    try {
      // Promise.resolve rather than a bare await: this runs inside an effect on
      // the sign-in page, so anything that throws or returns a non-promise here
      // becomes an uncaught error that unmounts the whole form — the exact
      // outcome this lookup is supposed to be incapable of causing. Test suites
      // that stub lib/api are the ordinary way that happens.
      const cfg = await Promise.resolve(api<CaptchaConfig>('/auth/captcha', { auth: false }));
      return cfg?.enabled && cfg.siteKey ? cfg : DISABLED;
    } catch {
      return DISABLED;
    }
  })();
  return configPromise;
}

/**
 * Inject the Turnstile script once and resolve when its API is live.
 *
 * Memoised on the promise rather than on a boolean: two forms mounting in the
 * same tick would otherwise both see "not loaded" and append two script tags,
 * and Turnstile's own script guards against being initialised twice by
 * throwing. The `render=explicit` parameter keeps it from auto-scanning the
 * DOM, so widgets appear only where a component asked for one.
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loader ??= new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');

    // A budget, for the same reason lib/telegram gives its SDK one.
    //
    // A blocked origin fires `error` and a 500 fires `error`, but a
    // BLACK-HOLED one — a corporate proxy or national filter that drops the
    // packets rather than refusing them — fires neither. Without a timeout
    // this promise simply never settles: `failed` never flips, the "security
    // check could not load" message never renders, and the Register button
    // stays disabled forever beside an empty box with nothing explaining why.
    //
    // That path became reachable the moment Turnstile was made mandatory in
    // production, and the /mobile/captcha page the Android WebView loads uses
    // this same loader, so the native sign-up flow inherits the hang too.
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };
    const timer = window.setTimeout(() => {
      finish(() => {
        // Retryable, like the error path: a slow network on one attempt must
        // not poison the form for the rest of the session.
        loader = null;
        reject(new Error('Turnstile script timed out'));
      });
    }, SCRIPT_TIMEOUT_MS);

    const onLoad = () =>
      finish(() => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error('Turnstile loaded without exposing its API'));
      });
    const onError = () =>
      finish(() => {
        // Allow a later attempt: a blocked or flaky first load should not
        // permanently poison the form for the rest of the session.
        loader = null;
        reject(new Error('Turnstile script failed to load'));
      });
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      // Matches lib/telegram's SDK tag. This is not integrity protection — it
      // only makes the fetch CORS-mode, which is what lets window.onerror see
      // a real error instead of an opaque "Script error." if Cloudflare 500s
      // or the origin is blocked. (No SRI hash here on purpose: the URL is an
      // unversioned rolling CDN path the vendor updates in place, so a pinned
      // hash would break the challenge on their next push.)
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }
  });
  return loader;
}

/** Test hook: drop both memoised promises so a fresh lookup/injection happens. */
export function resetTurnstileForTests(): void {
  configPromise = null;
  loader = null;
}
