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
 * PERSISTENCE: the day's counter is written to the document store after every
 * change and read back the first time it is needed after boot. Held only in
 * memory, every restart handed out a fresh budget - a deploy, a crash, or a
 * crash loop could each spend the whole day's ceiling again.
 *
 * SCOPE: one process. `assertSingleInstance()` refuses to boot a second
 * serving process, so today that is the whole deployment. The stored copy is
 * a restart record, not a shared counter: two live processes would each
 * overwrite the other's total, so lifting that guard still needs an atomic
 * increment in the database.
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

interface StoredDaySpend extends DaySpend {
  id: string;
  type: 'aiBudgetDay';
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function docId(date: string): string {
  return `aiBudget:${date}`;
}

/**
 * The slice of the document store this module uses. Injected at boot rather
 * than imported: the store imports the seed and through it most of the app,
 * and this module sits under telemetry, which nearly everything imports.
 */
export interface BudgetStore {
  byId<T extends { id: string }>(name: 'ai', id: string): T | undefined;
  upsert<T extends { id: string }>(name: 'ai', doc: T): T;
}

let backing: BudgetStore | null = null;

/** null until the first read after boot (or after a reset) has consulted the store. */
let day: DaySpend | null = null;

/** Called once the store is ready. Drops the in-memory day so it is re-read from the store. */
export function attachAiBudgetStore(store: BudgetStore): void {
  backing = store;
  day = null;
}

/** The stored total for `date`, or a fresh day when none was written. */
function load(date: string): DaySpend {
  const saved = backing?.byId<StoredDaySpend>('ai', docId(date));
  if (!saved) return { date, tokens: 0, calls: 0, suppressed: 0 };
  return { date, tokens: saved.tokens, calls: saved.calls, suppressed: saved.suppressed };
}

/** Write the counter through. A failed write must never fail the model call it records. */
function persist(state: DaySpend): void {
  try {
    backing?.upsert<StoredDaySpend>('ai', { id: docId(state.date), type: 'aiBudgetDay', ...state });
  } catch {
    // The in-memory counter still holds the ceiling until the next restart.
  }
}

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
  if (day?.date !== today) day = load(today);
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
  persist(state);
}

/** Record that a call was served from the offline engine to protect the budget. */
export function recordSuppressed(): void {
  const state = current();
  state.suppressed += 1;
  persist(state);
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

/** Test/ops hook: zero today's counter, in memory and in the store. */
export function resetAiBudget(): void {
  day = { date: todayUtc(), tokens: 0, calls: 0, suppressed: 0 };
  persist(day);
}
