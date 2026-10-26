/**
 * Boot guards: checks that refuse to start a process whose configuration would
 * fail quietly once it was serving. Each throws with the problem, why it
 * matters, and what to set instead.
 *
 * Split out of config.ts, which owns every value these read. config.ts imports
 * assertProductionSecrets back so that merely importing config in production
 * still runs it. That cycle is safe because the one call made while the two
 * modules are loading is that one, and it runs after `config` exists.
 */
import { INSTANCE_COUNT_ENV, config } from './config';

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
 * ON CLOUD RUN THE DEFAULT IS NOT ENOUGH. Cloud Run autoscales (to 100
 * instances unless max-instances says otherwise), and cloudbuild.yaml deploys
 * with `gcloud run deploy --image`, which keeps whatever scaling the live
 * service already has. An unset variable there means nobody declared
 * anything, and the default of 1 would wave through a service capped at 100.
 * So when K_SERVICE is present (Cloud Run sets it on every revision) the
 * variable must be set explicitly. cloudbuild.yaml sets it in the same
 * command that pins min and max instances to 1, so the declaration and the
 * scaling travel together.
 *
 * That is a declaration check, not a measurement, and its reach is narrow.
 * The process cannot read max-instances, so a service raised by hand in the
 * console boots with the variable still at 1. And since cloudbuild.yaml sets
 * the variable on every deploy, what it mostly catches is a revision made some
 * other way on a service that never had it. It stays because that case is
 * exactly a fresh service sitting on Cloud Run's default ceiling of 100.
 *
 * Skipped under test (the suite runs many workers in one repo and never boots
 * a serving process) and, off Cloud Run, satisfied silently by the default of
 * 1, so ordinary local development never sees it.
 */
export function assertSingleInstance(): void {
  if (config.isTest) return;
  const raw = process.env[INSTANCE_COUNT_ENV]?.trim() ?? '';
  if (raw === '' && process.env.K_SERVICE?.trim()) {
    throw singleInstanceRefusal(
      `${INSTANCE_COUNT_ENV} is unset on Cloud Run, which autoscales unless max-instances is ` +
        'pinned, so the default of 1 declares nothing',
    );
  }
  const declared = config.instanceCount;
  if (Number.isNaN(declared)) {
    throw singleInstanceRefusal(
      `${INSTANCE_COUNT_ENV} is set to ${JSON.stringify(raw)}, which is not a positive integer`,
    );
  }
  if (declared > 1) {
    throw singleInstanceRefusal(
      `${INSTANCE_COUNT_ENV}=${declared} declares ${declared} concurrent instances`,
    );
  }
}

/** The refusal every branch above throws: the problem, then why, then what to run instead. */
function singleInstanceRefusal(problem: string): Error {
  return new Error(
    `Refusing to start: ${problem}. This API is single-instance only. Each instance ` +
      'hydrates its own in-memory copy of the store at boot and never re-reads, so a write ' +
      'on one instance is invisible to the others and the last flush silently overwrites ' +
      "the other instances' version of the same document - health logs are lost with no " +
      'error anywhere. Run exactly one instance (Cloud Run: --min-instances=1 ' +
      '--max-instances=1, which cloudbuild.yaml applies on every deploy; managed PaaS: one ' +
      'dedicated machine, NOT autoscale; Docker Compose: do not use --scale on the api service; ' +
      `Azure Container Apps: min=max=1), and set ${INSTANCE_COUNT_ENV}=1 (it may be left ` +
      'unset only off Cloud Run). Scaling out requires the async getStore() refactor first, ' +
      'so reads go to Postgres rather than to a per-instance memory copy.',
  );
}

/**
 * Shortest origin secret the gate will run on. A floor, not a strength
 * measure: the documented recipe (`openssl rand -hex 32`) gives 64 hex
 * characters, so anything under half that was not made that way.
 */
const MIN_ORIGIN_SECRET_LENGTH = 32;

/**
 * Origin-gate guard: refuse to boot with REQUIRE_ORIGIN_SECRET on and no
 * usable ORIGIN_SHARED_SECRET to compare against.
 *
 * An empty secret never matches (originSecretMatches in platform/clientIp.ts),
 * so the gate would refuse every request - the whole site and every webhook -
 * while /health and /ready, which are exempt, kept answering 200. The
 * platform would read that revision as healthy and send it all the traffic.
 * A failed deploy keeps the previous revision serving instead.
 *
 * A guessable secret is the opposite failure and just as quiet: the gate
 * looks closed and admits anyone who has the value. The `replace-with-...`
 * placeholder in .env.production.example is in a public repository, so it is
 * refused outright, as is anything shorter than MIN_ORIGIN_SECRET_LENGTH.
 * Neither message echoes the value.
 *
 * Off, nothing is judged. The secret then only steers rate-limit buckets, and
 * a deploy must not fail over it before the operator has chosen the gate.
 *
 * Not skipped under test, unlike assertSingleInstance: it reads getters and
 * only index.ts calls it, so the suite can exercise it directly.
 */
export function assertOriginSecretConfigured(): void {
  if (!config.requireOriginSecret) return;
  const secret = config.originSharedSecret;
  if (!secret) {
    throw new Error(
      'Refusing to start: REQUIRE_ORIGIN_SECRET is on but ORIGIN_SHARED_SECRET is empty, so every ' +
        'request except /health and /ready would be refused with 403 while the probes stayed green. ' +
        'Set ORIGIN_SHARED_SECRET to the value the Worker holds (`npx wrangler secret put ' +
        'ORIGIN_SHARED_SECRET` in cloudflare/), or unset REQUIRE_ORIGIN_SECRET.',
    );
  }
  assertUnguessableOriginSecret('ORIGIN_SHARED_SECRET', secret);
  // Optional, but a weak previous value opens the gate exactly as a weak
  // current one would.
  const previous = config.originSharedSecretPrevious;
  if (previous) assertUnguessableOriginSecret('ORIGIN_SHARED_SECRET_PREVIOUS', previous);
}

function assertUnguessableOriginSecret(name: string, value: string): void {
  let problem: string;
  if (value.toLowerCase().startsWith('replace-with')) {
    problem = 'is the placeholder from .env.production.example, which anyone can read';
  } else if (value.length < MIN_ORIGIN_SECRET_LENGTH) {
    problem = `is ${value.length} characters, under the ${MIN_ORIGIN_SECRET_LENGTH}-character floor`;
  } else {
    return;
  }
  throw new Error(
    `Refusing to start: ${name} ${problem}, so REQUIRE_ORIGIN_SECRET would admit anyone ` +
      'who has it. Generate one with `openssl rand -hex 32` and set it on the Worker and on ' +
      'Cloud Run (docs/OPERATIONS.md, "Closing the run.app bypass").',
  );
}

/**
 * Production secret guard: fail fast at boot rather than serving requests with
 * development fallback secrets. No-op outside production.
 */
export function assertProductionSecrets(): void {
  if (!config.isProduction) return;
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
  // serves POST /auth/register and POST /auth/password-reset/request - the
  // account-creation surface, where one route mints accounts and AI credits
  // and the other mails an address the caller chose - completely unchallenged,
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
        'time - a distributed signup flood stays under every per-IP rate limit. One key on its ' +
        'own leaves protection off exactly as if neither were set, which is the usual way this ' +
        'happens. Take both from the Cloudflare dashboard (Turnstile -> your site) and set them ' +
        'together.',
    );
  }

  // Admin MFA is built and mounted, but with MFA_REQUIRE_ADMIN off an
  // administrator who never enrolled a second factor is audited, logged and
  // then let through anyway (see modules/mfa/middleware). The admin router
  // reads and edits every account on the platform - every user's email,
  // health profile, food and weight history - so an unenrolled admin means
  // one stolen password stands between an attacker and all of it, with the
  // audit trail recording the breach rather than preventing it. The off
  // default exists only to give an existing deployment one window to enrol;
  // a boot failure is the only enforcement that survives an operator
  // forgetting to close that window.
  if (!config.mfaRequireAdmin) {
    throw new Error(
      'MFA_REQUIRE_ADMIN must be set to true in production: without it an administrator with no ' +
        'second factor enrolled is only audited, not stopped, and the admin routes expose every ' +
        'account on the platform. Have every admin enrol an authenticator first, then set it - ' +
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
