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
