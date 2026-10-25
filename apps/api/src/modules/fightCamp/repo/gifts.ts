/**
 * Gift persistence (AZF-P1 Epic G, `engage.gifts`), composed into the engage
 * repository as `engageRepo().gifts` with the same two adapters and the same
 * contract suite.
 *
 * A gift row is a financial record. Its status only moves forward
 * (pending, then paid, then granted; refunded or failed after), the charge
 * id is unique, and erasure nulls the people in it rather than deleting it.
 */
import { iso, isoOrNull, isUniqueViolation, type SqlRunner } from '../../../platform/sql';

export type GiftStatus = 'pending' | 'paid' | 'granted' | 'refunded' | 'failed';

export interface GiftRow {
  id: string;
  /** Null once the gifter's account is erased. */
  gifterUserId: string | null;
  /** Null once the recipient's account is erased. */
  recipientUserId: string | null;
  squadId: string | null;
  product: 'premium_7d';
  rail: 'stars';
  starsAmount: number;
  invoicePayload: string;
  telegramPaymentChargeId: string | null;
  status: GiftStatus;
  createdAt: string;
  grantedAt: string | null;
  refundedAt: string | null;
}

/** What a person's export shows: never the other person's id. */
export interface GiftExport {
  giftsSent: Array<Pick<GiftRow, 'id' | 'starsAmount' | 'status' | 'createdAt' | 'grantedAt' | 'refundedAt'>>;
  giftsReceived: Array<Pick<GiftRow, 'id' | 'status' | 'grantedAt'>>;
}

export interface GiftStore {
  insert(row: GiftRow): Promise<void>;
  byPayload(payload: string): Promise<GiftRow | null>;
  byCharge(chargeId: string): Promise<GiftRow | null>;
  /**
   * Move the pending gift with this payload to paid under this charge id, as
   * one step. 'paid' for the call that did it; 'duplicate' when the charge is
   * already recorded (a redelivery); 'missing' when no pending gift has the
   * payload.
   */
  markPaid(payload: string, chargeId: string): Promise<'paid' | 'duplicate' | 'missing'>;
  /** Forward-only: a status the row has passed is not written back. */
  settle(id: string, status: 'granted' | 'refunded' | 'failed', at: string): Promise<void>;
  /** The newest gift granted to the person at or after `since`. */
  latestGrantedTo(userId: string, since: string): Promise<GiftRow | null>;
  exportFor(userId: string): Promise<GiftExport>;
  /** Null the person out of every gift; the rows stay. */
  erase(userId: string, db?: SqlRunner): Promise<void>;
}

/** Which statuses may follow which. Anything else is a no-op. */
const NEXT: Record<GiftStatus, readonly GiftStatus[]> = {
  pending: ['paid', 'failed'],
  paid: ['granted', 'refunded', 'failed'],
  granted: ['refunded'],
  refunded: [],
  failed: ['refunded'],
};

function exportOf(rows: GiftRow[], userId: string): GiftExport {
  return {
    giftsSent: rows
      .filter((g) => g.gifterUserId === userId)
      .map(({ id, starsAmount, status, createdAt, grantedAt, refundedAt }) => ({
        id,
        starsAmount,
        status,
        createdAt,
        grantedAt,
        refundedAt,
      })),
    giftsReceived: rows
      .filter((g) => g.recipientUserId === userId && g.status !== 'pending')
      .map(({ id, status, grantedAt }) => ({ id, status, grantedAt })),
  };
}

export class MemoryGiftStore implements GiftStore {
  private rows: GiftRow[] = [];

  async insert(row: GiftRow): Promise<void> {
    if (this.rows.some((g) => g.id === row.id || g.invoicePayload === row.invoicePayload)) {
      throw new Error('gift already exists');
    }
    this.rows.push({ ...row });
  }

  async byPayload(payload: string): Promise<GiftRow | null> {
    const row = this.rows.find((g) => g.invoicePayload === payload);
    return row ? { ...row } : null;
  }

  async byCharge(chargeId: string): Promise<GiftRow | null> {
    const row = this.rows.find((g) => g.telegramPaymentChargeId === chargeId);
    return row ? { ...row } : null;
  }

  async markPaid(payload: string, chargeId: string): Promise<'paid' | 'duplicate' | 'missing'> {
    if (this.rows.some((g) => g.telegramPaymentChargeId === chargeId)) return 'duplicate';
    const row = this.rows.find((g) => g.invoicePayload === payload && g.status === 'pending');
    if (!row) return 'missing';
    row.status = 'paid';
    row.telegramPaymentChargeId = chargeId;
    return 'paid';
  }

  async settle(id: string, status: 'granted' | 'refunded' | 'failed', at: string): Promise<void> {
    const row = this.rows.find((g) => g.id === id);
    if (!row || !NEXT[row.status].includes(status)) return;
    row.status = status;
    if (status === 'granted') row.grantedAt = at;
    if (status === 'refunded') row.refundedAt = at;
  }

  async latestGrantedTo(userId: string, since: string): Promise<GiftRow | null> {
    const row = this.rows
      .filter((g) => g.recipientUserId === userId && g.status === 'granted' && g.grantedAt !== null && g.grantedAt >= since)
      .sort((a, b) => b.grantedAt!.localeCompare(a.grantedAt!))[0];
    return row ? { ...row } : null;
  }

  async exportFor(userId: string): Promise<GiftExport> {
    return exportOf(this.rows, userId);
  }

  async erase(userId: string): Promise<void> {
    for (const row of this.rows) {
      if (row.gifterUserId === userId) row.gifterUserId = null;
      if (row.recipientUserId === userId) row.recipientUserId = null;
    }
  }
}

const COLUMNS = `id, gifter_user_id, recipient_user_id, squad_id, product, rail, stars_amount, invoice_payload,
  telegram_payment_charge_id, status, created_at, granted_at, refunded_at`;

function toGift(r: Record<string, unknown>): GiftRow {
  return {
    id: String(r.id),
    gifterUserId: r.gifter_user_id === null ? null : String(r.gifter_user_id),
    recipientUserId: r.recipient_user_id === null ? null : String(r.recipient_user_id),
    squadId: r.squad_id === null ? null : String(r.squad_id),
    product: 'premium_7d',
    rail: 'stars',
    starsAmount: Number(r.stars_amount),
    invoicePayload: String(r.invoice_payload),
    telegramPaymentChargeId: r.telegram_payment_charge_id === null ? null : String(r.telegram_payment_charge_id),
    status: r.status as GiftStatus,
    createdAt: iso(r.created_at),
    grantedAt: isoOrNull(r.granted_at),
    refundedAt: isoOrNull(r.refunded_at),
  };
}

export class PgGiftStore implements GiftStore {
  constructor(private readonly db: SqlRunner) {}

  async insert(row: GiftRow): Promise<void> {
    await this.db.query(
      `INSERT INTO engage.gifts (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        row.id,
        row.gifterUserId,
        row.recipientUserId,
        row.squadId,
        row.product,
        row.rail,
        row.starsAmount,
        row.invoicePayload,
        row.telegramPaymentChargeId,
        row.status,
        row.createdAt,
        row.grantedAt,
        row.refundedAt,
      ],
    );
  }

  private async one(where: string, value: string): Promise<GiftRow | null> {
    const { rows } = await this.db.query(`SELECT ${COLUMNS} FROM engage.gifts WHERE ${where} = $1`, [value]);
    return rows[0] ? toGift(rows[0]) : null;
  }

  byPayload(payload: string): Promise<GiftRow | null> {
    return this.one('invoice_payload', payload);
  }

  byCharge(chargeId: string): Promise<GiftRow | null> {
    return this.one('telegram_payment_charge_id', chargeId);
  }

  async markPaid(payload: string, chargeId: string): Promise<'paid' | 'duplicate' | 'missing'> {
    try {
      const { rows } = await this.db.query(
        `UPDATE engage.gifts SET status = 'paid', telegram_payment_charge_id = $2
         WHERE invoice_payload = $1 AND status = 'pending' RETURNING id`,
        [payload, chargeId],
      );
      if (rows.length > 0) return 'paid';
    } catch (err) {
      // The charge id is already on another row: a redelivery that raced us.
      if (isUniqueViolation(err)) return 'duplicate';
      throw err;
    }
    return (await this.byCharge(chargeId)) ? 'duplicate' : 'missing';
  }

  async settle(id: string, status: 'granted' | 'refunded' | 'failed', at: string): Promise<void> {
    const from = (Object.keys(NEXT) as GiftStatus[]).filter((s) => NEXT[s].includes(status));
    await this.db.query(
      `UPDATE engage.gifts SET status = $2,
         granted_at = CASE WHEN $2 = 'granted' THEN $3::timestamptz ELSE granted_at END,
         refunded_at = CASE WHEN $2 = 'refunded' THEN $3::timestamptz ELSE refunded_at END
       WHERE id = $1 AND status = ANY($4::text[])`,
      [id, status, at, from],
    );
  }

  async latestGrantedTo(userId: string, since: string): Promise<GiftRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNS} FROM engage.gifts
       WHERE recipient_user_id = $1 AND status = 'granted' AND granted_at >= $2
       ORDER BY granted_at DESC LIMIT 1`,
      [userId, since],
    );
    return rows[0] ? toGift(rows[0]) : null;
  }

  async exportFor(userId: string): Promise<GiftExport> {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNS} FROM engage.gifts WHERE gifter_user_id = $1 OR recipient_user_id = $1 ORDER BY created_at, id`,
      [userId],
    );
    return exportOf(rows.map(toGift), userId);
  }

  async erase(userId: string, db: SqlRunner = this.db): Promise<void> {
    await db.query('UPDATE engage.gifts SET gifter_user_id = NULL WHERE gifter_user_id = $1', [userId]);
    await db.query('UPDATE engage.gifts SET recipient_user_id = NULL WHERE recipient_user_id = $1', [userId]);
  }
}
