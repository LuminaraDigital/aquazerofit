import { beforeEach, describe, expect, it } from 'vitest';
import {
  STALE_RESERVATION_MS,
  createCreditLedger,
  type LedgerContainer,
} from '../modules/ai/creditLedger';
import {
  CREDIT_COSTS,
  FREE_TIER_DAILY_CREDITS,
  MAX_BANKED_CREDITS,
  PREMIUM_TIER_DAILY_CREDITS,
  maxBankedCreditsFor,
} from '@aquazerofit/shared';
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

  /*
   * The carry-over ceiling.
   *
   * Before it, the balance was a fold with no upper bound: an account that
   * triggered the grant daily without spending banked one day's credits per
   * day indefinitely, then could discharge a month of them in one sitting.
   * The daily grant bounded the long-run average and nothing else.
   *
   * Yesterday's date on the seeded grant is what makes `alreadyGranted` false
   * for the call under test — the grant is keyed to the UTC day, so a row
   * dated today would short-circuit before reaching the clamp.
   */
  describe('the daily grant tops up toward MAX_BANKED_CREDITS, never past it', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    function seedBalance(amount: number): void {
      mem.container.upsert({
        id: 'ct_seed',
        userId,
        type: 'creditTransaction',
        kind: 'grant',
        amount,
        reason: 'dailyGrant',
        createdAt: yesterday,
      } as CreditTransaction);
    }

    it('tops up only the shortfall when a carried balance is near the ceiling', async () => {
      // Shortfall deliberately SMALLER than a day's grant, so the clamp is what
      // decides the outcome rather than the allowance. A fixed offset breaks
      // silently the moment the tier's numbers are repriced, which is exactly
      // what happened when the free tier moved from 50 to 10.
      const shortfall = Math.max(1, Math.floor(FREE_TIER_DAILY_CREDITS / 2));
      seedBalance(MAX_BANKED_CREDITS - shortfall);

      expect(await ledger.grantDailyIfNeeded(userId)).toBe(true);
      expect(await ledger.balance(userId)).toBe(MAX_BANKED_CREDITS);
    });

    it('grants nothing to a balance already at the ceiling', async () => {
      seedBalance(MAX_BANKED_CREDITS);

      await ledger.grantDailyIfNeeded(userId);
      expect(await ledger.balance(userId)).toBe(MAX_BANKED_CREDITS);
    });

    /*
     * The zero-amount row is load-bearing, not noise. It is what keeps
     * `alreadyGranted` true for the rest of the day: skip writing it and the
     * next reserve re-runs the grant branch, sees headroom freed by the spend
     * that just happened, and tops up again — turning the ceiling into
     * "restore to MAX_BANKED_CREDITS on demand", which is strictly more
     * generous than the uncapped behaviour it replaced.
     */
    it('still records the grant decision at the ceiling, so spending cannot re-open it', async () => {
      seedBalance(MAX_BANKED_CREDITS);
      await ledger.grantDailyIfNeeded(userId);

      await ledger.reserve(userId, 'planGeneration');
      const afterSpend = await ledger.balance(userId);
      expect(afterSpend).toBe(MAX_BANKED_CREDITS - CREDIT_COSTS.planGeneration);

      // A second grant attempt the same day must be refused outright.
      expect(await ledger.grantDailyIfNeeded(userId)).toBe(false);
      expect(await ledger.balance(userId)).toBe(afterSpend);
    });
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

/**
 * An async container — the one that actually exercises the lock.
 *
 * `memoryContainer` above answers reads synchronously, which is precisely why
 * the double-spend was dormant rather than absent: despite the `await`s,
 * reserve/commit completed inside one microtask drain and never suspended.
 * `platform/store.ts` names the async-store refactor as pending work, so this
 * container is what production looks like after it lands.
 */
function asyncMemoryContainer(): { container: LedgerContainer; docs: Map<string, CreditTransaction> } {
  const base = memoryContainer();
  const yieldTurn = () => new Promise((r) => setTimeout(r, 0));
  return {
    docs: base.docs,
    container: {
      all: async () => {
        await yieldTurn();
        return base.container.all() as CreditTransaction[];
      },
      // The snapshot is taken NOW and delivered LATER — which is what a real
      // query does, and what makes the read-modify-write window real. Yielding
      // *before* reading would let each caller's append land in a microtask
      // ahead of the next caller's read, serialising them by accident and
      // hiding the very race this container exists to expose.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: (pred: (d: any) => boolean) => {
        const snapshot = base.container.where(pred) as CreditTransaction[];
        return yieldTurn().then(() => snapshot);
      },
      upsert: (doc: CreditTransaction) => base.container.upsert(doc),
      byId: (id: string) => base.container.byId(id),
      delete: (id: string) => base.container.delete(id),
    },
  };
}

describe('creditLedger concurrency (the lock is the invariant)', () => {
  let mem: ReturnType<typeof asyncMemoryContainer>;
  let ledger: ReturnType<typeof createCreditLedger>;
  const userId = 'u_race';

  beforeEach(() => {
    mem = asyncMemoryContainer();
    ledger = createCreditLedger(() => mem.container);
  });

  it('issues exactly one daily grant under concurrent reads', async () => {
    // GET /me/entitlements calls grantDailyIfNeeded on a plain read and sits in
    // the 300/min default lane, so this is reachable by anyone with a token.
    await Promise.all(Array.from({ length: 40 }, () => ledger.grantDailyIfNeeded(userId)));

    const grants = [...mem.docs.values()].filter((t) => t.kind === 'grant');
    expect(grants).toHaveLength(1);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);
  });

  it('never lets concurrent reserves overspend the balance', async () => {
    await ledger.grantDailyIfNeeded(userId);
    const budget = FREE_TIER_DAILY_CREDITS;
    const cost = CREDIT_COSTS.chatTurn;
    const affordable = Math.floor(budget / cost);

    const attempts = await Promise.allSettled(
      Array.from({ length: affordable + 15 }, () => ledger.reserve(userId, 'chatTurn')),
    );
    const granted = attempts.filter((a) => a.status === 'fulfilled').length;

    expect(granted).toBe(affordable);
    expect(await ledger.balance(userId)).toBeGreaterThanOrEqual(0);
  });

  it('settles a reservation once even when committed concurrently', async () => {
    await ledger.grantDailyIfNeeded(userId);
    const reservationId = await ledger.reserve(userId, 'chatTurn');
    const before = await ledger.balance(userId);

    const results = await Promise.all(
      Array.from({ length: 12 }, () => ledger.commit(reservationId)),
    );

    // Exactly one caller settles; the rest are no-ops.
    expect(results.filter(Boolean)).toHaveLength(1);
    const commits = [...mem.docs.values()].filter(
      (t) => t.kind === 'commit' && t.reservationId === reservationId,
    );
    expect(commits).toHaveLength(1);
    // The hold was already deducted at reserve time, so settling nets to zero.
    expect(await ledger.balance(userId)).toBe(before);
  });

  it('does not both commit and release the same reservation', async () => {
    await ledger.grantDailyIfNeeded(userId);
    const reservationId = await ledger.reserve(userId, 'chatTurn');

    await Promise.all([ledger.commit(reservationId), ledger.release(reservationId)]);

    const settlements = [...mem.docs.values()].filter(
      (t) => t.reservationId === reservationId && (t.kind === 'commit' || t.kind === 'release'),
    );
    // A commit writes a release+commit pair; a release writes one release.
    // Either outcome is fine — both happening is not.
    const hasCommit = settlements.some((t) => t.kind === 'commit');
    expect(settlements.length).toBe(hasCommit ? 2 : 1);
  });
});

/**
 * Upgrading mid-day.
 *
 * The credit allowance IS the paywall, so the moment a subscription is paid for
 * is the moment the allowance has to move. It did not: the grant asked only
 * "was there a grant today", so anyone who opened the app on the free tier
 * before subscribing kept ten credits until the next UTC day — they paid, the
 * plan screen refreshed, and the number on it stayed exactly where it was.
 *
 * That is indistinguishable from a purchase that failed, on the one screen
 * where the user is looking for confirmation that it did not.
 */
describe('the daily grant follows the tier the account is on now', () => {
  let mem: ReturnType<typeof memoryContainer>;
  let ledger: ReturnType<typeof createCreditLedger>;
  const userId = 'u_upgrade';

  beforeEach(() => {
    mem = memoryContainer();
    ledger = createCreditLedger(() => mem.container);
  });

  it('tops a free account up to the premium allowance on the day it subscribes', async () => {
    await ledger.grantDailyIfNeeded(userId, 'free');
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);

    expect(await ledger.grantDailyIfNeeded(userId, 'premium')).toBe(true);
    // The DIFFERENCE, not a second full allowance stacked on the first.
    expect(await ledger.balance(userId)).toBe(PREMIUM_TIER_DAILY_CREDITS);
  });

  it('counts what was already spent, rather than restoring the day to full', async () => {
    await ledger.grantDailyIfNeeded(userId, 'free');
    const reservationId = await ledger.reserve(userId, 'planGeneration', 'free');
    await ledger.commit(reservationId);
    const spent = CREDIT_COSTS.planGeneration;

    await ledger.grantDailyIfNeeded(userId, 'premium');
    expect(await ledger.balance(userId)).toBe(PREMIUM_TIER_DAILY_CREDITS - spent);
  });

  it('is idempotent once the premium allowance has been issued', async () => {
    await ledger.grantDailyIfNeeded(userId, 'free');
    expect(await ledger.grantDailyIfNeeded(userId, 'premium')).toBe(true);
    // Every later read of /me/entitlements calls this again. It must be a
    // no-op, or the top-up becomes "restore to the premium allowance on
    // demand" and the daily cap stops bounding anything.
    expect(await ledger.grantDailyIfNeeded(userId, 'premium')).toBe(false);
    expect(await ledger.grantDailyIfNeeded(userId, 'premium')).toBe(false);
    expect(await ledger.balance(userId)).toBe(PREMIUM_TIER_DAILY_CREDITS);
  });

  it('does not hand a second allowance to an account that lapsed the same day', async () => {
    await ledger.grantDailyIfNeeded(userId, 'premium');
    expect(await ledger.balance(userId)).toBe(PREMIUM_TIER_DAILY_CREDITS);

    // A refund or a revoke lands: the account is free again, having already had
    // today's credits. The free grant must not run on top of them.
    expect(await ledger.grantDailyIfNeeded(userId, 'free')).toBe(false);
    expect(await ledger.balance(userId)).toBe(PREMIUM_TIER_DAILY_CREDITS);
  });

  it('still clamps the upgrade top-up to the premium banking ceiling', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    mem.container.upsert({
      id: 'ct_banked',
      userId,
      type: 'creditTransaction',
      kind: 'grant',
      amount: maxBankedCreditsFor('premium'),
      reason: 'dailyGrant',
      createdAt: yesterday,
    } as CreditTransaction);

    await ledger.grantDailyIfNeeded(userId, 'premium');
    expect(await ledger.balance(userId)).toBe(maxBankedCreditsFor('premium'));
  });
});

/**
 * Holds nothing will ever settle.
 *
 * Every lane releases its own reservation on every branch it can reach. None of
 * them covers the process stopping between the reserve and the settle, and
 * against an append-only ledger that loss is permanent — the user is short
 * those credits for good, for a request that produced nothing.
 */
describe('sweepStaleReservations', () => {
  let mem: ReturnType<typeof memoryContainer>;
  let ledger: ReturnType<typeof createCreditLedger>;
  const userId = 'u_orphan';
  /** Comfortably past STALE_RESERVATION_MS, whatever it is set to. */
  const wellPastCutoff = STALE_RESERVATION_MS * 2;

  beforeEach(() => {
    mem = memoryContainer();
    ledger = createCreditLedger(() => mem.container);
  });

  /** Backdate a hold so it looks like one the process died holding. */
  function ageReservation(reservationId: string, byMs: number): void {
    for (const tx of mem.docs.values()) {
      if (tx.reservationId === reservationId && tx.kind === 'reserve') {
        mem.container.upsert({
          ...tx,
          createdAt: new Date(Date.parse(tx.createdAt) - byMs).toISOString(),
        });
      }
    }
  }

  it('returns a hold the process died holding', async () => {
    await ledger.grantDailyIfNeeded(userId);
    const reservationId = await ledger.reserve(userId, 'planGeneration');
    ageReservation(reservationId, wellPastCutoff);

    expect(await ledger.sweepStaleReservations()).toBe(1);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);
  });

  /*
   * The case that decides the cutoff. A meal photo that has been analysed but
   * not yet confirmed holds its reservation until the user answers, and the
   * vision sweep gives them a day to do it — so a backstop that fired sooner
   * would refund a scan the user then confirms, and the confirmation would find
   * the reservation settled and charge nothing.
   */
  it('leaves a hold that is still young enough to belong to a live request', async () => {
    await ledger.grantDailyIfNeeded(userId);
    const pending = await ledger.reserve(userId, 'planGeneration');
    ageReservation(pending, STALE_RESERVATION_MS / 2);

    expect(await ledger.sweepStaleReservations()).toBe(0);
    expect(await ledger.balance(userId)).toBe(
      FREE_TIER_DAILY_CREDITS - CREDIT_COSTS.planGeneration,
    );
  });

  it('does not refund a reservation that was already committed', async () => {
    await ledger.grantDailyIfNeeded(userId);
    const reservationId = await ledger.reserve(userId, 'chatTurn');
    await ledger.commit(reservationId);
    ageReservation(reservationId, wellPastCutoff);
    const settled = await ledger.balance(userId);

    expect(await ledger.sweepStaleReservations()).toBe(0);
    expect(await ledger.balance(userId)).toBe(settled);
  });

  it('is idempotent — a second sweep finds nothing left to return', async () => {
    await ledger.grantDailyIfNeeded(userId);
    const reservationId = await ledger.reserve(userId, 'chatTurn');
    ageReservation(reservationId, wellPastCutoff);

    expect(await ledger.sweepStaleReservations()).toBe(1);
    expect(await ledger.sweepStaleReservations()).toBe(0);
    expect(await ledger.balance(userId)).toBe(FREE_TIER_DAILY_CREDITS);
  });
});
