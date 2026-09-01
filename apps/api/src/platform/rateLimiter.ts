/**
 * In-memory sliding-window rate limiter (AQF-07 §4 step 2: per user AND per IP).
 * Generous default lane (300/min); stricter lane for every model-calling
 * surface (AI_PATHS below: 20/min); tighter lane again for the unauthenticated
 * surfaces (/analytics/events, /challenges/peek: 30/min). Emits 429
 * RATE_LIMITED with Retry-After.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { ApiErrorBody } from '@aquazerofit/shared';
import { config } from './config';

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 300;
const STRICT_LIMIT = 20;
/** /auth lane: credential guessing surface — strictest lane, keyed per IP. */
const AUTH_LIMIT = 10;
/** Unauthenticated telemetry writes and invite peeks. */
const ANON_LIMIT = 30;

/** key -> sorted request timestamps within the current window */
const buckets = new Map<string, number[]>();

// Bound memory: drop buckets idle for > 10 minutes, every 5 minutes.
const BUCKET_IDLE_MS = 10 * 60_000;
const PRUNE_EVERY_MS = 5 * 60_000;
const pruneTimer = setInterval(() => pruneBuckets(Date.now()), PRUNE_EVERY_MS);
pruneTimer.unref?.();

export function pruneBuckets(now: number): void {
  for (const [key, stamps] of buckets) {
    const newest = stamps[stamps.length - 1] ?? 0;
    if (now - newest > BUCKET_IDLE_MS) buckets.delete(key);
  }
}

/**
 * Every surface that can reach the AI gateway, matched by the narrowest path
 * that identifies it.
 *
 * Narrow on purpose. The mounts these live under also carry high-frequency
 * non-AI traffic — `/workouts/:id/complete` fires per set during a live
 * session, `/progress/summary` backs the dashboard — and putting those on a
 * 20/min lane would throttle ordinary logging to protect a model call they
 * never make. Matching `/plans` or `/workouts` wholesale is the tempting
 * version of this and it is wrong.
 *
 * The list is the failure mode too: `/plans/generate` and `/swap-exercise`
 * called the gateway from the day they shipped and were never on this lane,
 * because the lane was written as "/chat and the photo route" rather than as
 * "everything that spends model tokens". Adding a gateway caller means adding
 * it here.
 */
const AI_PATHS = [
  '/chat',
  '/meal-photos',
  '/recommendations',
  '/progress/insight',
  '/plans/generate',
  '/swap-exercise',
] as const;

function isStrictPath(path: string): boolean {
  return AI_PATHS.some((p) => path.includes(p));
}

function isAuthPath(path: string): boolean {
  return path.includes('/auth');
}

/**
 * Anonymous write surfaces. /analytics/events accepts a body without a token,
 * so the default 300/min lane would let one IP persist far more telemetry than
 * any real share flow produces. Public invite peeks share the lane: they are
 * the only other route that reads a stored document unauthenticated.
 */
function isAnonymousWritePath(path: string): boolean {
  return path.includes('/analytics/events') || path.includes('/challenges/peek');
}

/** Best-effort subject extraction for limiter keying only — NOT authentication. */
function subjectOf(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const decoded = jwt.decode(header.slice(7));
    if (decoded && typeof decoded === 'object' && typeof decoded.sub === 'string') {
      return `u:${decoded.sub}`;
    }
  }
  return `ip:${req.ip ?? 'unknown'}`;
}

function hit(key: string, limit: number, now: number): { allowed: boolean; retryAfterSec: number } {
  const windowStart = now - WINDOW_MS;
  const stamps = (buckets.get(key) ?? []).filter((t) => t > windowStart);
  if (stamps.length >= limit) {
    const oldest = stamps[0] ?? now;
    buckets.set(key, stamps);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)) };
  }
  stamps.push(now);
  buckets.set(key, stamps);
  return { allowed: true, retryAfterSec: 0 };
}

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (config.isTest && process.env.AZF_RATE_LIMIT_FORCE !== '1') {
    next();
    return;
  }
  const now = Date.now();
  const auth = isAuthPath(req.path);
  const anon = !auth && isAnonymousWritePath(req.path);
  const strict = !auth && !anon && isStrictPath(req.path);
  const limit = auth ? AUTH_LIMIT : anon ? ANON_LIMIT : strict ? STRICT_LIMIT : DEFAULT_LIMIT;
  const lane = auth ? 'auth' : anon ? 'anon' : strict ? 'strict' : 'default';

  // Auth lane is per-IP only (requests are unauthenticated by nature);
  // other lanes: per user (or per IP when anonymous) AND per IP.
  const ipKey = `${lane}:ip:${req.ip ?? 'unknown'}`;

  /*
   * Deduplicated, and that is a fix rather than a tidy-up.
   *
   * `subjectOf` falls back to `ip:<addr>` when there is no bearer token, so
   * for every unauthenticated request the subject key and the IP key were the
   * SAME string — and the old code hit it twice. One request therefore
   * consumed two slots from one bucket, and every anonymous caller silently
   * got half the lane's stated limit: 15/min on the 30/min anon lane, 150/min
   * on the 300/min default. Stricter than advertised rather than looser, so
   * nothing broke loudly; it just meant the numbers at the top of this file
   * described behaviour the code did not have.
   */
  const keys = auth ? [ipKey] : [...new Set([`${lane}:${subjectOf(req)}`, ipKey])];
  const checks = keys.map((key) => hit(key, limit, now));
  const blocked = checks.find((c) => !c.allowed);
  if (blocked) {
    res.setHeader('Retry-After', String(blocked.retryAfterSec));
    res.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Rate limit reached. Please retry shortly.',
      details: { retryAfterSeconds: blocked.retryAfterSec },
    } satisfies ApiErrorBody);
    return;
  }
  next();
}

/** Test/ops hook. */
export function resetRateLimiter(): void {
  buckets.clear();
}
