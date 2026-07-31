import { beforeEach, describe, expect, it } from 'vitest';
import { createCreditLedger, type LedgerContainer } from '../modules/ai/creditLedger';
import { CREDIT_COSTS, FREE_TIER_DAILY_CREDITS } from '@aquazerofit/shared';
import type { CreditTransaction } from '@aquazerofit/shared';

/** In-memory container implementing the JsonStore contract for hermetic tests. */
function memoryContainer(): { container: LedgerContainer; docs: Map<string, CreditTransaction> } {
  const docs = new Map<string, CreditTransaction>();
  return {
    docs,
    container: {
      all: () => [...docs.values()],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: (pred: (d: any) => boolean) => [...docs.values()].filter(pred),
      upsert: (doc: CreditTransaction) => {
        docs.set(doc.id, { ...doc });
      },
      byId: (id: string) => docs.get(id) ?? null,
      delete: (id: string) => {
        docs.delete(id);
      },
    },
  };
}

describe('creditLedger (append-only, balance = fold)', () => {
  let mem: ReturnType<typeof memoryContainer>;
  let ledger: ReturnType<typeof createCreditLedger>;
  const userId = 'u_test';

  beforeEach(() => {
    mem = memoryContainer();
    ledger = createCreditLedger(() => mem.container);
  });

  it('grants the daily allowance exactly once per day', async () => {
    expect(await ledger.grantDailyIfNeeded(userId)).toBe(true);
    expect(await ledger.grantDailyIfNeeded(userId)).toBe(false);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);
    const grants = [...mem.docs.values()].filter((t) => t.kind === 'grant');
    expect(grants).toHaveLength(1);
  });

  it('reserve deducts the task cost from the folded balance', async () => {
    const reservationId = await ledger.reserve(userId, 'chatTurn');
    expect(reservationId).toMatch(/^res_/);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS - CREDIT_COSTS.chatTurn);
  });

  it('commit settles the hold without double-charging', async () => {
    const reservationId = await ledger.reserve(userId, 'mealPhoto');
    expect(await ledger.commit(reservationId)).toBe(true);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS - CREDIT_COSTS.mealPhoto);
    // Idempotent: a second commit is a no-op.
    expect(await ledger.commit(reservationId)).toBe(false);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS - CREDIT_COSTS.mealPhoto);
  });

  it('release returns the held cost in full', async () => {
    const reservationId = await ledger.reserve(userId, 'mealRecommendation');
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS - CREDIT_COSTS.mealRecommendation);
    expect(await ledger.release(reservationId)).toBe(true);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);
    // A released reservation cannot be committed afterwards.
    expect(await ledger.commit(reservationId)).toBe(false);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);
  });

  it('throws CREDITS_INSUFFICIENT when the fold cannot cover the cost', async () => {
    // Drain the daily grant with plan generations (5 credits each).
    for (let i = 0; i < FREE_TIER_DAILY_CREDITS / CREDIT_COSTS.planGeneration; i += 1) {
      const id = await ledger.reserve(userId, 'planGeneration');
      await ledger.commit(id);
    }
    expect(await ledger.balance(userId)).toBe(0);
    await expect(ledger.reserve(userId, 'chatTurn')).rejects.toMatchObject({
      code: 'CREDITS_INSUFFICIENT',
    });
  });

  it('is strictly append-only: no transaction is ever mutated or removed', async () => {
    const reservationId = await ledger.reserve(userId, 'chatTurn');
    const afterReserve = mem.docs.size;
    await ledger.commit(reservationId);
    expect(mem.docs.size).toBeGreaterThan(afterReserve); // commit appended, nothing replaced
    const kinds = [...mem.docs.values()].map((t) => t.kind).sort();
    expect(kinds).toEqual(['commit', 'grant', 'release', 'reserve']);
    // Sign convention from the shared type holds for every doc.
    for (const tx of mem.docs.values()) {
      if (tx.kind === 'grant' || tx.kind === 'release' || tx.kind === 'purchase') {
        expect(tx.amount).toBeGreaterThan(0);
      }
      if (tx.kind === 'commit') expect(tx.amount).toBeLessThan(0);
    }
  });

  it('keeps balances independent per user', async () => {
    await ledger.reserve(userId, 'chatTurn');
    expect(await ledger.balance('u_other')).toBe(0);
    await ledger.grantDailyIfNeeded('u_other');
    expect(await ledger.balance('u_other')).toBe(FREE_TIER_DAILY_CREDITS);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS - CREDIT_COSTS.chatTurn);
  });
});
