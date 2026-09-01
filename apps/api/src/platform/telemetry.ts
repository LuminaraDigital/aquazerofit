/**
 * Telemetry (AQF-09 platform module): structured request logging plus the
 * mandatory AI-call record (provider, model, promptVersion, latency, tokens,
 * guardrail outcome) required by the admission sequence step 7 (AQF-07 §4).
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';
import { recordSpend } from './aiBudget';

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
  // Added for logEvent payload scrubbing (see SENSITIVE_KEY_FRAGMENTS). They
  // are harmless extras for query strings, which is the only reason this one
  // list can serve both callers.
  'creditcard',
  'cookie',
  'sessionid',
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

// ---------------------------------------------------------------------------
// Payload scrubbing for logEvent
// ---------------------------------------------------------------------------

/** Lowercase and drop separators, so `X-Api-Key`, `api_key` and `apiKey` all normalise to `apikey`. */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Denylist entries that are too ordinary a word to match as a substring.
 *
 * `code` is the one that would do real damage: this product scans barcodes and
 * returns an error taxonomy, so `barcode`, `statusCode`, `errorCode` and
 * `countryCode` are all innocuous keys an operator wants to read. `reset` would
 * swallow `resetAt`/`resetCount`, and `signature` would swallow
 * `signatureVersion`. All three are still redacted on an exact match, which is
 * exactly how they behave in a query string.
 */
const EXACT_ONLY_KEYS = new Set(['code', 'reset', 'signature']);

/** Every denylist entry, normalised — matched against the whole key. */
const SENSITIVE_KEY_EXACT = new Set([...REDACTED_QUERY_KEYS].map(normaliseKey));

/**
 * Denylist entries specific enough to match anywhere inside a key, so that
 * `userPassword`, `X-Api-Key`, `tgInitData` and `stripeCreditCardLast4` are all
 * caught without anyone having to remember to name them.
 *
 * Two costs were accepted knowingly rather than overlooked:
 *
 *  - `token` also matches `tokenCount`/`promptTokens`. The AI token counters
 *    travel through logAiCall, a typed field this scrubber never sees, so
 *    nothing real is lost today and a future freeform `tokensUsed` losing its
 *    value in a log is a cheap price for catching every bearer token.
 *  - `cookie` is a food in a nutrition app. It is still matched, because only
 *    KEYS are ever tested here — values pass through untouched — and a meal
 *    named "cookie" is a value. The residual cost is a hypothetical key
 *    literally called `cookieCount`.
 */
const SENSITIVE_KEY_FRAGMENTS = [...SENSITIVE_KEY_EXACT].filter((k) => !EXACT_ONLY_KEYS.has(k));

function isSensitiveKey(key: string): boolean {
  const normalised = normaliseKey(key);
  if (SENSITIVE_KEY_EXACT.has(normalised)) return true;
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

/**
 * Depth cap. Event payloads are flat by convention; six levels is far past
 * anything legitimate and stops a pathological structure from turning one log
 * line into a stack overflow.
 */
const MAX_SCRUB_DEPTH = 6;
/** Arrays are truncated rather than walked forever — a log line is not a data export. */
const MAX_SCRUB_ARRAY = 200;

export const REDACTED = '[redacted]';

/**
 * Recursively replace the value of any sensitive-looking key.
 *
 * This lives inside logEvent rather than at the call sites on purpose: call
 * sites pass freeform objects, and "remember to redact" is a rule that gets
 * forgotten exactly once before a token is in stdout forever.
 *
 * Everything here is defensive because it runs inside a logger, and a logger
 * that throws takes the request with it: cycles are detected, depth and array
 * length are capped, BigInt is stringified (JSON.stringify throws on it), and
 * binary blobs are summarised rather than expanded into a megabyte of digits.
 */
export function scrubLogFields(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  // BigInt is the one primitive JSON.stringify refuses outright.
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value !== 'object') {
    // Functions and symbols are dropped by JSON.stringify anyway; naming them
    // is more useful to an operator than a silently missing field.
    if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
    return value;
  }

  // Dates already serialise to a useful ISO string; recursing would flatten
  // them to {}.
  if (value instanceof Date) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return '[binary]';

  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_SCRUB_DEPTH) return '[depth-limited]';
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const kept = value.slice(0, MAX_SCRUB_ARRAY).map((item) => scrubLogFields(item, depth + 1, seen));
      if (value.length > MAX_SCRUB_ARRAY) kept.push(`[+${value.length - MAX_SCRUB_ARRAY} more]`);
      return kept;
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : scrubLogFields(item, depth + 1, seen);
    }
    return out;
  } finally {
    // Released on the way out so a value that legitimately appears twice in
    // sibling branches is not misreported as a cycle.
    seen.delete(value);
  }
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
  /*
   * The daily budget is fed from here because this function is already the one
   * place every model call is required to pass through. Counting at the call
   * sites instead would mean a new lane could spend tokens the budget never
   * sees — which is precisely how `/plans/generate` and `/swap-exercise`
   * avoided the strict rate-limit lane from the day they shipped.
   *
   * Ahead of the isTest return: the counter is behaviour worth testing, and a
   * budget that silently does nothing under test is a budget with no tests.
   */
  recordSpend(entry.provider, entry.tokens?.total);
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
  let line: string;
  try {
    // Scrub before merge, so a payload key called `kind` cannot dodge the
    // scrubber by colliding with an envelope field.
    const safe = scrubLogFields(fields) as Record<string, unknown>;
    line = JSON.stringify({ t: new Date().toISOString(), kind: 'event', name, ...safe });
  } catch (err) {
    // Last resort. The alternative to swallowing this is a logger that throws
    // from inside a payment handler and fails the request it was only meant to
    // observe. The event name is safe to keep — it is a literal at every call
    // site — and losing the fields is strictly better than losing the line.
    line = JSON.stringify({
      t: new Date().toISOString(),
      kind: 'event',
      name,
      fieldsOmitted: err instanceof Error ? err.message : 'unserialisable payload',
    });
  }
  // eslint-disable-next-line no-console
  console.log(line);
}
