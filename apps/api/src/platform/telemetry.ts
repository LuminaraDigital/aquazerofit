/**
 * Telemetry (AQF-09 platform module): structured request logging plus the
 * mandatory AI-call record (provider, model, promptVersion, latency, tokens,
 * guardrail outcome) required by the admission sequence step 7 (AQF-07 §4).
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';

/**
 * Query parameters whose values must never reach a log sink.
 *
 * The reset flow is the concrete case: the email links to
 * `/sign-in?reset=<token>`, and while that page is served by the SPA rather
 * than the API, any client, crawler or copy-pasted URL that replays it against
 * this origin would otherwise write a live single-use credential into stdout —
 * where it outlives the token's own 30-minute expiry in whatever the host
 * retains. The rest are here because logs are forever and this list is cheap.
 */
const REDACTED_QUERY_KEYS = new Set([
  'reset',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'password',
  'secret',
  'apikey',
  'api_key',
  'code',
  'signature',
  'initdata',
  'authorization',
]);

/**
 * Log-safe form of a request URL: path preserved, sensitive query values
 * replaced. Keys are kept because knowing *that* a reset link was replayed is
 * exactly the operational signal worth having; only the value is dangerous.
 */
export function redactUrl(originalUrl: string): string {
  const split = originalUrl.indexOf('?');
  if (split === -1) return originalUrl;
  const path = originalUrl.slice(0, split);
  const params = new URLSearchParams(originalUrl.slice(split + 1));
  let mutated = false;
  for (const key of [...params.keys()]) {
    if (REDACTED_QUERY_KEYS.has(key.toLowerCase())) {
      params.set(key, '[redacted]');
      mutated = true;
    }
  }
  if (!mutated) return originalUrl;
  return `${path}?${params.toString()}`;
}

/**
 * In-process counters for the operator-facing snapshot at GET /metrics.
 * Deliberately not Prometheus: the target platforms (Azure Container Apps,
 * Replit) scrape stdout and probe endpoints, and a pull-format dependency
 * buys nothing there. If a Prometheus fleet ever appears, these same
 * counters back it.
 */
export const metrics = {
  requestsTotal: 0,
  responsesByClass: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 } as Record<string, number>,
  aiCallsTotal: 0,
  aiCallsBlocked: 0,
  startedAt: new Date().toISOString(),
};

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (config.isTest) {
    next();
    return;
  }
  // Correlation id: honour an inbound one from a trusted proxy, else mint.
  // Never log secrets, and never let the client pick an arbitrary value:
  // cap length and strip anything that is not hex/dash so a hostile header
  // cannot smuggle a second JSON record into the log line.
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(incoming)
      ? incoming
      : crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  (req as { requestId?: string }).requestId = requestId;

  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    metrics.requestsTotal += 1;
    const klass = `${Math.floor(res.statusCode / 100)}xx`;
    if (klass in metrics.responsesByClass) metrics.responsesByClass[klass] += 1;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        kind: 'http',
        requestId,
        method: req.method,
        path: redactUrl(req.originalUrl),
        status: res.statusCode,
        ms,
      }),
    );
  });
  next();
}

export interface AiCallLog {
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokens?: { prompt?: number; completion?: number; total?: number };
  guardrail?: { blocked: boolean; category?: string | null };
  task?: string;
  userId?: string;
}

/** Every model call MUST be recorded through this function (AQF-09 §6 standards). */
export function logAiCall(entry: AiCallLog): void {
  metrics.aiCallsTotal += 1;
  if (entry.guardrail?.blocked) metrics.aiCallsBlocked += 1;
  if (config.isTest) return;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ t: new Date().toISOString(), kind: 'ai', ...entry }));
}

/**
 * Structured domain event, for things that are neither an HTTP request nor a
 * model call — money moving, chiefly.
 *
 * Payment outcomes are the one flow in this product with no user-visible audit
 * trail of its own: a user whose Stars left their balance and whose coach did
 * not unlock has nothing to show, so these lines are the only evidence an
 * operator will have. Never pass anything user-identifying beyond an internal
 * id — these land in whatever the host does with stdout.
 */
/**
 * Structured error record. The request id ties the failure back to the
 * http record; keep it on every 5xx so an operator can reconstruct "this
 * user-visible failure was that exception" from stdout alone.
 */
export function logError(
  err: unknown,
  context: { requestId?: string; route?: string } = {},
): void {
  if (config.isTest) return;
  const body: Record<string, unknown> = {
    t: new Date().toISOString(),
    kind: 'error',
    ...context,
  };
  if (err instanceof Error) {
    body.name = err.name;
    body.message = err.message;
    // Stack is valuable but may name user content in argument positions;
    // keep it, but truncate hard so we never ship megabyte lines.
    body.stack = typeof err.stack === 'string' ? err.stack.slice(0, 4000) : undefined;
  } else {
    body.message = String(err);
  }
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(body));
}

export function logEvent(name: string, fields: Record<string, unknown> = {}): void {
  if (config.isTest) return;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ t: new Date().toISOString(), kind: 'event', name, ...fields }));
}
