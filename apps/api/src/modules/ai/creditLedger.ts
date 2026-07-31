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

let idCounter = 0;
function txId(): string {
  idCounter = (idCounter + 1) % 1_679_616;
  return `ct_${Date.now().toString(36)}${idCounter.toString(36).padStart(4, '0')}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
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

  return {
    /** One FREE_TIER_DAILY_CREDITS grant per user per UTC day. */
    async grantDailyIfNeeded(userId: string): Promise<boolean> {
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
    },

    /** Balance = fold. No cached counters, ever. */
    async balance(userId: string): Promise<number> {
      const txs = await userTxs(userId);
      return txs.reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0), 0);
    },

    /** Hold the cost of a task; returns the reservationId to commit/release. */
    async reserve(userId: string, task: CreditTask): Promise<string> {
      const cost = CREDIT_COSTS[task];
      if (typeof cost !== 'number') {
        throw new AppError('VALIDATION_FAILED', `Unknown credit task: ${String(task)}`);
      }
      await this.grantDailyIfNeeded(userId);
      const available = await this.balance(userId);
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
