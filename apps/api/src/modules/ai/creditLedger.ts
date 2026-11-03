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
import { utcToday } from '../../platform/dates';
import { store } from '../../platform/store';
import { CREDIT_COSTS, dailyCreditsFor, maxBankedCreditsFor } from '@aquazerofit/shared';
import type { UserTier } from '@aquazerofit/shared';
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

/**
 * Reasons that mark a row as the day's allowance, one per tier.
 *
 * The tier has to be recorded somewhere, because "has today's grant already
 * happened?" is not the same question as "has today's grant happened at the
 * allowance this account is now entitled to?" — and the second is the one that
 * matters to somebody who upgrades at lunchtime. It rides in `reason` because
 * the shared `CreditTransaction` has no field for it and inventing one would
 * change a type both clients decode.
 *
 * The free-tier value is the bare string every row written before this existed
 * already carries, so nothing has to be migrated and nothing that greps for it
 * changes meaning.
 */
const FREE_DAILY_GRANT_REASON = 'dailyGrant';
const PREMIUM_DAILY_GRANT_REASON = 'dailyGrant:premium';

function dailyGrantReasonFor(tier: UserTier): string {
  return tier === 'premium' ? PREMIUM_DAILY_GRANT_REASON : FREE_DAILY_GRANT_REASON;
}

function isDailyGrant(t: CreditTransaction): boolean {
  return (
    t.kind === 'grant' &&
    (t.reason === FREE_DAILY_GRANT_REASON || t.reason === PREMIUM_DAILY_GRANT_REASON)
  );
}

/**
 * How long a hold may sit unsettled before [CreditLedger.sweepStaleReservations]
 * treats it as abandoned.
 *
 * Every request path releases its own hold on every failure branch, so the only
 * way one survives is for the process to stop between the reserve and the
 * settle — a crash, an OOM kill, a deploy mid-request. The hold is then
 * permanent: the ledger is append-only and nothing else references that
 * reservation id ever again, so the user is simply short those credits for
 * good.
 *
 * TWENTY-SIX HOURS, and the number is not arbitrary. The obvious choice — an
 * hour, comfortably past the slowest synchronous lane — is wrong, because not
 * every hold belongs to a request. A meal photo that has been analysed but not
 * yet confirmed keeps its reservation until the user answers, and
 * `sweepVisionArtifacts` gives them a full day to do it before releasing on
 * their behalf. A sweep that fired at an hour would hand those credits back and
 * then find the reservation settled when the confirmation finally arrived, so
 * the scan the user did confirm would be free.
 *
 * This is therefore a BACKSTOP, deliberately sitting outside the longest
 * legitimate hold in the product rather than competing with the lane-specific
 * sweeps. Anything still outstanding a day later is not waiting on a person.
 */
export const STALE_RESERVATION_MS = 26 * 60 * 60 * 1000;

export interface CreditLedger {
  grantDailyIfNeeded(userId: string, tier?: UserTier): Promise<boolean>;
  balance(userId: string): Promise<number>;
  reserve(userId: string, task: CreditTask, tier?: UserTier): Promise<string>;
  commit(reservationId: string): Promise<boolean>;
  release(reservationId: string): Promise<boolean>;
  /**
   * Return every hold left unsettled for longer than [olderThanMs]. Returns how
   * many were actually released.
   */
  sweepStaleReservations(olderThanMs?: number, now?: number): Promise<number>;
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
  async function grantDailyUnlocked(userId: string, tier: UserTier = 'free'): Promise<boolean> {
      const today = utcToday();
      const txs = await userTxs(userId);
      const todaysGrants = txs.filter(
        (t) => isDailyGrant(t) && t.createdAt.slice(0, 10) === today,
      );
      const reason = dailyGrantReasonFor(tier);
      /*
       * Settled for today at this allowance or a better one.
       *
       * The premium arm is what makes an upgrade land the same day. Before it,
       * the grant asked only "was there a grant today", so somebody who used
       * the app on the free tier in the morning and subscribed in the afternoon
       * kept their ten credits until the next UTC day: they paid, the plan
       * screen refreshed, and the number did not move. That is the single worst
       * moment for a subscription to appear not to work, and it looks identical
       * to a broken purchase.
       *
       * It reads as "or a premium row exists" rather than comparing allowances,
       * so the reverse direction is covered by the same line: an account that
       * was premium this morning and is free this afternoon — a refund, a
       * revoke — has already had its day's credits and is not topped up again
       * at the lower tier.
       */
      if (todaysGrants.some((t) => t.reason === reason || t.reason === PREMIUM_DAILY_GRANT_REASON)) {
        return false;
      }

      /*
       * Top up TOWARD the ceiling, never past it.
       *
       * The balance is a plain fold with no upper bound, so before this clamp
       * an account that triggered the grant daily without spending banked one
       * FREE_TIER_DAILY_CREDITS per day forever, then could discharge the
       * whole stockpile in a single sitting. The daily grant was doing nothing
       * to bound cost per user per day; it bounded only the long-run average.
       *
       * The write happens even when `topUp` is 0. A zero-amount grant is a
       * no-op on the fold but it is what keeps `alreadyGranted` true for the
       * rest of the day — skip it and the next reserve re-runs this branch,
       * sees room freed by the intervening spend, and tops up again. That
       * turns the ceiling into "restore to MAX_BANKED_CREDITS on demand",
       * which is strictly more generous than the uncapped behaviour it was
       * meant to replace. It also leaves an honest audit row: on this day the
       * grant was assessed and came to nothing.
       */
      const daily = dailyCreditsFor(tier);
      const ceiling = maxBankedCreditsFor(tier);
      const current = txs.reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0), 0);
      // What today has already provided, so the upgrade path tops up the
      // DIFFERENCE rather than granting a second full allowance on top of the
      // free one. Zero on an ordinary first-grant-of-the-day, which is what
      // keeps that path byte-for-byte what it was.
      const grantedToday = todaysGrants.reduce(
        (sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0),
        0,
      );
      const topUp = Math.max(0, Math.min(daily - grantedToday, ceiling - current));

      await append({
        id: txId(),
        userId,
        type: 'creditTransaction',
        kind: 'grant',
        amount: topUp,
        reason,
        createdAt: new Date().toISOString(),
      });
      return true;
  }

  async function balanceUnlocked(userId: string): Promise<number> {
    const txs = await userTxs(userId);
    return txs.reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0), 0);
  }

  /** The hold, WITHOUT taking the lock. See [grantDailyUnlocked]. */
  async function reserveUnlocked(userId: string, task: CreditTask, tier: UserTier = 'free'): Promise<string> {
      const cost = CREDIT_COSTS[task];
      if (typeof cost !== 'number') {
        throw new AppError('VALIDATION_FAILED', `Unknown credit task: ${String(task)}`);
      }
    await grantDailyUnlocked(userId, tier);
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

  /** Settlement as spent, WITHOUT taking the lock. See [grantDailyUnlocked]. */
  async function commitUnlocked(reservationId: string): Promise<boolean> {
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
  }

  /** Return the hold, WITHOUT taking the lock. See [grantDailyUnlocked]. */
  async function releaseUnlocked(reservationId: string): Promise<boolean> {
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
  }

  /**
   * Holds whose reservation never received a commit or a release, and which are
   * old enough that nothing can still be working on them.
   *
   * Read outside any lock on purpose: it only NOMINATES candidates, and each is
   * then returned through the locked `release`, which re-reads the settlements
   * and no-ops if one arrived in between. A sweep racing a real settlement
   * therefore cannot double-refund; the worst case is that it releases a hold
   * whose request is still alive, and that request's own commit then finds the
   * reservation settled and charges nothing. Erring toward the user.
   */
  async function staleReservationIds(olderThanMs: number, now: number): Promise<string[]> {
    const rows = await getContainer().where(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d?.type === 'creditTransaction',
    );
    const all = Array.isArray(rows) ? rows : [];
    const settled = new Set(
      all
        .filter((t) => t.kind === 'commit' || t.kind === 'release')
        .map((t) => t.reservationId)
        .filter((id): id is string => typeof id === 'string'),
    );
    const cutoff = now - olderThanMs;
    return all
      .filter(
        (t) =>
          t.kind === 'reserve' &&
          typeof t.reservationId === 'string' &&
          !settled.has(t.reservationId) &&
          Date.parse(t.createdAt) < cutoff,
      )
      .map((t) => t.reservationId as string);
  }

  const ledger: CreditLedger = {
    /**
     * One FREE_TIER_DAILY_CREDITS grant per user per UTC day.
     * Serialised per user so two simultaneous requests cannot both decide the
     * grant is missing and issue it.
     */
    grantDailyIfNeeded(userId: string, tier: UserTier = 'free'): Promise<boolean> {
      return withKeyLock(userId, () => grantDailyUnlocked(userId, tier));
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
    reserve(userId: string, task: CreditTask, tier: UserTier = 'free'): Promise<string> {
      return withKeyLock(userId, () => reserveUnlocked(userId, task, tier));
    },

    /**
     * Settle a reservation as spent. Idempotent; no-op when already settled.
     *
     * Locked on the reservationId for the same reason `reserve` is locked on
     * the userId: "read the settlements, decide nothing has settled, append"
     * is a read-modify-write, and the `settled` check is worthless if two
     * callers can both pass it. Two concurrent commits of one reservation
     * would each append a commit pair and charge the user twice, against an
     * append-only ledger where a duplicate is permanent. A retry after a lost
     * response is the ordinary way to get two.
     */
    commit(reservationId: string): Promise<boolean> {
      return withKeyLock(reservationId, () => commitUnlocked(reservationId));
    },

    /** Return a held cost to the balance (task failed or was blocked). */
    release(reservationId: string): Promise<boolean> {
      return withKeyLock(reservationId, () => releaseUnlocked(reservationId));
    },

    /**
     * Return abandoned holds — the ones no failure path will ever release
     * because the process that took them is gone.
     *
     * Every lane releases its own hold on every branch it can reach, which
     * covers provider errors, timeouts, guardrail refusals and a client that
     * disconnects mid-stream. None of them covers the process itself stopping
     * between the reserve and the settle, and against an append-only ledger
     * that loss is permanent: the credits are simply missing from a balance
     * that is a fold, with nothing left holding a reference to them. The vision
     * lane already sweeps its own orphans because its jobs outlive their
     * request; this is the same guarantee for every lane that does not.
     */
    async sweepStaleReservations(
      olderThanMs: number = STALE_RESERVATION_MS,
      now: number = Date.now(),
    ): Promise<number> {
      const ids = await staleReservationIds(olderThanMs, now);
      let released = 0;
      for (const id of ids) {
        if (await ledger.release(id)) released += 1;
      }
      return released;
    },
  };

  return ledger;
}

/** Default ledger bound to the platform JsonStore 'ledger' container. */
export const creditLedger: CreditLedger = createCreditLedger(
  () => store.container('ledger') as unknown as LedgerContainer,
);

/**
 * Settle an AI-lane reservation. Degraded (or otherwise non-billable) output
 * always releases; otherwise commit. Identical stance across chat, vision,
 * recommendations, progress insight, plans, and workouts.
 */
export async function settleReservation(
  reservationId: string,
  billable: boolean,
): Promise<void> {
  if (billable) {
    await creditLedger.commit(reservationId);
  } else {
    await creditLedger.release(reservationId);
  }
}
