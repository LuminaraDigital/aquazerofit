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
 *
 * Stripe Checkout is a top-level navigation (window.location.assign to
 * Stripe's hosted page). It is not a script or a connect, so js.stripe.com
 * and api.stripe.com are not listed.
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
] as const;

export const FRAME_ANCESTORS = ["'self'", 'https://web.telegram.org', 'https://*.telegram.org'] as const;

function directive(name: string, sources: readonly string[]): string {
  return `${name} ${sources.join(' ')}`;
}

export function contentSecurityPolicy(): string {
  return [
    directive('default-src', ["'self'"]),
    directive('script-src', SCRIPT_SRC),
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
    directive('media-src', ["'self'", 'blob:']),
    directive('frame-ancestors', FRAME_ANCESTORS),
    directive('object-src', ["'none'"]),
    directive('base-uri', ["'self'"]),
    directive('form-action', ["'self'"]),
  ].join('; ');
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': contentSecurityPolicy(),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/** Copy a SPA asset response and attach the edge security headers. */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.delete('X-Frame-Options');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
