/**
 * The deployment-wide daily token budget and its kill switch.
 *
 * Every other cost control in this product is per user. This is the only one
 * that bounds the total, so it is the only one that answers "what is the most
 * this can cost me today" — the question the whole cost-control programme
 * exists for. It gets tests for the same reason the credit ledger does.
 *
 * The gateway cases drive `complete()` with a fake provider key present, so
 * the provider chain is genuinely entered and genuinely skipped rather than
 * being absent either way — a keyless run would land on the offline engine for
 * reasons that have nothing to do with the budget and prove nothing.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  budgetExhausted,
  budgetSnapshot,
  recordSpend,
  recordSuppressed,
  resetAiBudget,
} from '../platform/aiBudget';
import { complete, resetProviderCircuits } from '../modules/ai/gateway';

const BUDGET_ENV = 'AZF_DAILY_TOKEN_BUDGET';
/*
 * Every provider key, not just the one these tests set. A developer's local
 * `.env` carrying a real GEMINI or OPENAI key would otherwise put a
 * credentialed provider in play behind the test's back, and "degraded because
 * a real provider failed" would be indistinguishable from "degraded because
 * the budget stopped us" — which is the single distinction under test.
 */
const PROVIDER_KEY_ENVS = [
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'NVIDIA_API_KEY',
  'OLLAMA_API_KEY',
  'OLLAMA_BASE_URL',
  'NVIDIA_BASE_URL',
];

const saved: Record<string, string | undefined> = Object.fromEntries(
  [BUDGET_ENV, ...PROVIDER_KEY_ENVS].map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  resetAiBudget();
  resetProviderCircuits();
  delete process.env[BUDGET_ENV];
  for (const key of PROVIDER_KEY_ENVS) delete process.env[key];
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetAiBudget();
  resetProviderCircuits();
});

describe('daily token budget accounting', () => {
  /*
   * The default has to be "no ceiling". A deployment that never opted in must
   * not start serving template output because a setting it did not choose had
   * an opinion about what it could afford.
   */
  it('imposes no ceiling when unset', () => {
    recordSpend('groq', 10_000_000);
    expect(budgetExhausted()).toBe(false);
    expect(budgetSnapshot().tokenBudget).toBeNull();
  });

  it('treats a zero, negative or unparseable budget as no ceiling', () => {
    for (const raw of ['0', '-5', 'lots', '']) {
      resetAiBudget();
      process.env[BUDGET_ENV] = raw;
      recordSpend('groq', 5_000);
      expect(budgetExhausted()).toBe(false);
    }
  });

  it('exhausts once spend reaches the ceiling', () => {
    process.env[BUDGET_ENV] = '1000';
    recordSpend('groq', 999);
    expect(budgetExhausted()).toBe(false);
    recordSpend('groq', 1);
    expect(budgetExhausted()).toBe(true);
  });

  /*
   * The offline engine costs nothing, so counting its output would let a
   * budget exhaust itself while spending no money at all — and because an
   * exhausted budget routes everything to that same engine, the counter would
   * then hold itself shut forever on the strength of its own free output.
   */
  it('does not count the offline engine against the budget', () => {
    process.env[BUDGET_ENV] = '100';
    recordSpend('mock', 1_000_000);
    expect(budgetExhausted()).toBe(false);
    expect(budgetSnapshot().tokensSpent).toBe(0);
    expect(budgetSnapshot().providerCalls).toBe(0);
  });

  it('tolerates a provider that reports no usage', () => {
    process.env[BUDGET_ENV] = '100';
    recordSpend('groq', undefined);
    recordSpend('groq', Number.NaN);
    const snapshot = budgetSnapshot();
    // The call is counted even though its tokens are unknown: the operator
    // needs to see that real providers were reached. Spend stays honest at 0
    // rather than being guessed at.
    expect(snapshot.providerCalls).toBe(2);
    expect(snapshot.tokensSpent).toBe(0);
  });

  it('reports a snapshot an operator can act on', () => {
    process.env[BUDGET_ENV] = '500';
    recordSpend('groq', 500);
    recordSuppressed();
    expect(budgetSnapshot()).toMatchObject({
      tokensSpent: 500,
      tokenBudget: 500,
      providerCalls: 1,
      suppressedCalls: 1,
      exhausted: true,
    });
  });
});

describe('the kill switch in the gateway', () => {
  it('does not mark the keyless path degraded — the offline engine IS the product there', async () => {
    const result = await complete('safetyCheap', [{ role: 'user', content: 'hello' }], {});
    expect(result.meta.degraded).not.toBe(true);
    expect(result.meta.degradedReason).toBeUndefined();
  });

  /*
   * The load-bearing case. Past the ceiling the provider chain must not be
   * entered at all — not attempted-and-abandoned, not tried once. `fetch` is
   * spied on because a call that reaches the network has already cost money,
   * which is the exact thing the budget exists to prevent.
   */
  it('serves the offline engine without touching a provider once exhausted', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    process.env[BUDGET_ENV] = '100';
    recordSpend('groq', 100);
    expect(budgetExhausted()).toBe(true);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await complete('safetyCheap', [{ role: 'user', content: 'hello' }], {});

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.text.length).toBeGreaterThan(0);
    // Degraded, so every lane that bills credits releases its hold: the user
    // must not pay for the operator's ceiling.
    expect(result.meta.degraded).toBe(true);
    expect(result.meta.degradedReason).toBe('budget_exhausted');
    expect(budgetSnapshot().suppressedCalls).toBeGreaterThan(0);
  });

  it('lets providers be reached again while the budget still has room', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    process.env[BUDGET_ENV] = '1000';
    recordSpend('groq', 10);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const result = await complete('safetyCheap', [{ role: 'user', content: 'hello' }], {});

    // The chain WAS entered — the budget is not silently holding it shut.
    expect(fetchSpy).toHaveBeenCalled();
    // It failed, so this is the ordinary degraded path, not the budget one.
    expect(result.meta.degradedReason).toBe('provider_failure');
  });
});
