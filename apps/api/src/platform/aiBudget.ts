/**
 * Global daily token budget — the deployment-wide ceiling on model spend.
 *
 * Everything else in this product bounds cost PER USER: the credit ledger, the
 * daily grant, the carry-over ceiling, the per-minute lanes. None of them
 * bounds the total. A thousand users each spending exactly their honest
 * allowance is a bill nobody authorised, and the operator's first signal under
 * the old arrangement was the invoice.
 *
 * So this counts tokens across the whole deployment for one UTC day, and once
 * the day's budget is gone the gateway stops calling real providers and serves
 * its offline engine instead. Every AI feature already survives that path —
 * it is the same fallback used when providers fail — so the app keeps working
 * and the spending stops. Degraded output is never billed to a user's credits
 * either (the lanes release their holds on `degraded`), so an exhausted budget
 * costs the operator nothing further and costs the user nothing at all.
 *
 * WHAT IS COUNTED: real-provider calls only. The offline engine is free, so
 * counting its output would let a budget exhaust itself while spending nothing.
 *
 * WHAT IS NOT COUNTED: tokens a provider consumed on a call that failed before
 * reporting usage. A provider that times out mid-generation has spent real
 * tokens this counter never sees. The budget is therefore a floor on spend,
 * not an exact meter — set it with headroom rather than at the exact number
 * you can afford.
 *
 * SCOPE: one process. `assertSingleInstance()` refuses to boot a second
 * serving process, so today that is the whole deployment. If that guard is
 * ever lifted this must move to a shared store, because two processes each
 * holding half a budget is two budgets.
 */
import { config } from './config';

interface DaySpend {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  tokens: number;
  /** Real-provider calls that contributed, for the operator snapshot. */
  calls: number;
  /** Calls refused because the budget was already gone. */
  suppressed: number;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

let day: DaySpend = { date: todayUtc(), tokens: 0, calls: 0, suppressed: 0 };

/**
 * Roll the counter when the UTC day changes.
 *
 * Checked on read rather than driven by a timer: a timer would have to survive
 * suspension and clock changes to be correct, where comparing the date on the
 * way past cannot drift. The budget resets at UTC midnight regardless of where
 * the operator lives, which matches how the credit grant already works.
 */
function current(): DaySpend {
  const today = todayUtc();
  if (day.date !== today) {
    day = { date: today, tokens: 0, calls: 0, suppressed: 0 };
  }
  return day;
}

/**
 * True when real providers must not be called again today.
 *
 * An unset or zero budget means no ceiling, which is the default: a deployment
 * that has not opted in must not suddenly start serving degraded output
 * because a new setting defaulted to some number this file invented.
 */
export function budgetExhausted(): boolean {
  const limit = config.dailyTokenBudget;
  if (limit <= 0) return false;
  return current().tokens >= limit;
}

/**
 * Record what a completed model call cost.
 *
 * Called from `logAiCall`, which every model call in the product already goes
 * through — putting it anywhere else would mean a lane could be added that
 * spends tokens this counter never sees, which is exactly how the plan lane
 * escaped the rate limiter for so long.
 */
export function recordSpend(provider: string, tokens: number | undefined): void {
  if (provider === 'mock') return; // the offline engine is free
  const spent = typeof tokens === 'number' && Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
  const state = current();
  state.tokens += spent;
  state.calls += 1;
}

/** Record that a call was served from the offline engine to protect the budget. */
export function recordSuppressed(): void {
  current().suppressed += 1;
}

/** Operator snapshot for GET /metrics. */
export function budgetSnapshot(): {
  date: string;
  tokensSpent: number;
  tokenBudget: number | null;
  providerCalls: number;
  suppressedCalls: number;
  exhausted: boolean;
} {
  const state = current();
  const limit = config.dailyTokenBudget;
  return {
    date: state.date,
    tokensSpent: state.tokens,
    tokenBudget: limit > 0 ? limit : null,
    providerCalls: state.calls,
    suppressedCalls: state.suppressed,
    exhausted: budgetExhausted(),
  };
}

/** Test/ops hook. */
export function resetAiBudget(): void {
  day = { date: todayUtc(), tokens: 0, calls: 0, suppressed: 0 };
}
