/**
 * Bot protection for the unauthenticated write surfaces (AQF-07 §4).
 *
 * The rate limiter already caps how fast one address can hammer /auth, but a
 * limiter is a speed control, not an identity control: a botnet with a
 * thousand addresses stays under ten attempts per minute each and still
 * registers a thousand accounts an hour. Registration and password-reset
 * request are the two routes where that matters — the first mints accounts and
 * AI credits, the second sends mail on someone else's behalf and is therefore
 * a free spam relay pointed at real inboxes. Sign-in is deliberately NOT
 * challenged: the per-email lockout and the per-IP auth lane already cover it,
 * and a challenge on every return visit is friction paid by real users on the
 * path they walk most.
 *
 * Cloudflare Turnstile is the check: the client solves a challenge, receives a
 * single-use token, and this module asks Cloudflare whether that token is
 * genuine, unspent, and issued for this site.
 *
 * ---------------------------------------------------------------------------
 * WIRE CONTRACT — matches the deployment at aquazerofit.com. Do not "improve"
 * either half without changing the other; the client and server here are
 * shipped separately and a mismatch fails silently (an unchallenged form) or
 * loudly (a form nobody can submit).
 *
 *   GET  /api/v1/auth/captcha  -> { enabled: false } | { enabled: true, siteKey }
 *   POST /api/v1/auth/register              body carries `captchaToken`
 *   POST /api/v1/auth/password-reset/request  likewise
 *
 * Rejections are VALIDATION_FAILED with details.fieldErrors.captchaToken, so a
 * client can tell a challenge problem from a field problem by looking for that
 * key — the same way the live web client does.
 *
 * The token travels in the BODY, not a header. The auth request schemas are a
 * frozen contract that strips unknown keys, so it is read straight off
 * req.body before parsing rather than being threaded through zod.
 * ---------------------------------------------------------------------------
 *
 * Disabled when TURNSTILE_SECRET_KEY is unset, which keeps development, the
 * test suite and the offline demo working with no third-party dependency and
 * no network egress. PRODUCTION is different: assertProductionSecrets (see
 * platform/config.ts) refuses to boot without both keys, because "disabled"
 * here means assertHuman returns immediately and the account-creation surface
 * ships with no challenge on it at all — a state indistinguishable, from the
 * outside and from the logs, from one where the check is working. The warning
 * below therefore covers the non-production cases and the half-configured pair
 * that never reaches the boot guard.
 */
import type { Request } from 'express';
import { config } from './config';
import { AppError } from './errors';
import { logEvent } from './telemetry';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare's documented response shape; only these fields are consumed. */
interface SiteVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  hostname?: string;
  action?: string;
}

/** Public shape of GET /auth/captcha — the site key is public by design. */
export type CaptchaConfig = { enabled: false } | { enabled: true; siteKey: string };

export function captchaConfig(): CaptchaConfig {
  if (!config.botProtectionEnabled) return { enabled: false };
  return { enabled: true, siteKey: config.turnstileSiteKey };
}

/**
 * Pull the challenge token off the request body.
 *
 * A header carrier (`cf-turnstile-response`) is accepted as a fallback so a
 * non-browser caller has a way through, but the body field is the contract and
 * the one the web client uses.
 */
export function captchaTokenOf(req: Request): string {
  const body = req.body as { captchaToken?: unknown } | undefined;
  if (typeof body?.captchaToken === 'string' && body.captchaToken.trim() !== '') {
    return body.captchaToken.trim();
  }
  const header = req.get('cf-turnstile-response');
  return typeof header === 'string' ? header.trim() : '';
}

// ---------------------------------------------------------------------------
// Native client path
// ---------------------------------------------------------------------------
//
// A Turnstile widget needs a browser to render it, and the Android app has no
// WebView in its signup flow. Two answers live below, and only the second one
// is a real check:
//
//   1. `AUTH_ALLOW_CAPTCHALESS_MOBILE` — an operator flag that waives the
//      challenge for a caller announcing `X-Client: android`. The header is
//      typed, not proven, so this is a global bypass wearing a mobile costume.
//      Boot-fatal in production (platform/config.ts); closed testing only.
//
//   2. Play Integrity — the durable path, seamed in here and OFF until
//      configured. Google signs a verdict about the app, the device and the
//      account; the server decodes it and decides. Until that decode is wired,
//      verifyPlayIntegrity reports `not-configured` and the caller falls
//      through to Turnstile, so adding the seam cannot weaken today's gate.

/** Header the Android client stamps on every request. Advisory, never proof. */
const CLIENT_HEADER = 'x-client';
const ANDROID_CLIENT = 'android';

/** True when the caller claims to be the Android app. Trivially spoofable. */
export function isAndroidClient(req: Request): boolean {
  return req.get(CLIENT_HEADER)?.trim().toLowerCase() === ANDROID_CLIENT;
}

/**
 * Pull the Play Integrity token off the request body, alongside captchaToken.
 * Same carrier as the captcha token and for the same reason: the auth request
 * schemas strip unknown keys, so this is read before parsing.
 */
export function integrityTokenOf(req: Request): string {
  const body = req.body as { integrityToken?: unknown } | undefined;
  return typeof body?.integrityToken === 'string' ? body.integrityToken.trim() : '';
}

export type PlayIntegrityResult =
  | { ok: true; packageName: string }
  | { ok: false; reason: 'not-configured' | 'missing-token' | 'decode-failed' | 'verdict-rejected' };

/**
 * Verify one Play Integrity token.
 *
 * Currently a seam: it reports `not-configured` unless PLAY_INTEGRITY_ENABLED
 * and PLAY_INTEGRITY_PACKAGE_NAME are both set, and even then has no decoder
 * behind it yet. The shape is the one Google's flow produces — decode the
 * token with `androidcheck`/Play Integrity `decodeIntegrityToken`, then assert
 * `appIntegrity.appRecognitionVerdict === 'PLAY_RECOGNIZED'`,
 * `appIntegrity.packageName === config.playIntegrityPackageName` and
 * `deviceIntegrity.deviceRecognitionVerdict` contains `MEETS_DEVICE_INTEGRITY`
 * — so dropping the real call in replaces the body of one function.
 *
 * Every non-ok result is a FALL-THROUGH, not a rejection: the caller then
 * applies the normal Turnstile requirement. An unconfigured or failing
 * integrity check must never be able to make the gate weaker than it is
 * without it.
 */
export async function verifyPlayIntegrity(token: string): Promise<PlayIntegrityResult> {
  if (!config.playIntegrityEnabled) return { ok: false, reason: 'not-configured' };
  if (token === '') return { ok: false, reason: 'missing-token' };

  // TODO(play-integrity): decode `token` with Google's Play Integrity API and
  // assert the app / device verdicts described above. Until then a configured
  // deployment still falls through to Turnstile rather than trusting a token
  // nothing has checked.
  return { ok: false, reason: 'not-configured' };
}

/** Build the rejection in the shape the web client keys on. */
function captchaError(message: string, fieldMessage: string): AppError {
  return new AppError('VALIDATION_FAILED', message, {
    fieldErrors: { captchaToken: fieldMessage },
  });
}

/**
 * Ask Cloudflare to validate one token.
 *
 * Network failures resolve to `false` rather than throwing. That is a
 * deliberate fail-closed stance for this endpoint: an outage at the verifier
 * should turn signups away for a few minutes, not wave every bot through at
 * precisely the moment nobody is watching. The caller renders that as a
 * retryable error, and the user's next attempt succeeds once Cloudflare is
 * back.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const secret = config.turnstileSecretKey;
  if (!secret) return { ok: true };
  if (token === '') return { ok: false, reason: 'missing-input-response' };

  const form = new URLSearchParams({ secret, response: token });
  // Cloudflare treats remoteip as advisory; it is only meaningful when the
  // address is the real client, which is exactly what trust proxy governs.
  if (remoteIp) form.set('remoteip', remoteIp);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return { ok: false, reason: `siteverify-http-${res.status}` };
    const data = (await res.json()) as SiteVerifyResponse;
    if (data.success) return { ok: true };
    return { ok: false, reason: data['error-codes']?.join(',') || 'rejected' };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network-error',
    };
  }
}

/**
 * Route guard: throw unless this request carries a valid, unspent challenge
 * token. A no-op when bot protection is not configured.
 *
 * `action` names the form for the audit line so an operator can tell a signup
 * flood from a reset flood without correlating timestamps against route logs.
 */
export async function assertHuman(req: Request, action: string): Promise<void> {
  if (!config.botProtectionEnabled) return;

  const token = captchaTokenOf(req);

  // Play Integrity first, because it is the only one of the three paths that
  // proves anything. Anything short of a pass falls through to Turnstile.
  const integrityToken = integrityTokenOf(req);
  if (integrityToken !== '') {
    const verdict = await verifyPlayIntegrity(integrityToken);
    if (verdict.ok) {
      logEvent('play_integrity_verified', { action, packageName: verdict.packageName });
      return;
    }
    logEvent('play_integrity_unmet', { action, reason: verdict.reason });
  }

  // Interim closed-testing path. Audited on every use: the flag is a global
  // bypass, so an operator who left it on needs to be able to count what came
  // through it. Only when no captcha token was supplied — a native client that
  // *can* produce one is held to it like anyone else.
  if (token === '' && isAndroidClient(req) && config.authAllowCaptchalessMobile) {
    logEvent('captcha_bypassed_mobile', { action, reason: 'auth-allow-captchaless-mobile' });
    return;
  }

  if (token === '') {
    logEvent('captcha_rejected', { action, reason: 'missing-input-response' });
    throw captchaError(
      'Please complete the verification challenge.',
      'Verification challenge is required.',
    );
  }

  const { ok, reason } = await verifyTurnstileToken(token, req.ip);
  if (ok) return;

  logEvent('captcha_rejected', { action, reason });

  // A verifier outage is not the caller's fault, so the copy tells them to
  // retry rather than implying they are a bot. The envelope stays identical
  // either way — the client only looks for the captchaToken key.
  const transient =
    reason === 'timeout' || reason === 'network-error' || reason?.startsWith('siteverify-http-');
  throw captchaError(
    transient
      ? 'We could not complete the security check. Please try again in a moment.'
      : 'Verification failed. Please try the challenge again.',
    'Verification failed.',
  );
}

/**
 * Startup advisory. Called from index.ts so the warning lands once, at boot,
 * next to every other configuration complaint — rather than being discovered
 * later from a graph of fake accounts.
 */
export function warnIfBotProtectionUnconfigured(): void {
  if (config.botProtectionEnabled) return;

  // Half-configured is worth shouting about in EVERY environment, not just
  // production: it is the one state that looks deliberate and is not. Either
  // key alone means someone got part-way through setup and stopped.
  const half =
    (config.turnstileSecretKey !== '') !== (config.turnstileSiteKey !== '');
  if (half) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        t: new Date().toISOString(),
        kind: 'security',
        event: 'bot_protection_half_configured',
        haveSecret: config.turnstileSecretKey !== '',
        haveSiteKey: config.turnstileSiteKey !== '',
        detail:
          'Turnstile needs BOTH TURNSTILE_SECRET_KEY and TURNSTILE_SITE_KEY. With only one set, ' +
          'bot protection stays OFF rather than locking the registration form.',
      }),
    );
    return;
  }

  if (!config.isProduction) return;
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({
      t: new Date().toISOString(),
      kind: 'security',
      event: 'bot_protection_disabled',
      detail:
        'TURNSTILE_SECRET_KEY / TURNSTILE_SITE_KEY are unset: registration and password-reset ' +
        'request are protected by rate limiting alone.',
    }),
  );
}
