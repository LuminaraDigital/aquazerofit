/**
 * Central runtime configuration (AQF-09 platform module).
 * Values resolve from environment with safe development defaults.
 * Getters are used so tests can override env (e.g. AZF_DATA_DIR) per process
 * without stale module-level snapshots.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** apps/api/.data by default, regardless of process cwd. */
const defaultDataDir = path.resolve(here, '..', '..', '.data');

/**
 * Environment variable declaring how many instances of this API will run.
 *
 * Named as a constant because it appears in three places that must not drift:
 * the config getter, the boot guard's error message, and the documentation
 * (.replit, docker-compose.yml, docs/OPERATIONS.md).
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
   * Single-origin hosting (one Replit deployment, one domain) is the simplest
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
   * Behind an Azure ingress (Container Apps, App Service, Front Door) Express
   * sees the proxy's socket address for every request unless this is set, which
   * collapses every caller into a single rate-limit bucket — the per-IP auth
   * lane then locks out the whole platform after 10 attempts/minute. Defaults
   * to 1 in production (trust exactly the immediate hop, so clients cannot
   * spoof X-Forwarded-For) and 0 in dev, where there is no proxy.
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
   * Where meal photographs are written while a vision job is in flight.
   *
   * Defaults to apps/api/uploads. On a host whose filesystem is ephemeral —
   * Replit resets it on every publish — point UPLOADS_DIR at a mounted
   * persistent volume, or in-flight photos vanish on redeploy. The blast
   * radius is deliberately small (the sweep deletes them within 24 hours
   * anyway and a missing file is tolerated everywhere it is read), but a lost
   * photo is a failed analysis the user has to repeat.
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
  // assertProductionSecrets below), deterministic dev constant otherwise.
  // Refresh tokens are opaque randoms and need no signing secret.
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
   * endpoint that grants coach entitlements — without this, anyone who guesses
   * the path can mint a `successful_payment` and take the paid roster for
   * free. Empty means the webhook refuses every request rather than trusting
   * them all, which is the correct default for an endpoint that moves money.
   */
  get telegramWebhookSecret(): string {
    return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
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
   * Turnstile site key. Public by design — it is handed to any caller of
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
   * site key would have the server demand a token that the client — told
   * `enabled: false` — never renders a widget to produce, locking every real
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
   * caller can type, so this is not "trust the app" — it is a GLOBAL bypass of
   * the registration and password-reset challenge, available to anyone who
   * sends four bytes. It exists for closed testing, where the tester count is
   * known and the alternative is no Android signup at all.
   *
   * Therefore it is boot-fatal in production (assertProductionSecrets below),
   * not merely discouraged. The durable answer is the Play Integrity path,
   * seamed in at platform/botProtection.ts.
   */
  get authAllowCaptchalessMobile(): boolean {
    const raw = process.env.AUTH_ALLOW_CAPTCHALESS_MOBILE?.trim().toLowerCase();
    return raw === 'true' || raw === '1';
  },

  /**
   * Play Integrity verification of the Android client's attestation token.
   * Off until BOTH the flag and the package name are set — a verdict checked
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
   * prompt while staying inside the 15-minute access-token lifetime — the
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
   * refuses to boot until the flip has happened (assertProductionSecrets
   * below). The off-by-default only buys an existing deployment the one
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
   * isDev AND this flag — staging (NODE_ENV=production) must never leak tokens
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
   * records carry a 24h TTL, so this is four passes per lifetime — frequent
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
   * and a call that dies mid-generation spends tokens nobody reports — so the
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
   * count this process can read. `.replit` says `deploymentTarget = "vm"`
   * (Reserved VM, one machine) but Replit's autoscale limits live in its UI,
   * not in the file; docker-compose has no `replicas` and is scaled with
   * `docker compose up --scale api=N` on the command line; the Dockerfile
   * cannot know. So the count is an explicit declaration by whoever configures
   * the deployment, and assertSingleInstance() below refuses to boot on
   * anything but 1.
   *
   * NaN means AZF_INSTANCE_COUNT was set to something that is not a positive
   * integer. That is not treated as "probably one" — a guard that cannot read
   * its own input has not verified anything, so it refuses.
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
   * Envelope sender for outbound mail. Must be a domain verified with the mail
   * provider or every message is silently dropped by the provider.
   */
  get mailFrom(): string {
    return process.env.MAIL_FROM?.trim() || 'AquaZeroFit <no-reply@localhost>';
  },

  /**
   * Optional LLM second stage for input guardrails (P-09 safetyCheap lane).
   * Defaults ON when any real AI provider key is configured, OFF when keyless
   * so offline demo mode stays regex-only with zero extra latency. Set
   * ENABLE_LLM_SAFETY=true|false to override explicitly.
   */
  get enableLlmSafety(): boolean {
    const override = process.env.ENABLE_LLM_SAFETY?.trim().toLowerCase();
    if (override === 'true' || override === '1') return true;
    if (override === 'false' || override === '0') return false;
    return hasAnyAiProviderKey();
  },

  /**
   * When true, derived targets incorporate adaptive expenditure from logged
   * weight and food once at least seven qualifying days exist.
   */
  get adaptiveTargets(): boolean {
    const raw = process.env.ADAPTIVE_TARGETS?.trim().toLowerCase();
    return raw === 'true' || raw === '1';
  },
};

/** True when at least one configured AI provider has a non-empty API key. */
export function hasAnyAiProviderKey(): boolean {
  const keyEnvs = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY'] as const;
  return keyEnvs.some((k) => Boolean(process.env[k]?.trim()));
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Single-instance guard: refuse to boot when the deployment declares more than
 * one concurrent instance of this API.
 *
 * WHY THIS IS FATAL RATHER THAN A WARNING. The document store keeps its whole
 * working set in memory and hydrates it once, at boot (platform/pgStore.ts
 * says so at length). Postgres is a durability mirror, not a source of truth
 * for reads. Two instances therefore hold two independent copies that diverge
 * from the first write: instance A's new meal log is invisible to instance B
 * until B restarts, and because the flush writes whole documents, whichever
 * instance flushes last silently overwrites the other's version of the same
 * row. Nothing errors. Nothing logs. A user's food diary just loses entries,
 * and which entries depends on which instance served which request.
 *
 * That is not a degradation an operator can notice from the outside, which is
 * why it has to be caught here, before the first request, rather than left to
 * a runbook. Refusing to start costs a failed deploy; the alternative costs
 * health data that nobody can reconstruct.
 *
 * THE UNLOCK is the async getStore() refactor: make reads go through to
 * Postgres instead of a per-instance memory copy. It is tracked separately
 * because it touches ~77 call sites, and it is the only thing that makes
 * horizontal scaling safe. Raising AZF_INSTANCE_COUNT before it lands does not
 * make the deployment scalable, it makes the data loss legal.
 *
 * Skipped under test (the suite runs many workers in one repo and never boots
 * a serving process) and satisfied silently by the default of 1, so ordinary
 * local development never sees it.
 */
export function assertSingleInstance(): void {
  if (config.isTest) return;
  const declared = config.instanceCount;
  if (declared === 1) return;

  const raw = process.env[INSTANCE_COUNT_ENV]?.trim() ?? '';
  const problem = Number.isNaN(declared)
    ? `${INSTANCE_COUNT_ENV} is set to ${JSON.stringify(raw)}, which is not a positive integer`
    : `${INSTANCE_COUNT_ENV}=${declared} declares ${declared} concurrent instances`;

  throw new Error(
    `Refusing to start: ${problem}. This API is single-instance only. Each instance ` +
      'hydrates its own in-memory copy of the store at boot and never re-reads, so a write ' +
      'on one instance is invisible to the others and the last flush silently overwrites ' +
      "the other instances' version of the same document — health logs are lost with no " +
      'error anywhere. Run exactly one instance (Replit: deploymentTarget = "vm", NOT ' +
      'autoscale; Docker Compose: do not use --scale on the api service; Azure Container ' +
      'Apps: min=max=1), and unset ' +
      `${INSTANCE_COUNT_ENV} or set it to 1. Scaling out requires the async getStore() ` +
      'refactor first, so reads go to Postgres rather than to a per-instance memory copy.',
  );
}

/**
 * Production secret guard: fail fast at boot rather than serving requests with
 * development fallback secrets. No-op outside production.
 */
export function assertProductionSecrets(): void {
  if (!isProduction()) return;
  const missing = ['JWT_ACCESS_SECRET', 'TELEGRAM_BOT_TOKEN', 'CORS_ORIGINS'].filter(
    (k) => !process.env[k],
  );
  if (missing.length > 0) {
    throw new Error(`Refusing to start in production without: ${missing.join(', ')}`);
  }
  // A wildcard origin on a credentialed health API is never intentional.
  const origins = process.env.CORS_ORIGINS!.split(',').map((s) => s.trim());
  if (origins.includes('*')) {
    throw new Error('CORS_ORIGINS must not include "*" in production');
  }
  const insecure = origins.filter((o) => o.startsWith('http://'));
  if (insecure.length > 0) {
    throw new Error(`CORS_ORIGINS must use https in production: ${insecure.join(', ')}`);
  }

  // Account recovery must actually be able to leave the building. The console
  // transport prints the token to a log sink nobody reads and the request
  // endpoint still answers 202, so a misconfigured deployment looks healthy
  // while every locked-out user stays locked out. Refuse to start instead.
  const provider = process.env.MAIL_PROVIDER?.trim().toLowerCase();
  const hasResendKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const effective = provider || (hasResendKey ? 'resend' : 'console');
  if (effective !== 'resend') {
    throw new Error(
      'Refusing to start in production without a real mail transport: set RESEND_API_KEY ' +
        '(and MAIL_FROM), or set MAIL_PROVIDER explicitly if you have wired another transport. ' +
        'Password reset is undeliverable without one.',
    );
  }
  if (!hasResendKey) {
    throw new Error('MAIL_PROVIDER=resend requires RESEND_API_KEY');
  }
  if (!process.env.MAIL_FROM?.trim()) {
    throw new Error('MAIL_FROM must be set in production (a domain verified with the provider)');
  }
  if (!process.env.APP_PUBLIC_URL?.trim()) {
    throw new Error('APP_PUBLIC_URL must be set in production (reset links are built from it)');
  }

  // The captcha-less mobile path is a global bypass of the registration
  // challenge (see config.authAllowCaptchalessMobile), so it must be
  // impossible to leave switched on by accident after a closed test. A boot
  // failure is the only enforcement that survives an operator forgetting.
  if (config.authAllowCaptchalessMobile) {
    throw new Error(
      'AUTH_ALLOW_CAPTCHALESS_MOBILE must not be set in production: it lets any caller sending ' +
        'the X-Client: android header register without solving the bot challenge. It is a ' +
        'closed-testing measure only; use the Play Integrity path in production.',
    );
  }

  // Bot protection is on only when BOTH Turnstile keys are present (see
  // config.botProtectionEnabled), and assertHuman returns early and does
  // nothing when it is off. So a production deployment missing either key
  // serves POST /auth/register and POST /auth/password-reset/request — the
  // account-creation surface, where one route mints accounts and AI credits
  // and the other mails an address the caller chose — completely unchallenged,
  // while every response and every log line looks exactly as it does when the
  // check is working. The only previous signal was one console.warn at boot,
  // which is to say none.
  //
  // A half-configured pair is the state this most often catches: a secret with
  // no site key, or a site key with no secret, is a setup somebody got part-way
  // through, and it protects precisely as much as setting neither.
  const turnstileMissing = (['TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY'] as const).filter(
    (k) => !process.env[k]?.trim(),
  );
  if (turnstileMissing.length > 0) {
    throw new Error(
      `Refusing to start in production without: ${turnstileMissing.join(', ')}. Bot protection ` +
        'is enabled only when BOTH Turnstile keys are set, so registration and password-reset ' +
        'request go out with no challenge at all without them and nothing says so at request ' +
        'time — a distributed signup flood stays under every per-IP rate limit. One key on its ' +
        'own leaves protection off exactly as if neither were set, which is the usual way this ' +
        'happens. Take both from the Cloudflare dashboard (Turnstile -> your site) and set them ' +
        'together.',
    );
  }

  // Admin MFA is built and mounted, but with MFA_REQUIRE_ADMIN off an
  // administrator who never enrolled a second factor is audited, logged and
  // then let through anyway (see modules/mfa/middleware). The admin router
  // reads and edits every account on the platform — every user's email,
  // health profile, food and weight history — so an unenrolled admin means
  // one stolen password stands between an attacker and all of it, with the
  // audit trail recording the breach rather than preventing it. The off
  // default exists only to give an existing deployment one window to enrol;
  // a boot failure is the only enforcement that survives an operator
  // forgetting to close that window.
  if (!config.mfaRequireAdmin) {
    throw new Error(
      'MFA_REQUIRE_ADMIN must be set to true in production: without it an administrator with no ' +
        'second factor enrolled is only audited, not stopped, and the admin routes expose every ' +
        'account on the platform. Have every admin enrol an authenticator first, then set it — ' +
        'flipping it with nobody enrolled locks you out of your own system.',
    );
  }

  // Durable persistence. Without DATABASE_URL the store falls back to JSON
  // files under AZF_DATA_DIR, which is correct for local dev but not for a
  // production deployment: containers restart with empty stores and user
  // accounts, refresh tokens and entitlements silently vanish. Refuse to
  // boot rather than serving a production API whose state evaporates on the
  // next deploy.
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      'DATABASE_URL must be set in production so the store persists to Postgres; ' +
        'the JSON file backing is a local-development store and is not durable across deploys.',
    );
  }
}

// Startup guard: importing config in a production process without real secrets
// must crash immediately (dev fallbacks are dev-only). This covers every
// entrypoint — the API server, the seed script, the importers — not just
// index.ts, which also calls it explicitly.
//
// Skipped under test: the suite exercises production combinations by mutating
// the environment, and a throw at *module load* would take down the whole
// worker rather than failing one assertion. The function itself is tested
// directly in __tests__/productionGuards.test.ts.
if (!config.isTest) assertProductionSecrets();
