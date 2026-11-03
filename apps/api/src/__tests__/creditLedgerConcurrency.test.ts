import { describe, expect, it } from 'vitest';
import { createCreditLedger, type LedgerContainer } from '../modules/ai/creditLedger';
import { CREDIT_COSTS, FREE_TIER_DAILY_CREDITS } from '@aquazerofit/shared';
import type { CreditTransaction } from '@aquazerofit/shared';

/**
 * Can two simultaneous AI requests from one user spend the same credits twice?
 *
 * `reserve` is a read-modify-write — grant, fold the balance, check it, append
 * the hold — and today it is safe only because the store answers reads
 * synchronously from memory, so the whole function completes in one microtask
 * drain and never actually suspends. That is a property of the storage
 * backing, not of the ledger, and `platform/store.ts` records the async
 * conversion as pending work.
 *
 * So these tests do not use the synchronous container the other ledger tests
 * use. They use one that genuinely suspends between the read and the write,
 * which is what the store will do after that refactor. Without the per-user
 * lock every one of them fails; with it they pass, and the refactor cannot
 * quietly turn a dormant double-spend into a live one.
 */
function suspendingContainer(): LedgerContainer {
  const docs = new Map<string, CreditTransaction>();
  // A real macrotask hop. This is the whole point: it is the suspension the
  // in-memory store does not currently have and a queried store will.
  const yieldToLoop = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    all: () => [...docs.values()],
    where: (async (pred: (d: CreditTransaction) => boolean) => {
      await yieldToLoop();
      return [...docs.values()].filter(pred);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    upsert: (async (doc: CreditTransaction) => {
      await yieldToLoop();
      docs.set(doc.id, { ...doc });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    byId: (id: string) => docs.get(id) ?? null,
    delete: (id: string) => {
      docs.delete(id);
    },
  };
}

/** One container instance for the whole ledger — `createCreditLedger` calls
 *  its getter on every access, so passing the factory would hand each call a
 *  fresh, empty store. */
function ledgerOver(container: LedgerContainer) {
  return createCreditLedger(() => container);
}

describe('creditLedger concurrency (the async-store landmine)', () => {
  const userId = 'u_race';

  it('never lets concurrent reserves overdraw the daily grant', async () => {
    const ledger = ledgerOver(suspendingContainer());
    const cost = CREDIT_COSTS.chatTurn;
    const affordable = Math.floor(FREE_TIER_DAILY_CREDITS / cost);

    // Fire twice as many turns as the day can pay for, all at once.
    const attempts = await Promise.allSettled(
      Array.from({ length: affordable * 2 }, () => ledger.reserve(userId, 'chatTurn')),
    );
    const granted = attempts.filter((a) => a.status === 'fulfilled').length;

    expect(granted).toBe(affordable);
    // The balance is a fold over an append-only log, so an overdraw shows up
    // here as a negative number rather than as a thrown error.
    expect(await ledger.balance(userId)).toBeGreaterThanOrEqual(0);
  });

  it('issues exactly one daily grant when asked concurrently', async () => {
    const ledger = ledgerOver(suspendingContainer());

    const results = await Promise.all(
      Array.from({ length: 8 }, () => ledger.grantDailyIfNeeded(userId)),
    );

    // Exactly one caller should observe that it created the grant.
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);
  });

  it('rejects the overdrawing turn rather than letting it through unpaid', async () => {
    const ledger = ledgerOver(suspendingContainer());
    const cost = CREDIT_COSTS.chatTurn;
    const affordable = Math.floor(FREE_TIER_DAILY_CREDITS / cost);

    const attempts = await Promise.allSettled(
      Array.from({ length: affordable + 1 }, () => ledger.reserve(userId, 'chatTurn')),
    );
    const refused = attempts.filter((a) => a.status === 'rejected');

    expect(refused).toHaveLength(1);
    // A refusal has to be the explicit out-of-credits error, not an incidental
    // crash that a caller might treat as a transient failure and retry.
    const reason = (refused[0] as PromiseRejectedResult).reason as { code?: string };
    expect(reason.code).toBe('CREDITS_INSUFFICIENT');
  });

  it('does not strand queued callers when one of them fails', async () => {
    // The lock chains on both settle paths for exactly this reason: a throw
    // inside the critical section must not wedge everyone behind it.
    const ledger = ledgerOver(suspendingContainer());

    const bad = ledger.reserve(userId, 'nonsense' as never).catch(() => 'refused');
    const good = ledger.reserve(userId, 'chatTurn');

    expect(await bad).toBe('refused');
    expect(await good).toMatch(/^res_/);
  });
});
