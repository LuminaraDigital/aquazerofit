/**
 * Central runtime configuration (AQF-09 platform module).
 * Values resolve from environment with safe development defaults.
 * Getters are used so tests can override env (e.g. AZF_DATA_DIR) per process
 * without stale module-level snapshots.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BELT_TIERS, resolveSupportEmail, type BeltTier } from '@aquazerofit/shared';
import { anyProviderConfigured } from '../modules/ai/providerChain';
// Imports config back; bootGuards.ts says why that cycle is safe.
import { assertProductionSecrets } from './bootGuards';

const here = path.dirname(fileURLToPath(import.meta.url));
/** apps/api/.data by default, regardless of process cwd. */
const defaultDataDir = path.resolve(here, '..', '..', '.data');

/** Positive integer, or `fallback` when the value is missing or not usable. */
function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

/**
 * Zero or a positive integer. Zero is a real setting (a cap that is off),
 * so only a missing or unparseable value uses `fallback`.
 */
export function readNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return n;
}

/**
 * Environment variable declaring how many instances of this API will run.
 *
 * Named as a constant because it appears in three places that must not drift:
 * the config getter, the boot guard's error message, and the documentation
 * (docker-compose.yml, docs/OPERATIONS.md).
 */
export const INSTANCE_COUNT_ENV = 'AZF_INSTANCE_COUNT';

export const config = {
  get port(): number {
    return Number(process.env.PORT ?? 4000);
  },

  basePath: '/api/v1' as const,

  /**
   * Build identity surfaced by /health and /ready. CI stamps the image with
   * the commit SHA so a probe response identifies exactly what is running.
   */
  get version(): string {
    return process.env.APP_VERSION?.trim() || '1.0.0-dev';
  },

  /**
   * Built SPA directory, served by the API when present.
   *
   * Single-origin hosting (one deployment, one domain) is the simplest
   * production shape: no CORS, no split origins, one certificate. In dev the
   * directory does not exist and Vite serves the app on :5173 instead, so this
   * resolves to a path that simply is not there and static serving is skipped.
   *
   * SERVE_WEB=false force-disables it for an API-only deployment.
   */
  get webDistDir(): string {
    const override = process.env.WEB_DIST_DIR?.trim();
    if (override) return path.resolve(override);
    // apps/api/src/platform -> apps/api -> apps -> apps/web/dist
    return path.resolve(here, '..', '..', '..', 'web', 'dist');
  },

  get serveWeb(): boolean {
    return process.env.SERVE_WEB?.trim().toLowerCase() !== 'false';
  },

  get corsOrigins(): string[] {
    const env = process.env.CORS_ORIGINS;
    if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
    return ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4000'];
  },

  /**
   * Number of proxy hops to trust for `req.ip` / X-Forwarded-For.
   *
   * Rate limiting does not use `req.ip`. It trusts CF-Connecting-IP only when
   * the Worker shared secret matches, and otherwise uses the socket address
   * (see platform/clientIp.ts). `req.ip` is still what audit logs and the
   * rest of the request see. Defaults to 1 in production (trust exactly the
   * immediate hop, so clients cannot spoof X-Forwarded-For) and 0 in dev,
   * where there is no proxy.
   */
  get trustProxy(): number {
    const raw = process.env.TRUST_PROXY?.trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 0) return n;
    }
    return isProduction() ? 1 : 0;
  },

  /**
   * Shared secret the Cloudflare Worker sends as `X-Origin-Shared-Secret`
   * on requests it proxies to Cloud Run.
   *
   * Empty unless ORIGIN_SHARED_SECRET is set. An empty value never matches,
   * so CF-Connecting-IP is ignored and rate limits fall back to the socket
   * address. The value is not a default and is never committed.
   */
  get originSharedSecret(): string {
    return process.env.ORIGIN_SHARED_SECRET?.trim() ?? '';
  },

  /**
   * The value ORIGIN_SHARED_SECRET held before a rotation, accepted beside it
   * until the Worker sends the new one.
   *
   * The two sides cannot change at the same instant, and with the gate on
   * every request in between would be refused. The other escape, turning the
   * gate off for the rotation, reopens run.app at exactly the moment a leak
   * made rotating urgent. Empty, the default and the resting state, accepts
   * nothing extra. Set it only for the overlap in docs/OPERATIONS.md and
   * remove it once the Worker is switched: while it is set, the old value
   * still opens the origin.
   */
  get originSharedSecretPrevious(): string {
    return process.env.ORIGIN_SHARED_SECRET_PREVIOUS?.trim() ?? '';
  },

  /**
   * Refuse with 403 every request that does not carry the Worker's
   * ORIGIN_SHARED_SECRET (requireWorkerOrigin in platform/clientIp.ts).
   *
   * Cloud Run ingress cannot be narrowed to one Cloudflare Worker, so the
   * *.run.app URL answers anyone who finds it, and a caller there skips
   * everything the edge does. Only this process can say no. /health and
   * /ready stay open: Cloud Run's probes and uptime checks dial the origin
   * directly and cannot present the secret.
   *
   * OFF by default, and that default is the rollout order rather than a
   * weakening. Switched on before both sides hold the same secret, or while a
   * provider webhook (Telegram, Stripe, Play RTDN) is still registered on
   * run.app instead of the public host, it refuses real users and real
   * payments. None of those providers can add a custom header, so a webhook
   * aimed at run.app can never pass. docs/OPERATIONS.md has the sequence. On
   * with no secret, or a value that is neither on nor off, is refused at boot
   * (assertOriginSecretConfigured in bootGuards.ts).
   */
  get requireOriginSecret(): boolean {
    return originGateSetting() === 'on';
  },

  /**
   * Auth-lane requests per minute for one client IP.
   *
   * 60 is one request a second. A Mini App open is a couple of /auth calls,
   * and on a mobile carrier many subscribers share one address, so the old
   * 10/min cap locked real people out of a launch. 60 stays far under the
   * 300/min default lane. Password guessing against one account is still
   * stopped by the per-email lockout (5 failures, then 15 minutes).
   *
   * A missing or non-positive value keeps this default. Zero must not turn
   * the lane off.
   */
  get authRateLimitPerMinute(): number {
    return readPositiveInt(process.env.AUTH_RATE_LIMIT_PER_MINUTE, 60);
  },

  /**
   * New Telegram accounts per client IP per minute.
   *
   * Returning sign-ins are not counted. 5 allows a household or a double-tap
   * on one connection and still stops a script. The old value was 3.
   */
  get telegramSignupPerIpPerMinute(): number {
    return readPositiveInt(process.env.TELEGRAM_SIGNUP_PER_IP_PER_MINUTE, 5);
  },

  /**
   * New Telegram accounts per IPv4 /24 (or IPv6 /64) per rolling day.
   *
   * 5/day made a carrier NAT, which puts unrelated people in one /24, fail
   * closed after a handful of sign-ups. 2000/day is still a ceiling on a
   * hostile subnet (about one new account a minute, sustained, across the
   * whole block) and leaves room for a launch on shared mobile address space.
   */
  get telegramSignupSubnetDaily(): number {
    return readPositiveInt(process.env.TELEGRAM_SIGNUP_SUBNET_DAILY, 2000);
  },

  /**
   * New Telegram accounts per process per rolling day.
   *
   * 0, the default, disables the ceiling. The old cap was 100/day, which a
   * real launch exceeds, and the counter lives in this process, so it was
   * never a true global limit once more than one instance is running. Set
   * TELEGRAM_SIGNUP_GLOBAL_DAILY to a positive integer to turn a per-instance
   * circuit breaker back on.
   */
  get telegramSignupGlobalDaily(): number {
    return readNonNegativeInt(process.env.TELEGRAM_SIGNUP_GLOBAL_DAILY, 0);
  },

  /**
   * Refuse plaintext http and redirect it to https (see platform/https.ts).
   *
   * On by default in production, where TLS always terminates at an ingress in
   * front of this process. FORCE_HTTPS=false is the escape hatch for the one
   * shape where plaintext is correct: a sidecar that has already terminated
   * TLS and talks to this container over a private network, where a redirect
   * to https would point at an origin that does not listen.
   */
  get forceHttps(): boolean {
    const raw = process.env.FORCE_HTTPS?.trim().toLowerCase();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return isProduction();
  },

  /**
   * Where meal photographs are written while a vision job is in flight, and
   * where food-photo-samples keeps those retained under foodPhotoTraining.
   *
   * Defaults to apps/api/uploads. On a host whose filesystem is ephemeral -
   * many managed hosts reset it on every deploy - point UPLOADS_DIR at a mounted
   * persistent volume, or in-flight photos vanish on redeploy. The blast
   * radius is deliberately small (the sweep deletes them within 24 hours
   * anyway and a missing file is tolerated everywhere it is read), but a lost
   * photo is a failed analysis the user has to repeat. Retained samples have no
   * such margin: without a volume, a redeploy destroys them.
   */
  get uploadsDir(): string {
    const override = process.env.UPLOADS_DIR?.trim();
    if (override) return path.resolve(override);
    // apps/api/src/platform -> apps/api -> apps/api/uploads
    return path.resolve(here, '..', '..', 'uploads');
  },

  /** Local JSON persistence root; AZF_DATA_DIR overrides (used by tests). */
  get dataDir(): string {
    // Empty/whitespace AZF_DATA_DIR must fall through to the default:
    // `?? ` alone kept '' and path.resolve('') resolved to process.cwd(),
    // silently splitting the store across two directories.
    const override = process.env.AZF_DATA_DIR?.trim();
    return path.resolve(override || defaultDataDir);
  },

  // JWT secret: env in production (enforced at startup by
  // assertProductionSecrets in bootGuards.ts), deterministic dev constant
  // otherwise. Refresh tokens are opaque randoms and need no signing secret.
  get jwtAccessSecret(): string {
    if (isProduction() && !process.env.JWT_ACCESS_SECRET) {
      throw new Error('JWT_ACCESS_SECRET must be set in production');
    }
    return process.env.JWT_ACCESS_SECRET ?? 'aquazerofit-dev-access-secret';
  },

  /** Access token lifetime (AQF-07 §1: short lived). */
  accessTtlSeconds: 15 * 60,
  /** Refresh token lifetime. */
  refreshTtlDays: 30,

  /** Telegram bot token; dev default supports offline HMAC test vectors (AQF-09 §2.1). */
  get telegramBotToken(): string {
    if (isProduction() && !process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN must be set in production');
    }
    return process.env.TELEGRAM_BOT_TOKEN ?? 'dev-bot-token';
  },

  /**
   * Shared secret echoed by Telegram in `X-Telegram-Bot-Api-Secret-Token` on
   * every webhook delivery (set with the `secret_token` parameter of
   * setWebhook). The webhook URL is otherwise a public, unauthenticated
   * endpoint that grants coach entitlements - without this, anyone who guesses
   * the path can mint a `successful_payment` and take the paid roster for
   * free. Empty means the webhook refuses every request rather than trusting
   * them all, which is the correct default for an endpoint that moves money.
   */
  get telegramWebhookSecret(): string {
    return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
  },

  /**
   * Whole Stars charged for one 30-day Premium period inside the Mini App.
   *
   * There is no default. Unset, empty, zero, or anything that is not a
   * positive safe integer means the plan page stays on "not available" and
   * the invoice route does not call Telegram. Telegram rejects a price it
   * will not sell; this process does not invent a cap or a fallback amount.
   */
  get telegramStarsPremiumPrice(): number | null {
    const raw = process.env.TELEGRAM_STARS_PREMIUM_PRICE?.trim() ?? '';
    if (!/^[1-9]\d*$/.test(raw)) return null;
    const price = Number(raw);
    if (!Number.isSafeInteger(price) || price <= 0) return null;
    return price;
  },

  /**
   * Cloudflare Turnstile secret, used server-side to verify a solved token.
   * Unset disables the check entirely, which is what dev, the test suite and
   * the keyless offline demo need.
   */
  get turnstileSecretKey(): string {
    return process.env.TURNSTILE_SECRET_KEY?.trim() ?? '';
  },

  /**
   * Turnstile site key. Public by design - it is handed to any caller of
   * GET /auth/captcha.
   *
   * Served at runtime rather than baked into the web bundle as a VITE_ var on
   * purpose: a build-time key is missed silently (the widget just never
   * renders) and cannot be rotated without a rebuild, and on a host where the
   * build and the runtime are separate steps that is a trap rather than a
   * theoretical risk.
   */
  get turnstileSiteKey(): string {
    return process.env.TURNSTILE_SITE_KEY?.trim() ?? '';
  },

  /**
   * True only when BOTH keys are present.
   *
   * Requiring both is what stops the worst configuration: a secret with no
   * site key would have the server demand a token that the client - told
   * `enabled: false` - never renders a widget to produce, locking every real
   * person out of registration while looking correctly configured.
   */
  get botProtectionEnabled(): boolean {
    return this.turnstileSecretKey !== '' && this.turnstileSiteKey !== '';
  },

  /**
   * Interim escape hatch for the native Android client, which cannot render a
   * Turnstile widget: with this set, a request announcing itself as
   * `X-Client: android` and carrying no captcha token is let through.
   *
   * Read what that actually is before enabling it. `X-Client` is a header any
   * caller can type, so this is not "trust the app" - it is a GLOBAL bypass of
   * the registration and password-reset challenge, available to anyone who
   * sends four bytes. It exists for closed testing, where the tester count is
   * known and the alternative is no Android signup at all.
   *
   * Therefore it is boot-fatal in production (assertProductionSecrets in
   * bootGuards.ts), not merely discouraged. The durable answer is the Play
   * Integrity path, seamed in at platform/botProtection.ts.
   */
  get authAllowCaptchalessMobile(): boolean {
    const raw = process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE?.trim().toLowerCase();
    return raw === 'true' || raw === '1';
  },

  /**
   * Play Integrity verification of the Android client's attestation token.
   * Off until BOTH the flag and the package name are set - a verdict checked
   * against the wrong package is not a check.
   */
  get playIntegrityEnabled(): boolean {
    const raw = process.env.PLAY_INTEGRITY_ENABLED?.trim().toLowerCase();
    return (raw === 'true' || raw === '1') && this.playIntegrityPackageName !== '';
  },

  /** Application id the integrity verdict must name, e.g. fit.aquazero.app. */
  get playIntegrityPackageName(): string {
    return process.env.PLAY_INTEGRITY_PACKAGE_NAME?.trim() ?? '';
  },

  /**
   * How long one successful MFA step-up keeps the admin router open, in
   * seconds. Default 600 (10 minutes).
   *
   * The number is bounded from both sides. Too short and an admin re-types a
   * code between every request, which ends with the code taped to the monitor;
   * too long and the step-up stops being a step-up. Ten minutes covers a
   * realistic support task (list accounts, look one up, edit a record) in one
   * prompt while staying inside the 15-minute access-token lifetime - the
   * grant is bound to the presenting access token (see modules/mfa/service),
   * so it can never outlive that token anyway, and this only shortens it.
   *
   * A non-positive or unparseable value falls back to the default rather than
   * being honoured: "0" would silently mean "re-prompt on every request" for
   * anyone who meant to disable the feature, and the way to disable it is to
   * not enrol, not to zero the window.
   */
  get mfaStepUpTtlSeconds(): number {
    const raw = process.env.MFA_STEP_UP_TTL_SECONDS?.trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return 600;
  },

  /**
   * Require every administrator to hold a confirmed second factor.
   *
   * OFF by default, and that default is the migration story rather than a
   * weakening: an existing deployment whose admin has no authenticator
   * enrolled must not be locked out of its own running system by a deploy.
   * While it is off, an admin WITH MFA enrolled is still gated on a fresh
   * step-up (enrolment is self-enforcing the moment it is confirmed), and an
   * admin WITHOUT MFA is let through only after the bypass is written to the
   * audit container and to stdout on every single request. Nothing is silent.
   *
   * The intended sequence is: deploy -> every admin enrols -> set
   * MFA_REQUIRE_ADMIN=true, after which an unenrolled admin is refused
   * outright. Until that flip, the residual risk is a password-only admin
   * session, which is exactly the risk that existed before this feature.
   *
   * That sequence is a migration window, not a resting state, so production
   * refuses to boot until the flip has happened (assertProductionSecrets in
   * bootGuards.ts). The off-by-default only buys an existing deployment the one
   * enrolment pass; leaving it off is a decision nobody makes on purpose.
   */
  get mfaRequireAdmin(): boolean {
    const raw = process.env.MFA_REQUIRE_ADMIN?.trim().toLowerCase();
    return raw === 'true' || raw === '1';
  },

  get isTest(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  },

  /** Anything that is not production (dev + test): enables dev-only conveniences. */
  get isDev(): boolean {
    return !isProduction();
  },

  /**
   * Echo password-reset tokens in API responses and server logs. Requires
   * isDev AND this flag - staging (NODE_ENV=production) must never leak tokens
   * even when operators forget to unset dev conveniences.
   */
  get exposeDevTokens(): boolean {
    return process.env.EXPOSE_DEV_TOKENS?.trim().toLowerCase() === 'true';
  },

  get isProduction(): boolean {
    return isProduction();
  },

  /** Account deletion grace period (AQF-06 §6 lifecycle). */
  deletionGraceDays: 30,

  /**
   * How often expired Idempotency-Key replay records are pruned from the
   * `logs` container (see modules/logs/service.sweepIdempotencyRecords).
   *
   * Six hours by default, matching the other periodic sweeps in index.ts. The
   * records carry a 24h TTL, so this is four passes per lifetime - frequent
   * enough that the backlog stays small, rare enough that the sweep's full
   * container scan is nowhere near a request path.
   *
   * A value below one minute is ignored rather than honoured: the plausible
   * way to get one is a unit mix-up (someone writing seconds), and the failure
   * mode of believing it is a scan of the whole container every few
   * milliseconds. Falling back to the default is the safe reading.
   */
  /**
   * Deployment-wide ceiling on model tokens per UTC day. 0 or unset = no
   * ceiling, which is the default and must stay the default: a deployment that
   * has not opted in must never start serving degraded output because a
   * setting it never chose had an opinion.
   *
   * Set it with headroom. `platform/aiBudget.ts` counts what providers report,
   * and a call that dies mid-generation spends tokens nobody reports - so the
   * figure this compares against is a floor on real spend, not a meter.
   *
   * A negative or unparseable value falls back to "no ceiling" rather than
   * throwing: the budget is a cost guard, and a guard that stops the app from
   * booting has caused a worse outage than the bill it was preventing.
   */
  /**
   * Google Play service-account JSON, verbatim, for verifying purchases.
   *
   * Absent means this deployment cannot take Play payments, and the billing
   * routes then answer PAYMENT_UNAVAILABLE rather than granting anything. That
   * asymmetry is the point: a missing credential must cost a sale, never give
   * one away.
   */
  get playServiceAccountJson(): string {
    return process.env.PLAY_SERVICE_ACCOUNT_JSON?.trim() ?? '';
  },

  /** Android applicationId the purchases belong to, e.g. fit.aquazero.app. */
  get playPackageName(): string {
    return process.env.PLAY_PACKAGE_NAME?.trim() ?? '';
  },

  /**
   * Shared secret Google Pub/Sub echoes on every RTDN delivery. Same fail-closed
   * posture as TELEGRAM_WEBHOOK_SECRET: unset means the webhook trusts nobody,
   * because an unauthenticated route that grants entitlements is a free
   * subscription for anyone who finds the URL.
   */
  get playRtdnSecret(): string {
    return process.env.PLAY_RTDN_SECRET?.trim() ?? '';
  },

  /**
   * Stripe secret key. Test-mode (`sk_test_`) on staging, live on production,
   * never the same set on both. Absent, or without STRIPE_PRICE_ID, means no
   * Stripe checkout is offered - same asymmetry as the Play credentials.
   */
  get stripeSecretKey(): string {
    return process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  },

  /** The recurring Price premium is sold at. Its amount is read from Stripe. */
  get stripePriceId(): string {
    return process.env.STRIPE_PRICE_ID?.trim() ?? '';
  },

  /**
   * Signing secret (`whsec_`) of the webhook endpoint. Unset means the webhook
   * trusts nobody: it is an unauthenticated route that grants subscriptions.
   */
  get stripeWebhookSecret(): string {
    return process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? '';
  },

  get dailyTokenBudget(): number {
    const raw = process.env.AZF_DAILY_TOKEN_BUDGET?.trim();
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  },

  get idempotencySweepIntervalMs(): number {
    const raw = process.env.IDEMPOTENCY_SWEEP_INTERVAL_MS?.trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 60_000) return n;
    }
    return 6 * 3600 * 1000;
  },

  /**
   * How many instances of this API the operator intends to run concurrently.
   *
   * Declared, not detected: none of the deploy surfaces expresses an instance
   * count this process can read. A managed PaaS host's deploy manifest can pin
   * it to a single machine, but the autoscale limits live in the host's UI,
   * not in the file; docker-compose has no `replicas` and is scaled with
   * `docker compose up --scale api=N` on the command line; the Dockerfile
   * cannot know. So the count is an explicit declaration by whoever configures
   * the deployment, and assertSingleInstance() in bootGuards.ts refuses to
   * boot on anything but 1.
   *
   * NaN means AZF_INSTANCE_COUNT was set to something that is not a positive
   * integer. That is not treated as "probably one" - a guard that cannot read
   * its own input has not verified anything, so it refuses.
   *
   * Unset reads as 1, which the guard accepts everywhere except Cloud Run.
   */
  get instanceCount(): number {
    const raw = process.env[INSTANCE_COUNT_ENV]?.trim();
    if (!raw) return 1;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 ? n : Number.NaN;
  },

  /**
   * Public origin of the running app, used to build links inside outbound
   * mail. Falls back to the Vite dev server so reset links work locally.
   */
  get appPublicUrl(): string {
    const raw = process.env.APP_PUBLIC_URL?.trim();
    return (raw || 'http://localhost:5173').replace(/\/+$/, '');
  },

  /**
   * Mailbox named on the legal pages and in /paysupport. The rule lives in
   * resolveSupportEmail: a blank value falls through to info@luminara.digital.
   */
  get supportEmail(): string {
    return resolveSupportEmail(process.env.SUPPORT_EMAIL);
  },

  /**
   * HTTPS URL the /start button opens as a Mini App. Falls back to
   * appPublicUrl when TELEGRAM_MINI_APP_URL is unset or not https.
   * The trailing slash is preserved: BotFather matches the URL exactly.
   */
  get telegramMiniAppUrl(): string {
    return httpUrl(process.env.TELEGRAM_MINI_APP_URL, this.appPublicUrl, true);
  },

  /** /terms links. Each falls back to a page on the public origin. */
  get termsUrl(): string {
    return httpUrl(process.env.TERMS_URL, publicPath('/terms'));
  },

  get privacyUrl(): string {
    return httpUrl(process.env.PRIVACY_URL, publicPath('/privacy'));
  },

  get refundUrl(): string {
    return httpUrl(process.env.REFUND_URL, publicPath('/refund'));
  },

  get accountDeletionUrl(): string {
    return httpUrl(process.env.ACCOUNT_DELETION_URL, publicPath('/account/deletion'));
  },

  /**
   * Envelope sender for outbound mail. Must be a domain verified with the mail
   * provider or every message is silently dropped by the provider.
   */
  get mailFrom(): string {
    return process.env.MAIL_FROM?.trim() || 'AquaZeroFit <no-reply@localhost>';
  },

  /**
   * Optional LLM second stage for input guardrails (P-09 safetyCheap lane).
   * Defaults ON when any AI provider is configured (a key, or OLLAMA_BASE_URL
   * for a self-hosted Ollama), OFF otherwise so offline demo mode stays
   * regex-only with zero extra latency. "Configured" is the gateway's own
   * answer (anyProviderConfigured), so this cannot disagree with whether the
   * safety lane would reach a model. Set ENABLE_LLM_SAFETY=true|false to
   * override explicitly.
   */
  get enableLlmSafety(): boolean {
    const override = process.env.ENABLE_LLM_SAFETY?.trim().toLowerCase();
    if (override === 'true' || override === '1') return true;
    if (override === 'false' || override === '0') return false;
    return anyProviderConfigured();
  },

  /**
   * When true, derived targets incorporate adaptive expenditure from logged
   * weight and food once at least seven qualifying days exist.
   */
  get adaptiveTargets(): boolean {
    const raw = process.env.ADAPTIVE_TARGETS?.trim().toLowerCase();
    return raw === 'true' || raw === '1';
  },

  /**
   * Fight Record master switch (AZF-W3-05 §4.5). Off unless set, because the
   * feature ships dark and is released only after the Phase 0 exit. Turning it
   * back off is also the kill switch: every surface disappears and no award is
   * written, while the awards people already hold are kept for when it returns.
   */
  get fightRecordEnabled(): boolean {
    const raw = process.env.FIGHT_RECORD_ENABLED?.trim().toLowerCase();
    return raw === 'true' || raw === '1';
  },

  /**
   * Share of users inside the Fight Record rollout, 0 to 100, bucketed by a
   * stable hash of the user id so raising it only ever adds people. Unset
   * means 100, so the master switch alone decides. Set but unparseable ("10%",
   * "12.5") means 0: a typo in a rollout control must fail toward fewer
   * people, never toward everyone.
   */
  get fightRecordRolloutPercent(): number {
    const raw = process.env.FIGHT_RECORD_ROLLOUT_PERCENT;
    return Math.min(100, readNonNegativeInt(raw, raw?.trim() ? 0 : 100));
  },

  /**
   * Belt tier → Telegram custom emoji id, as JSON (printed by
   * tools/belts/create-emoji-set.mjs). Null unless every tier has a non-empty
   * id: a partial set would leave someone's status blank at exactly the moment
   * they earned a belt, so the emoji status is offered all-or-nothing.
   */
  get telegramBeltEmojiIds(): Record<BeltTier, string> | null {
    const raw = process.env.TELEGRAM_BELT_EMOJI_IDS?.trim();
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (parsed === null || typeof parsed !== 'object') return null;
    const ids = {} as Record<BeltTier, string>;
    for (const tier of BELT_TIERS) {
      const id = (parsed as Record<string, unknown>)[tier];
      if (typeof id !== 'string' || id.trim() === '') return null;
      ids[tier] = id.trim();
    }
    return ids;
  },
};

function publicPath(path: string): string {
  const base = config.appPublicUrl.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * An absolute http(s) URL from the environment, or `fallback`.
 * `httpsOnly` is for the Mini App button, which Telegram rejects otherwise.
 * Fragments are allowed so an override can point at a heading.
 */
function httpUrl(raw: string | undefined, fallback: string, httpsOnly = false): string {
  const value = raw?.trim() ?? '';
  const scheme = httpsOnly ? 'https:' : 'https?:';
  if (value.length > 0 && value.length <= 2048 && new RegExp(`^${scheme}\\/\\/\\S+$`, 'i').test(value)) {
    return value;
  }
  return fallback;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** REQUIRE_ORIGIN_SECRET as written: on, off, or a value that is neither. */
export function originGateSetting(): 'on' | 'off' | 'unrecognised' {
  const raw = process.env.REQUIRE_ORIGIN_SECRET?.trim().toLowerCase() ?? '';
  if (raw === 'true' || raw === '1') return 'on';
  if (raw === '' || raw === 'false' || raw === '0') return 'off';
  return 'unrecognised';
}

// Startup guard: importing config in a production process without real secrets
// must crash immediately (dev fallbacks are dev-only). This covers every
// entrypoint - the API server, the seed script, the importers - not just
// index.ts, which also calls it explicitly.
//
// Skipped under test: the suite exercises production combinations by mutating
// the environment, and a throw at *module load* would take down the whole
// worker rather than failing one assertion. The function itself is tested
// directly in __tests__/productionGuards.test.ts.
if (!config.isTest) assertProductionSecrets();
