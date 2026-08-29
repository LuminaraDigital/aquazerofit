/**
 * Append-only credit ledger (AQF-09 §2.3, brief rule 7).
 *
 * Every movement is a CreditTransaction document; balance is a plain fold
 * (sum of amounts) over the user's transactions:
 *   grant / purchase  → +amount
 *   reserve           → −cost   (hold deducted immediately)
 *   release           → +cost   (cancels an outstanding hold)
 *   commit            → settle: appends release(+cost) + commit(−cost) so the
 *                       plain fold stays correct AND every doc keeps the sign
 *                       convention from the shared type (positive for
 *                       grant/release/purchase, negative for commit).
 *
 * Nothing is ever mutated or deleted — settlement state is derived from the
 * presence of commit/release docs referencing the reservationId.
 */
import crypto from 'node:crypto';
import { AppError } from '../../platform/errors';
import { store } from '../../platform/store';
import { CREDIT_COSTS, FREE_TIER_DAILY_CREDITS } from '@aquazerofit/shared';
import type { CreditTask, CreditTransaction } from '@aquazerofit/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pred = (d: any) => boolean;

export interface LedgerContainer {
  all(): CreditTransaction[] | Promise<CreditTransaction[]>;
  where(pred: Pred): CreditTransaction[] | Promise<CreditTransaction[]>;
  upsert(doc: CreditTransaction): unknown;
  byId(id: string): CreditTransaction | null | undefined | Promise<CreditTransaction | null | undefined>;
  delete(id: string): unknown;
}

/**
 * Transaction id, and — via `res_${txId()}` — the reservation id a caller
 * holds between reserve and commit.
 *
 * crypto.randomUUID, not a timestamp counter: a reservation id is a bearer
 * handle to somebody's credit balance, and the old shape (Date.now() in
 * base36, a module counter, four base36 characters of Math.random()) was
 * about twenty bits of non-cryptographic entropy on a known timestamp, with
 * the counter leaking how many transactions the process had written.
 */
function txId(): string {
  return `ct_${crypto.randomUUID()}`;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CreditLedger {
  grantDailyIfNeeded(userId: string): Promise<boolean>;
  balance(userId: string): Promise<number>;
  reserve(userId: string, task: CreditTask): Promise<string>;
  commit(reservationId: string): Promise<boolean>;
  release(reservationId: string): Promise<boolean>;
}

/**
 * Serialises credit mutations for one key (a userId, or a reservationId).
 *
 * `reserve` is a read-modify-write: grant, fold the balance, check it, append
 * the hold. Nothing between those steps stopped a second concurrent request
 * from reading the same balance and spending it too. It has not misbehaved in
 * production for one reason only — the store serves reads synchronously from
 * memory, so despite the `await`s the whole function completes inside a single
 * microtask drain and never actually suspends.
 *
 * That is an accident of the storage backing, not a property of this code, and
 * it expires the moment any one of three things happens: the async-store
 * refactor lands (`platform/store.ts` names it as pending work), a genuine
 * `await` is added between the read and the write, or the daily grant is moved
 * behind a real query. Each would turn a dormant double-spend into a live one,
 * and the first is a change someone will make for unrelated reasons.
 *
 * So the atomicity is stated here rather than inherited. Chaining per key
 * costs nothing while requests do not overlap and is correct when they do.
 *
 * SCOPE: this is a per-PROCESS lock, which is exactly right today —
 * `assertSingleInstance()` refuses to boot a second serving process. If that
 * guard is ever lifted, this must become a database-level guarantee (a unique
 * constraint on the daily grant, and a conditional write for the hold, in the
 * shape of `pgStore.compareAndSwapRefreshToken`). A per-process lock across
 * two instances is not a lock.
 */
const keyLocks = new Map<string, Promise<unknown>>();

function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = keyLocks.get(key) ?? Promise.resolve();
  // `fn` runs whether the previous holder resolved or threw: one caller's
  // failure must not strand everyone queued behind it.
  const result = prev.then(fn, fn);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  keyLocks.set(key, tail);
  // Drop the entry once nobody is queued behind us, so the map cannot grow
  // one permanent record per user who ever spent a credit.
  void tail.finally(() => {
    if (keyLocks.get(key) === tail) keyLocks.delete(key);
  });
  return result;
}

export function createCreditLedger(getContainer: () => LedgerContainer): CreditLedger {
  async function userTxs(userId: string): Promise<CreditTransaction[]> {
    const rows = await getContainer().where(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d?.userId === userId && d?.type === 'creditTransaction',
    );
    return Array.isArray(rows) ? rows : [];
  }

  async function append(doc: CreditTransaction): Promise<void> {
    await getContainer().upsert(doc);
  }

  async function reservationTxs(reservationId: string): Promise<CreditTransaction[]> {
    const rows = await getContainer().where(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d?.type === 'creditTransaction' && d?.reservationId === reservationId,
    );
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * The grant, WITHOUT taking the lock.
   *
   * Separate because `reserveUnlocked` calls it while already holding the
   * user's lock, and the lock is not reentrant — going through the public
   * method there would wait on a chain this call is itself the head of, and
   * deadlock every credit spend for that user.
   */
  async function grantDailyUnlocked(userId: string): Promise<boolean> {
      const today = todayIsoDate();
      const txs = await userTxs(userId);
      const alreadyGranted = txs.some(
        (t) => t.kind === 'grant' && t.reason === 'dailyGrant' && t.createdAt.slice(0, 10) === today,
      );
      if (alreadyGranted) return false;
      await append({
        id: txId(),
        userId,
        type: 'creditTransaction',
        kind: 'grant',
        amount: FREE_TIER_DAILY_CREDITS,
        reason: 'dailyGrant',
        createdAt: new Date().toISOString(),
      });
      return true;
  }

  async function balanceUnlocked(userId: string): Promise<number> {
    const txs = await userTxs(userId);
    return txs.reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0), 0);
  }

  /** The hold, WITHOUT taking the lock. See [grantDailyUnlocked]. */
  async function reserveUnlocked(userId: string, task: CreditTask): Promise<string> {
      const cost = CREDIT_COSTS[task];
      if (typeof cost !== 'number') {
        throw new AppError('VALIDATION_FAILED', `Unknown credit task: ${String(task)}`);
      }
    await grantDailyUnlocked(userId);
    const available = await balanceUnlocked(userId);
      if (available < cost) {
        throw new AppError(
          'CREDITS_INSUFFICIENT',
          'You have run out of AI credits for today. Credits refresh daily — manual logging is always free.',
          { required: cost, available, task },
        );
      }
      const reservationId = `res_${txId()}`;
      await append({
        id: txId(),
        userId,
        type: 'creditTransaction',
        kind: 'reserve',
        amount: -cost,
        reservationId,
        reason: `reserve:${task}`,
        createdAt: new Date().toISOString(),
      });
      return reservationId;
  }

  return {
    /**
     * One FREE_TIER_DAILY_CREDITS grant per user per UTC day.
     * Serialised per user so two simultaneous requests cannot both decide the
     * grant is missing and issue it.
     */
    grantDailyIfNeeded(userId: string): Promise<boolean> {
      return withKeyLock(userId, () => grantDailyUnlocked(userId));
    },

    /** Balance = fold. No cached counters, ever. */
    balance(userId: string): Promise<number> {
      // Read-only, so it needs no lock of its own — but it queues behind any
      // in-flight mutation for this user, which is what makes a balance read
      // taken immediately after a spend reflect it.
      return withKeyLock(userId, () => balanceUnlocked(userId));
    },

    /**
     * Hold the cost of a task; returns the reservationId to commit/release.
     * Serialised per user: the read of the balance and the write of the hold
     * are one critical section, so two concurrent turns cannot both see the
     * same credits and spend them.
     */
    reserve(userId: string, task: CreditTask): Promise<string> {
      return withKeyLock(userId, () => reserveUnlocked(userId, task));
    },

    /** Settle a reservation as spent. Idempotent; no-op when already settled. */
    async commit(reservationId: string): Promise<boolean> {
      const txs = await reservationTxs(reservationId);
      const reserveTx = txs.find((t) => t.kind === 'reserve');
      const settled = txs.some((t) => t.kind === 'commit' || t.kind === 'release');
      if (!reserveTx || settled) return false;
      const cost = Math.abs(reserveTx.amount);
      const now = new Date().toISOString();
      // Two entries keep the plain fold correct and each doc's sign canonical.
      await append({
        id: txId(),
        userId: reserveTx.userId,
        type: 'creditTransaction',
        kind: 'release',
        amount: cost,
        reservationId,
        reason: 'settleReservation',
        createdAt: now,
      });
      await append({
        id: txId(),
        userId: reserveTx.userId,
        type: 'creditTransaction',
        kind: 'commit',
        amount: -cost,
        reservationId,
        reason: reserveTx.reason.replace(/^reserve:/, 'commit:'),
        createdAt: now,
      });
      return true;
    },

    /** Return a held cost to the balance (task failed or was blocked). */
    async release(reservationId: string): Promise<boolean> {
      const txs = await reservationTxs(reservationId);
      const reserveTx = txs.find((t) => t.kind === 'reserve');
      const settled = txs.some((t) => t.kind === 'commit' || t.kind === 'release');
      if (!reserveTx || settled) return false;
      await append({
        id: txId(),
        userId: reserveTx.userId,
        type: 'creditTransaction',
        kind: 'release',
        amount: Math.abs(reserveTx.amount),
        reservationId,
        reason: 'releaseReservation',
        createdAt: new Date().toISOString(),
      });
      return true;
    },
  };
}

/** Default ledger bound to the platform JsonStore 'ledger' container. */
export const creditLedger: CreditLedger = createCreditLedger(
  () => store.container('ledger') as unknown as LedgerContainer,
);
