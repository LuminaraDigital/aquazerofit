/**
 * Hourly storage budgets for growth telemetry — defence in depth behind the
 * per-minute rate limiter (platform/rateLimiter.ts).
 *
 * /analytics/events is the API's only unauthenticated write. The per-minute
 * limiter caps burst rate, but 30/min still admits ~1,800 writes an hour from
 * one IP — enough for a single bad actor to grow the audit container for as
 * long as the deployment lives (retention only prunes documents older than
 * GROWTH_EVENT_RETENTION_DAYS). These budgets cap what is actually persisted
 * per hour. Excess events are acknowledged and dropped: the response is
 * indistinguishable from a stored write, so a prober cannot map the budget,
 * and a legitimate client loses nothing it would ever read back.
 *
 * Fixed one-hour windows in process memory. A window that has aged out is
 * discarded wholesale and the next event starts a fresh window at count 1 —
 * the old count never carries over, so an IP that filled one hour is never
 * blocked in the next. Restart forgives all counters; that only ever admits
 * more traffic, never blocks legitimate traffic.
 */

/** Persisted events per hour for one authenticated user. */
export const EVENT_BUDGET_PER_HOUR = 600;

/** Persisted events per hour for one source IP with no account attached. */
export const ANON_IP_EVENT_BUDGET_PER_HOUR = 60;

const WINDOW_MS = 3_600_000;

/** Opportunistic prune threshold so the key set cannot grow unbounded. */
const PRUNE_ABOVE = 5_000;

interface BudgetWindow {
  start: number;
  count: number;
}

const windows = new Map<string, BudgetWindow>();

/**
 * Consume one unit of budget for `key`. Returns true when the event fits the
 * current window and should be persisted. `now` is injectable so tests can
 * prove the window actually resets after an hour.
 */
export function consumeEventBudget(key: string, limit: number, now = Date.now()): boolean {
  if (windows.size > PRUNE_ABOVE) pruneEventBudgets(now);
  const w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS) {
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  if (w.count >= limit) return false;
  w.count += 1;
  return true;
}

/** Drop windows older than one hour; called opportunistically, cheap to call. */
export function pruneEventBudgets(now = Date.now()): void {
  for (const [key, w] of windows) {
    if (now - w.start >= WINDOW_MS) windows.delete(key);
  }
}

/** Test/ops hook. */
export function resetEventBudgets(): void {
  windows.clear();
}
