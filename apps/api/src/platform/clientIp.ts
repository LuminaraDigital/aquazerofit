/**
 * Client address used for rate limiting.
 *
 * Cloud Run ingress is public, and the Worker reaches it from Cloudflare's
 * egress addresses. With TRUST_PROXY set, Express `req.ip` follows
 * X-Forwarded-For and can collapse every visitor into one bucket, or, if the
 * hop count is too high, accept a client-supplied address.
 *
 * CF-Connecting-IP is the real client only when this request came through our
 * Worker. The Worker sets X-Origin-Shared-Secret from ORIGIN_SHARED_SECRET.
 * A direct caller of run.app can send both headers, so the secret is compared
 * before the IP is trusted. Anything else uses the socket address, which is
 * the Cloud Run peer and is shared on purpose: unauthenticated direct traffic
 * does not get a per-user bucket.
 *
 * With REQUIRE_ORIGIN_SECRET on, the same compare also gates the whole app
 * (requireWorkerOrigin below): direct traffic is refused rather than bucketed.
 */
import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { config } from './config';
import { AppError } from './errors';

export const ORIGIN_SHARED_SECRET_HEADER = 'x-origin-shared-secret';
export const CF_CONNECTING_IP_HEADER = 'cf-connecting-ip';

let originSecretWarningEmitted = false;

export function resetOriginSecretWarning(): void {
  originSecretWarningEmitted = false;
}

/**
 * Fixed-width compare. Hashing both sides first means a different length
 * still runs timingSafeEqual, instead of returning early and leaking how
 * long the secret is.
 */
export function originSecretMatches(presented: string | undefined, expected: string): boolean {
  if (!expected) return false;
  const left = crypto.createHash('sha256').update(presented ?? '', 'utf8').digest();
  const right = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
}

/**
 * The Worker's secret: the current one or, during a rotation overlap,
 * ORIGIN_SHARED_SECRET_PREVIOUS (see config). Both compares run whenever both
 * are set, so the time taken does not say which one matched.
 */
function isWorkerSecret(presented: string | undefined): boolean {
  const current = originSecretMatches(presented, config.originSharedSecret);
  const previous = originSecretMatches(presented, config.originSharedSecretPrevious);
  return current || previous;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** One IPv4 or IPv6 address. Rejects lists, whitespace, and oversized values. */
function plausibleClientIp(value: string | undefined): string | undefined {
  if (!value || value.length > 45) return undefined;
  if (value.includes('.')) {
    const parts = value.split('.');
    if (parts.length !== 4) return undefined;
    if (!parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return undefined;
    return value;
  }
  if (!/^[0-9a-fA-F:]+$/.test(value) || !value.includes(':')) return undefined;
  return value;
}

function socketAddress(req: Request): string {
  const address = req.socket?.remoteAddress?.trim();
  return address || 'unknown';
}

function warnIfSecretUnset(req: Request): void {
  if (originSecretWarningEmitted || config.isTest || !config.isProduction) return;
  if (config.originSharedSecret) return;
  if (!singleHeader(req.headers[CF_CONNECTING_IP_HEADER])) return;
  originSecretWarningEmitted = true;
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({
      t: new Date().toISOString(),
      kind: 'security',
      event: 'origin_secret_unset',
      detail:
        'CF-Connecting-IP arrived but ORIGIN_SHARED_SECRET is unset, so rate limits are using the socket address. Set the same secret on the Worker and on Cloud Run.',
    }),
  );
}

/** The eight groups of an IPv6 address, or null when it is not one this can read. */
function ipv6Groups(address: string): number[] | null {
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

/**
 * The unit one client controls, which is what a per-client limit has to
 * count. An IPv4 address is one host. An IPv6 subscriber is normally handed a
 * whole /64 and can use any address in it, so a bucket per IPv6 address is a
 * fresh bucket per request for anyone who rotates; the /64 is keyed instead,
 * in one spelling however the address was written. An IPv4 address in mapped
 * form (`::ffff:a.b.c.d`, how Node reports IPv4 peers on a dual-stack socket)
 * is that IPv4 address, not a member of the `::` /64. Anything unreadable is
 * returned as given.
 */
export function clientNetworkKey(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/%.*$/, '');
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1]!;
  const groups = address.includes(':') ? ipv6Groups(address) : null;
  if (!groups) return address;
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
}

/** Address the rate limiter and the Telegram new-account caps key on; both pass it through clientNetworkKey. */
export function clientIpForRateLimit(req: Request): string {
  const presented = singleHeader(req.headers[ORIGIN_SHARED_SECRET_HEADER]);
  const cfIp = plausibleClientIp(singleHeader(req.headers[CF_CONNECTING_IP_HEADER]));
  if (cfIp && isWorkerSecret(presented)) return cfIp;
  warnIfSecretUnset(req);
  return socketAddress(req);
}

/**
 * One security line a minute at most, counting every refusal since the last
 * line. A scanner on the run.app URL can send thousands a minute; a line each
 * is a log bill, not a signal, and the count keeps the volume visible. The
 * reason and path are those of the request that tripped the line.
 * `secret_missing` is a direct caller, or a provider webhook still registered
 * on run.app (the path says which). `secret_mismatch` from real traffic means
 * the Worker and Cloud Run hold different values: a rotation half done.
 */
const ORIGIN_REFUSAL_LOG_INTERVAL_MS = 60_000;
let originRefusalLoggedAt = 0;
let originRefusalsSinceLog = 0;

export function resetOriginRefusalLog(): void {
  originRefusalLoggedAt = 0;
  originRefusalsSinceLog = 0;
}

function logOriginRefusal(req: Request, reason: 'secret_missing' | 'secret_mismatch'): void {
  originRefusalsSinceLog += 1;
  const now = Date.now();
  if (now - originRefusalLoggedAt < ORIGIN_REFUSAL_LOG_INTERVAL_MS) return;
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({
      t: new Date(now).toISOString(),
      kind: 'security',
      event: 'origin_secret_rejected',
      reason,
      method: req.method,
      path: req.path,
      refusedSinceLastLog: originRefusalsSinceLog,
    }),
  );
  originRefusalLoggedAt = now;
  originRefusalsSinceLog = 0;
}

/**
 * With REQUIRE_ORIGIN_SECRET on, refuse any request that did not come through
 * the Worker. The compare above, used as a gate rather than as a hint. Off,
 * this is a no-op, so the rollout order in docs/OPERATIONS.md decides when it
 * starts refusing.
 *
 * /health and /ready are exempt because Cloud Run's startup and liveness
 * probes, and uptime checks, dial the origin directly with no secret;
 * refusing them would have the platform kill a healthy revision. The match is
 * exact. Express also routes /health/ and /HEALTH to the probe handler, and
 * refusing those is the safe side of that difference.
 *
 * The refusal goes straight to errorHandler, so it skips the request log; the
 * line above is its record.
 */
export const requireWorkerOrigin: RequestHandler = (req, _res, next) => {
  if (!config.requireOriginSecret || req.path === '/health' || req.path === '/ready') return next();
  const presented = singleHeader(req.headers[ORIGIN_SHARED_SECRET_HEADER]);
  if (isWorkerSecret(presented)) return next();
  logOriginRefusal(req, presented ? 'secret_mismatch' : 'secret_missing');
  next(
    new AppError('FORBIDDEN', `Direct requests to this origin are refused. Use ${config.appPublicUrl}.`),
  );
};
