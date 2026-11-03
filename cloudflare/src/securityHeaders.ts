/**
 * Security headers for SPA responses served by the Worker.
 *
 * X-Frame-Options is intentionally absent. Telegram opens the Mini App in an
 * iframe on web.telegram.org, and X-Frame-Options cannot express that
 * allowlist. frame-ancestors can. A DENY or SAMEORIGIN header would win in
 * browsers that honour both and the Mini App would not load.
 *
 * Script and connect sources are the hosts the client actually requests:
 * - telegram.org/js/telegram-web-app.js, loaded only for a Mini App launch
 * - challenges.cloudflare.com, the Turnstile widget on register and reset
 * - Firebase Auth and Analytics, when the web build has Firebase enabled.
 *   The SDK is bundled, so its script is 'self'. It then calls Identity
 *   Toolkit, Secure Token, Installations, and (for Analytics) gtag.
 *   Email/password auth also loads reCAPTCHA from google.com / gstatic.com
 *   and frames the auth helper on *.firebaseapp.com.
 * - The API. Production calls same-origin /api ('self'). API_ORIGIN is the
 *   Cloud Run host the Worker proxies, included so a build that points
 *   VITE_API_BASE_URL at that host is not blocked.
 * - challenges.cloudflare.com on connect-src as well as script-src and
 *   frame-src. Turnstile's api.js then fetches the challenge from that host.
 * - tganalytics.xyz, where Telegram Mini Apps Analytics posts catalog
 *   events. The client calls it only inside a Mini App with both Vite
 *   catalog env vars set. CSP cannot vary per launch.
 *
 * Stripe Checkout and the return from it are top-level navigations
 * (window.location.assign to Stripe's hosted page, then back to /plan).
 * The client never loads js.stripe.com or api.stripe.com, and there is no
 * billing-portal call in this app. form-action stays 'self'; that directive
 * does not apply to location.assign.
 *
 * WebGL (the landing orb and the signed-in aurora) compiles GLSL from
 * strings on the main thread. It does not fetch a shader, start a Worker,
 * or use a blob: worker. worker-src is therefore 'none'.
 *
 * Marketing HTML includes one inline application/ld+json block. That is a
 * script to CSP, so each HTML response gets its own nonce, stamped onto
 * that tag and onto script-src. Host allowlists stay, so Telegram, Turnstile,
 * and gtag still load. 'unsafe-inline' is not used for scripts: a nonce
 * would ignore it anyway, and it would allow injected inline scripts.
 * 'unsafe-eval' is not used either. In the browser, shared schemas set Zod
 * to jitless (packages/shared/src/schemas.ts) so parsing does not call Function.
 */
import { API_ORIGIN } from './proxy.ts';

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

export const SCRIPT_SRC = [
  "'self'",
  'https://telegram.org',
  'https://*.telegram.org',
  TURNSTILE_ORIGIN,
  'https://www.googletagmanager.com',
  'https://www.google-analytics.com',
  'https://www.gstatic.com',
  'https://www.google.com',
  'https://apis.google.com',
] as const;

export const CONNECT_SRC = [
  "'self'",
  API_ORIGIN,
  TURNSTILE_ORIGIN,
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://firebaseinstallations.googleapis.com',
  'https://firebase.googleapis.com',
  'https://www.googleapis.com',
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
  'https://www.googletagmanager.com',
  'https://*.googletagmanager.com',
  'https://www.google.com',
  'https://www.gstatic.com',
  'https://tganalytics.xyz',
] as const;

/** Main-thread WebGL only. No dedicated worker and no blob: worker. */
export const WORKER_SRC = ["'none'"] as const;

const LD_JSON_OPEN = '<script type="application/ld+json">';

export const FRAME_ANCESTORS = ["'self'", 'https://web.telegram.org', 'https://*.telegram.org'] as const;

function directive(name: string, sources: readonly string[]): string {
  return `${name} ${sources.join(' ')}`;
}

export function contentSecurityPolicy(scriptNonce?: string): string {
  const scripts = scriptNonce ? [`'nonce-${scriptNonce}'`, ...SCRIPT_SRC] : SCRIPT_SRC;
  return [
    directive('default-src', ["'self'"]),
    directive('script-src', scripts),
    directive('style-src', ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']),
    directive('font-src', ["'self'", 'https://fonts.gstatic.com', 'data:']),
    directive('img-src', ["'self'", 'data:', 'blob:', 'https:']),
    directive('frame-src', [
      "'self'",
      TURNSTILE_ORIGIN,
      'https://*.firebaseapp.com',
      'https://accounts.google.com',
      'https://www.google.com',
    ]),
    directive('connect-src', CONNECT_SRC),
    directive('worker-src', WORKER_SRC),
    directive('media-src', ["'self'", 'blob:']),
    directive('frame-ancestors', FRAME_ANCESTORS),
    directive('object-src', ["'none'"]),
    directive('base-uri', ["'self'"]),
    directive('form-action', ["'self'"]),
  ].join('; ');
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function withoutLength(response: Response): ResponseInit {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return { status: response.status, statusText: response.statusText, headers };
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': contentSecurityPolicy(),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/** Copy a SPA asset response and attach the edge security headers. */
export function withSecurityHeaders(response: Response, scriptNonce?: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (name === 'Content-Security-Policy') continue;
    headers.set(name, value);
  }
  headers.set('Content-Security-Policy', contentSecurityPolicy(scriptNonce));
  headers.delete('content-length');
  headers.delete('X-Frame-Options');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * HTML responses that carry inline JSON-LD get a per-response script nonce.
 * Other asset responses get the static policy.
 */
export async function secureSpaResponse(response: Response): Promise<Response> {
  const type = response.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('text/html')) return withSecurityHeaders(response);
  const html = await response.text();
  if (!html.includes(LD_JSON_OPEN)) {
    return withSecurityHeaders(new Response(html, withoutLength(response)));
  }
  const nonce = randomNonce();
  const stamped = html.replaceAll(
    LD_JSON_OPEN,
    `<script type="application/ld+json" nonce="${nonce}">`,
  );
  return withSecurityHeaders(new Response(stamped, withoutLength(response)), nonce);
}
