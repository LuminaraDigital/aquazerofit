/**
 * In-memory sliding-window rate limiter (AQF-07 §4 step 2: per user AND per IP).
 * Generous default lane (300/min); stricter lane for model-calling surfaces
 * (/chat, /meal-photos: 20/min); tighter lane again for the unauthenticated
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

function isStrictPath(path: string): boolean {
  return path.includes('/chat') || path.includes('/meal-photos');
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
  const checks = auth
    ? [hit(`${lane}:ip:${req.ip ?? 'unknown'}`, limit, now)]
    : [
        hit(`${lane}:${subjectOf(req)}`, limit, now),
        hit(`${lane}:ip:${req.ip ?? 'unknown'}`, limit, now),
      ];
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
