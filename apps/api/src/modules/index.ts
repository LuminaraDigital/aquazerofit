/**
 * Module registry: buildRouter() mounts every module router on the versioned
 * base path (app.ts mounts this at config.basePath = /api/v1). Endpoint
 * surface per AQF-07 §3.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { authRouter } from './auth/router';
import { meRouter } from './me/router';
import { foodsRouter } from './foods/router';
import { logsRouter } from './logs/router';
import { analyticsRouter } from './analytics/router';
import { plansRouter } from './plans/router';
import { workoutsRouter, exercisesRouter } from './workouts/router';
import { progressRouter } from './progress/router';
import { recipesRouter } from './recipes/router';
import { adminRouter } from './admin/router';
// AI lane (owned by the AI/chat engineer):
import { chatRouter } from './chat/router';
import { visionRouter } from './vision/router';
import { recommendationsRouter } from './recommendations/router';
import { challengesRouter } from './challenges/router';
import { coachesRouter } from './coaches/router';
import { telegramWebhookRouter } from './payments/router';
import { billingRouter } from './billing/router';

import { exportRouter } from './export/export';

export { exportRouter };

// ---------------------------------------------------------------------------
// Cache policy
// ---------------------------------------------------------------------------

/**
 * The default for every API response, applied before any route runs.
 *
 * Almost everything under /api/v1 is one user's data behind a bearer token, and
 * until now none of it said so. That silence is only safe while every hop
 * between this process and the browser happens to guess right: apps/web is
 * fronted by an Azure Static Web Apps edge (see apps/web/staticwebapp.config.json),
 * and an edge or CDN rule that decided a 200 with no freshness information was
 * cacheable would hand one user's dashboard to the next caller. `no-store`
 * removes the guess. `private` and `max-age=0` are belt and braces for
 * intermediaries that predate no-store.
 */
export const API_DEFAULT_CACHE_CONTROL = 'private, no-store, max-age=0';

/**
 * The opt-out for published catalogue content that is byte-identical for every
 * caller. Five minutes is long enough to absorb a search-as-you-type burst and
 * short enough that a content republish lands the same day.
 *
 * `public` is load-bearing rather than decorative: RFC 9111 §3.5 forbids a
 * shared cache from storing a response to a request that carried an
 * Authorization header *unless* the response explicitly permits it. These
 * routes sit behind requireAuth, so without `public` a CDN would refuse to
 * store them at all.
 */
export const PUBLIC_CONTENT_CACHE_CONTROL = 'public, max-age=300';

/**
 * The allowlist. Default closed: a route earns a place here only by being
 * verifiably independent of who is asking.
 *
 * Paths are relative to the router's mount point (config.basePath), which is
 * what req.path reports inside a router-level middleware.
 *
 * Deliberately ABSENT, having been read rather than assumed:
 *
 *  - `GET /exercises` and `GET /workouts/exercises` — the library handler takes
 *    `respectProfile=true`, which filters the catalogue against the caller's
 *    injuries and equipment. Same URL, different body per user.
 *  - `GET /coaches` — the roster ships `activeCoachId`, `experience` and
 *    `entitlements` alongside it. The character art is public; the progression
 *    wrapped around it is not.
 *  - `GET /challenges/peek/:code` — unauthenticated, but an invite view whose
 *    membership changes as people join, keyed by a code that is meant to stay
 *    between the people who were sent it.
 *
 * Present because each one is a pure read of published content with no userId
 * anywhere in its path:
 */
const PUBLIC_CACHEABLE_GET_PATHS: RegExp[] = [
  // Food search + detail. searchFoods() closes over (search, limit) only, and
  // the by-id read is a bare store lookup. /foods/barcode/:code is excluded by
  // the single-segment match: it does a live upstream fetch and a write.
  /^\/foods\/?$/,
  /^\/foods\/[^/]+$/,
  // Recipe library + detail: read-only content, macros precomputed at publish.
  /^\/recipes\/?$/,
  /^\/recipes\/[^/]+$/,
  // A single exercise and its variations. getExerciseVariations() takes an
  // exercise id and nothing else — unlike the list route above it.
  /^\/exercises\/[^/]+$/,
  /^\/exercises\/[^/]+\/variations$/,
];

function isPublicCacheableGet(req: Request): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (req.path === '/foods/barcode') return false;
  return PUBLIC_CACHEABLE_GET_PATHS.some((pattern) => pattern.test(req.path));
}

/**
 * Default-closed cache policy for the whole API surface.
 *
 * Ordering matters twice here, and both are easy to get backwards:
 *
 *  1. The default is written with setHeader BEFORE next(), never on 'finish'.
 *     A handler that sets its own policy later — the chat SSE stream's
 *     `no-cache`, the meal-photo route's `private, no-store` — therefore
 *     overwrites this one, which is the intent. Writing the header at the end
 *     of the response would silently clobber all three.
 *  2. The public upgrade is deferred to header-flush time, because this
 *     middleware runs before requireAuth. Upgrading eagerly would stamp
 *     `public, max-age=300` onto the 401 that an expired token produces, and a
 *     shared cache would then serve that 401 to everyone else for five
 *     minutes. At flush time the status code is known, so the upgrade applies
 *     only to a response that actually succeeded — and only if nothing has
 *     touched the header in the meantime.
 */
export function apiCachePolicy(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', API_DEFAULT_CACHE_CONTROL);

  if (isPublicCacheableGet(req)) {
    const originalWriteHead = res.writeHead;
    res.writeHead = function patchedWriteHead(this: Response, ...args: unknown[]) {
      const status = this.statusCode;
      const cacheable = (status >= 200 && status < 300) || status === 304;
      if (cacheable && this.getHeader('Cache-Control') === API_DEFAULT_CACHE_CONTROL) {
        this.setHeader('Cache-Control', PUBLIC_CONTENT_CACHE_CONTROL);
      }
      return (originalWriteHead as (...a: unknown[]) => Response).apply(this, args);
    } as Response['writeHead'];
  }

  next();
}

export function buildRouter(): Router {
  const router = Router();

  // First, so it covers every module router below it and also the 404/error
  // envelopes that fall through this router to the app-level handlers.
  router.use(apiCachePolicy);

  router.use('/auth', authRouter);
  router.use('/me', meRouter);
  router.use('/foods', foodsRouter);
  router.use('/analytics', analyticsRouter);
  router.use('/plans', plansRouter);
  router.use('/workouts', workoutsRouter);
  router.use('/exercises', exercisesRouter);
  router.use('/progress', progressRouter);
  router.use('/recipes', recipesRouter);
  router.use('/challenges', challengesRouter);
  router.use('/coaches', coachesRouter);
  router.use('/admin', adminRouter);
  router.use('/export', exportRouter);

  // Telegram's payment callbacks. Mounted with the API rather than at the root
  // so it inherits CORS, helmet and the rate limiter; it authenticates by
  // shared secret rather than by bearer token, and is the only unauthenticated
  // route here that can grant an entitlement.
  router.use('/telegram', telegramWebhookRouter);
  // Billing sits beside the Telegram webhook: both are money-moving routes
  // with one authenticated half and one unauthenticated, secret-guarded half.
  router.use('/billing', billingRouter);

  // AI lane
  router.use('/chat', chatRouter);
  router.use('/meal-photos', visionRouter);
  router.use('/recommendations', recommendationsRouter);

  // Log routes live at the root: /meal-logs, /water-logs, /weight-logs.
  router.use('/', logsRouter);

  return router;
}
