import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './platform/config';
import { errorHandler, notFoundHandler } from './platform/errors';
import { assertTrustProxyHeaders, enforceHttps } from './platform/https';
import { requestLogger, metrics } from './platform/telemetry';
import { rateLimiter } from './platform/rateLimiter';
import { getStore } from './platform/store';
import { buildRouter } from './modules';

/** Cloudflare Turnstile's script + iframe origin (see platform/botProtection.ts). */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

export function createApp() {
  const app = express();

  // Trust exactly config.trustProxy hops so req.ip is the real client behind an
  // Azure ingress. Without this every caller shares one rate-limit bucket.
  app.set('trust proxy', config.trustProxy);

  app.disable('x-powered-by');

  // Transport security runs before everything else: a plaintext request should
  // be turned away without this process parsing a body or touching the store.
  // The trust-proxy check sits first because enforceHttps reads `req.secure`,
  // which is only trustworthy when TRUST_PROXY matches the real topology.
  app.use(assertTrustProxyHeaders);
  app.use(enforceHttps);

  // Is a built SPA present and enabled? This changes the security posture:
  // an API-only process never emits HTML and can lock everything down, whereas
  // a process also serving the SPA must permit that SPA's own scripts, styles
  // and fonts, and must allow Telegram to frame it.
  const spaDir = config.serveWeb && fs.existsSync(config.webDistDir) ? config.webDistDir : null;

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: spaDir
          ? {
              defaultSrc: ["'self'"],
              // telegram.org serves the Mini App SDK loaded by index.html;
              // challenges.cloudflare.com serves the Turnstile widget on the
              // register and password-reset forms. Both are only requested
              // when the corresponding key is configured, but the directive
              // must be present unconditionally — a CSP cannot be varied per
              // response without also varying the cache.
              scriptSrc: [
                "'self'",
                'https://telegram.org',
                'https://*.telegram.org',
                TURNSTILE_ORIGIN,
              ],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
              imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
              // Turnstile runs its challenge inside an iframe it serves itself,
              // so frame-src must allow the origin — but connect-src must NOT:
              // the widget's XHR is issued from inside that iframe, which is a
              // separate browsing context governed by Cloudflare's own policy,
              // not this one. Adding it here would widen the page's egress
              // allowance for no benefit.
              frameSrc: ["'self'", TURNSTILE_ORIGIN],
              connectSrc: ["'self'"],
              // Coach/exercise media is played from object URLs built in the
              // client; without this, default-src 'self' blocks blob: playback.
              mediaSrc: ["'self'", 'blob:'],
              // Telegram renders Mini Apps inside an iframe on web.telegram.org,
              // so 'none' here would break the Mini App entirely. X-Frame-Options
              // cannot express a multi-origin allowlist; frame-ancestors can.
              frameAncestors: ["'self'", 'https://web.telegram.org', 'https://*.telegram.org'],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            }
          : {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              connectSrc: ["'self'"],
              frameAncestors: ["'none'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            },
      },
      // frameguard sends X-Frame-Options, which would override the multi-origin
      // frame-ancestors above in browsers that honour both. Off when serving the
      // SPA. In API-only mode it stays on but says DENY rather than helmet's
      // default SAMEORIGIN, so the legacy header agrees with frame-ancestors
      // 'none' instead of being quietly the weaker of the two.
      frameguard: spaDir ? false : { action: 'deny' },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // The SPA needs referrer info for same-origin navigation analytics later;
      // 'no-referrer' is right for a bare API but needlessly strict for a page.
      referrerPolicy: { policy: spaDir ? 'strict-origin-when-cross-origin' : 'no-referrer' },
    }),
  );
  app.use(cors({ origin: config.corsOrigins, credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  // Probes are registered BEFORE the limiter: a rate-limited liveness probe
  // 429s under load and the platform restarts a healthy container.
  // Liveness — process is up. No dependencies, never touches the store.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'aquazerofit-api', version: config.version });
  });

  // Readiness — safe to route traffic here: the data store has loaded AND,
  // under the Postgres backing, a live round-trip succeeds. Hydration alone
  // says the snapshot was readable at boot; the pin checks the pool still
  // answers, which is what the first routed request will need.
  app.get('/ready', async (_req, res) => {
    try {
      const store = getStore();
      // SELECT 1 against the pool when Postgres-backed; a no-op resolution
      // under the file backing where the store itself is the health signal.
      const maybePing = (store as { ping?: () => Promise<void> }).ping;
      if (typeof maybePing === 'function') await maybePing.call(store);
      res.json({ status: 'ready', service: 'aquazerofit-api', version: config.version });
    } catch (err) {
      res.status(503).json({
        code: 'NOT_READY',
        message: 'Data store is not available yet.',
        details: { reason: err instanceof Error ? err.message : 'unknown' },
      });
    }
  });

  // Operator snapshot: the in-process counters as JSON. Registered before
  // the limiter and unauthenticated for the same reason as /health — a
  // platform scraper cannot present credentials, and the payload carries no
  // user data (counts and timestamps only).
  app.get('/metrics', (_req, res) => {
    res.json({ service: 'aquazerofit-api', version: config.version, metrics });
  });

  app.use(rateLimiter);

  // Committed placeholder media (exercise art etc.) lives in assets/ and is
  // safe to serve publicly. User meal photos in uploads/ are deliberately NOT
  // statically mounted — they are private and served only through the
  // authenticated, ownership-checked GET /api/v1/meal-photos/:jobId/image.
  const here = path.dirname(fileURLToPath(import.meta.url));
  app.use('/uploads', express.static(path.resolve(here, '../assets')));

  app.use(config.basePath, buildRouter());

  // ----- SPA (single-origin hosting) -----
  //
  // Registered AFTER the API router so it can never shadow an API route: an
  // unknown /api/v1/* path still falls through to notFoundHandler and returns
  // the JSON error envelope rather than an HTML page.
  if (spaDir) {
    // Vite emits content-hashed filenames under /assets, so they are immutable
    // and safe to cache for a year. index.html must never be cached, or clients
    // pin themselves to a stale bundle after a deploy.
    app.use(
      express.static(spaDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );

    // Client-side routing: deep links like /nutrition/analysis/:id must return
    // the shell. Only GET/HEAD, and only when the client actually wants HTML —
    // an errant fetch for a missing JSON resource should get a 404, not markup.
    //
    // Pathless app.use rather than app.get('*'): Express 5 moved to
    // path-to-regexp v8, which rejects the bare '*' outright ("Missing
    // parameter name at index 1") and takes the whole server down at boot. A
    // pathless use matches every path on both 4 and 5, and the method guard
    // below already does what app.get was contributing.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith(config.basePath) || req.path.startsWith('/uploads')) return next();
      if (!req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(spaDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
