/**
 * Telegram Stars purchases for coach personas.
 *
 * Three invariants hold this together, and each one is a real failure mode
 * rather than a hypothetical:
 *
 *  1. **The price comes from the roster, never from the request.** The client
 *     asks to buy a coach; it does not get to say what that costs. An amount
 *     accepted from the caller is an amount the caller sets to one.
 *  2. **Grants are idempotent on Telegram's charge id.** Telegram retries a
 *     webhook it believes failed, and a redelivered `successful_payment` must
 *     not create a second purchase record - the ledger is append-only, so a
 *     duplicate is permanent.
 *  3. **The payload is a lookup key, not a claim.** It is minted here, stored
 *     here, and matched here. Nothing inside the string is trusted on the way
 *     back: a forged payload finds no pending record and buys nothing.
 */
import {
  coachById,
  starsPriceOf,
  type CoachPersona,
  type StarsPurchase,
  type StarsRefund,
  type User,
} from '@aquazerofit/shared';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../platform/errors';
import {
  DuplicateIndexError,
  LEDGER_BY_STARS_CHARGE,
  getStore,
  indexKey,
  newId,
} from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { grantPurchasedCoach, getCoachState, revokePurchasedCoach } from '../coaches/service';
import {
  botConfigured,
  createStarsInvoiceLink,
  refundStarPayment,
  sendBotMessage,
} from './telegramBot';

/**
 * An invoice we created and are waiting to be paid. Held in `ledger` beside
 * the credit transactions it is a sibling of; swept by age so an abandoned
 * checkout does not accumulate.
 */
export interface PendingInvoice {
  type: 'starsInvoice';
  id: string;
  userId: string;
  coachId: string;
  stars: number;
  payload: string;
  createdAt: string;
}

/** Abandoned invoices older than this are swept on the next purchase attempt. */
const PENDING_INVOICE_TTL_MS = 24 * 60 * 60 * 1000;

export function starsAvailable(): boolean {
  return botConfigured();
}

function purchasableOrThrow(coachId: string): CoachPersona {
  const coach = coachById(coachId);
  if (!coach) throw new AppError('NOT_FOUND', 'Unknown coach.');
  const price = starsPriceOf(coach);
  if (price <= 0) {
    throw new AppError('VALIDATION_FAILED', `${coach.name} is not available for purchase.`);
  }
  return coach;
}

/**
 * Mint an invoice link for a coach.
 *
 * Refuses when the user already has the coach - by purchase *or* by level.
 * Selling someone something they have already earned is the single worst thing
 * this surface could do, and the level door moves underneath a user who is
 * still deciding, so the check has to happen at purchase time rather than only
 * at render time.
 */
export async function createCoachInvoice(
  userId: string,
  coachId: string,
  level: number,
): Promise<{ invoiceLink: string; stars: number }> {
  if (!starsAvailable()) {
    throw new AppError(
      'PAYMENT_UNAVAILABLE',
      'Purchases are not available on this deployment yet.',
    );
  }

  const coach = purchasableOrThrow(coachId);
  const state = getCoachState(userId);
  if (state.purchased.includes(coachId)) {
    throw new AppError('CONFLICT', `You already have ${coach.name}.`);
  }
  if (coach.unlock.kind === 'earned' && level >= coach.unlock.level) {
    throw new AppError('CONFLICT', `You have already unlocked ${coach.name} by training.`);
  }

  sweepExpiredInvoices();

  const stars = starsPriceOf(coach);
  const payload = `coach.${randomUUID()}`;
  const pending: PendingInvoice = {
    type: 'starsInvoice',
    id: newId('inv'),
    userId,
    coachId,
    stars,
    payload,
    createdAt: new Date().toISOString(),
  };

  // Persisted BEFORE the Telegram call: if the process dies between creating
  // the link and writing the record, a paid invoice would arrive with nothing
  // to match it against and the user would be charged for nothing.
  getStore().upsert('ledger', pending);

  const link = await createStarsInvoiceLink({
    title: `Coach ${coach.name.split(' ')[0]}`,
    description: `${coach.ringName}: ${coach.domain}. Unlocks permanently on this account.`,
    payload,
    stars,
  });

  if (!link.ok) {
    getStore().delete('ledger', pending.id);
    logEvent('stars_invoice_failed', { coachId, reason: link.error });
    throw new AppError('PAYMENT_UNAVAILABLE', 'Could not start the purchase. Please try again.');
  }

  return { invoiceLink: link.result, stars };
}

function sweepExpiredInvoices(): void {
  const cutoff = Date.now() - PENDING_INVOICE_TTL_MS;
  const store = getStore();
  for (const invoice of store.where<PendingInvoice>(
    'ledger',
    (d) => d.type === 'starsInvoice',
  )) {
    if (Date.parse(invoice.createdAt) < cutoff) store.delete('ledger', invoice.id);
  }
}

export function findPendingInvoice(payload: string): PendingInvoice | undefined {
  return getStore()
    .where<PendingInvoice>('ledger', (d) => d.type === 'starsInvoice' && d.payload === payload)
    .at(0);
}

/** The purchase row for a Telegram charge id, if one was already credited. */
export function findStarsPurchase(chargeId: string): StarsPurchase | undefined {
  return getStore()
    .whereIndexed<StarsPurchase>(
      'ledger',
      LEDGER_BY_STARS_CHARGE,
      indexKey(chargeId),
      (d) => d.type === 'starsPurchase' && d.telegramPaymentChargeId === chargeId,
    )
    .at(0);
}

function findStarsRefund(chargeId: string): StarsRefund | undefined {
  return getStore()
    .where<StarsRefund>(
      'ledger',
      (d) => d.type === 'starsRefund' && d.telegramPaymentChargeId === chargeId,
    )
    .at(0);
}

export interface SuccessfulPayment {
  invoicePayload: string;
  totalAmount: number;
  currency: string;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string;
  /** Telegram user who paid. Stored so a later refund can call refundStarPayment. */
  telegramUserId?: number;
}

export type PaymentOutcome =
  | { status: 'granted'; coachId: string; userId: string }
  | { status: 'duplicate'; coachId: string }
  | { status: 'rejected'; reason: string };

/**
 * Complete a paid checkout: verify, grant, record, receipt.
 *
 * Returns rather than throws. This runs inside a webhook handler, and an
 * exception there produces a non-2xx that makes Telegram redeliver the same
 * update indefinitely - turning one bad payment into an infinite retry loop.
 */
export function completePayment(payment: SuccessfulPayment): PaymentOutcome {
  const store = getStore();

  // Idempotency gate, checked first and against the charge id: it is the only
  // identifier Telegram guarantees stable across a redelivery.
  const existing = findStarsPurchase(payment.telegramPaymentChargeId);
  if (existing) return { status: 'duplicate', coachId: existing.coachId };

  const pending = findPendingInvoice(payment.invoicePayload);
  if (!pending) {
    // The invoice payload is a bearer correlation id. It is not logged.
    logEvent('stars_payment_unmatched', { reason: 'no_matching_invoice' });
    return { status: 'rejected', reason: 'No matching invoice.' };
  }

  const coach = coachById(pending.coachId);
  if (!coach) return { status: 'rejected', reason: 'Unknown coach.' };

  // Underpayment is not a thing Telegram should produce, which is exactly why
  // it is worth recording if it ever appears: it means either a client-crafted
  // invoice or a change to the roster price mid-checkout.
  if (payment.totalAmount < pending.stars) {
    logEvent('stars_payment_underpaid', {
      coachId: pending.coachId,
      expected: pending.stars,
      received: payment.totalAmount,
    });
    return { status: 'rejected', reason: 'Amount did not match the invoice.' };
  }

  const record: StarsPurchase = {
    type: 'starsPurchase',
    id: newId('pur'),
    userId: pending.userId,
    coachId: pending.coachId,
    stars: payment.totalAmount,
    telegramPaymentChargeId: payment.telegramPaymentChargeId,
    providerPaymentChargeId: payment.providerPaymentChargeId ?? null,
    invoicePayload: payment.invoicePayload,
    telegramUserId:
      typeof payment.telegramUserId === 'number' && payment.telegramUserId > 0
        ? payment.telegramUserId
        : null,
    createdAt: new Date().toISOString(),
  };
  try {
    store.upsert('ledger', record);
  } catch (err) {
    if (err instanceof DuplicateIndexError) {
      const winner = findStarsPurchase(payment.telegramPaymentChargeId);
      return { status: 'duplicate', coachId: winner?.coachId ?? pending.coachId };
    }
    throw err;
  }
  grantPurchasedCoach(pending.userId, pending.coachId);
  store.delete('ledger', pending.id);

  logEvent('stars_payment_completed', {
    coachId: pending.coachId,
    stars: payment.totalAmount,
  });

  // Receipt via the bot. Fire-and-forget: the grant is already durable, and a
  // failed courtesy message must never fail the purchase.
  const user = store.byId<User>('users', pending.userId);
  if (user?.tgId) {
    void sendBotMessage(
      user.tgId,
      `<b>${coach.name}</b> has joined your corner.\n\n<i>${coach.tagline}</i>\n\nOpen AquaZeroFit to train with them.`,
    );
  }

  return { status: 'granted', coachId: pending.coachId, userId: pending.userId };
}

export type StarsRefundOutcome =
  | { status: 'refunded'; coachId: string; userId: string; telegramPaymentChargeId: string }
  | {
      status: 'already_refunded';
      coachId: string;
      userId: string;
      telegramPaymentChargeId: string;
    };

/**
 * Telegram's description when refundStarPayment is repeated for a charge it
 * has already returned. Treated as success: the money is back, so the local
 * entitlement must still be revoked. A crash between the Telegram call and
 * the ledger write is the ordinary way this happens.
 */
export function starsAlreadyRefunded(error: string): boolean {
  return /CHARGE_ALREADY_REFUNDED/i.test(error) || /already refunded/i.test(error);
}

function refundFailureReason(error: string): string {
  if (starsAlreadyRefunded(error)) return 'already_refunded';
  if (/not configured/i.test(error)) return 'bot_not_configured';
  if (/CHARGE_NOT_FOUND/i.test(error)) return 'charge_not_found';
  if (/USER_ID_INVALID|user not found/i.test(error)) return 'user_invalid';
  if (/timeout|aborted/i.test(error)) return 'timeout';
  return 'rejected';
}

function payerTelegramId(
  purchase: StarsPurchase,
  user: User | undefined,
  override: number | undefined,
): number | undefined {
  if (typeof purchase.telegramUserId === 'number' && purchase.telegramUserId > 0) {
    return purchase.telegramUserId;
  }
  if (typeof user?.tgId === 'number' && user.tgId > 0) return user.tgId;
  if (typeof override === 'number' && override > 0) return override;
  return undefined;
}

/**
 * Refund one Stars purchase and revoke the coach entitlement.
 *
 * Idempotent on the charge id. A second call finds the refund row, revokes
 * again (a no-op if the coach is already gone) and does not call Telegram.
 * The purchase row itself stays: the ledger is append-only, and the refund
 * is a second document, not an edit of the charge.
 *
 * The body override is used only when neither the purchase nor the account
 * has a Telegram user id. It cannot redirect a refund that already knows
 * who paid.
 */
export async function refundStarsPurchase(input: {
  telegramPaymentChargeId: string;
  reason: string;
  actorId: string;
  telegramUserId?: number;
}): Promise<StarsRefundOutcome> {
  const purchase = findStarsPurchase(input.telegramPaymentChargeId);
  if (!purchase) throw new AppError('NOT_FOUND', 'No Stars purchase matches that charge.');

  const done = (
    status: StarsRefundOutcome['status'],
  ): StarsRefundOutcome => ({
    status,
    coachId: purchase.coachId,
    userId: purchase.userId,
    telegramPaymentChargeId: purchase.telegramPaymentChargeId,
  });

  if (findStarsRefund(purchase.telegramPaymentChargeId)) {
    revokePurchasedCoach(purchase.userId, purchase.coachId);
    return done('already_refunded');
  }

  const user = getStore().byId<User>('users', purchase.userId);
  const telegramUserId = payerTelegramId(purchase, user, input.telegramUserId);
  if (telegramUserId === undefined) {
    throw new AppError(
      'CONFLICT',
      'This purchase has no Telegram user id, so the Stars refund cannot be sent.',
    );
  }

  const result = await refundStarPayment(telegramUserId, purchase.telegramPaymentChargeId);
  if (!result.ok && !starsAlreadyRefunded(result.error)) {
    logEvent('stars_refund_failed', {
      coachId: purchase.coachId,
      reason: refundFailureReason(result.error),
    });
    throw new AppError('PAYMENT_UNAVAILABLE', 'Telegram did not refund this payment.');
  }

  const record: StarsRefund = {
    type: 'starsRefund',
    id: newId('sref'),
    userId: purchase.userId,
    coachId: purchase.coachId,
    stars: purchase.stars,
    telegramPaymentChargeId: purchase.telegramPaymentChargeId,
    telegramUserId,
    reason: input.reason,
    actorId: input.actorId,
    createdAt: new Date().toISOString(),
  };
  getStore().upsert('ledger', record);
  revokePurchasedCoach(purchase.userId, purchase.coachId);
  logEvent('stars_refund_completed', {
    coachId: purchase.coachId,
    stars: purchase.stars,
    alreadyRefunded: !result.ok,
  });
  return done(result.ok ? 'refunded' : 'already_refunded');
}
