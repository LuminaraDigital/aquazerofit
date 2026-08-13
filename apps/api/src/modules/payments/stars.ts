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
 *     not create a second purchase record — the ledger is append-only, so a
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
  type User,
} from '@aquazerofit/shared';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../platform/errors';
import { getStore, newId } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { grantPurchasedCoach, getCoachState } from '../coaches/service';
import { botConfigured, createStarsInvoiceLink, sendBotMessage } from './telegramBot';

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
 * Refuses when the user already has the coach — by purchase *or* by level.
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
    description: `${coach.ringName} — ${coach.domain}. Unlocks permanently on this account.`,
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

export interface SuccessfulPayment {
  invoicePayload: string;
  totalAmount: number;
  currency: string;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string;
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
 * update indefinitely — turning one bad payment into an infinite retry loop.
 */
export function completePayment(payment: SuccessfulPayment): PaymentOutcome {
  const store = getStore();

  // Idempotency gate, checked first and against the charge id: it is the only
  // identifier Telegram guarantees stable across a redelivery.
  const existing = store
    .where<StarsPurchase>(
      'ledger',
      (d) =>
        d.type === 'starsPurchase' &&
        d.telegramPaymentChargeId === payment.telegramPaymentChargeId,
    )
    .at(0);
  if (existing) return { status: 'duplicate', coachId: existing.coachId };

  const pending = findPendingInvoice(payment.invoicePayload);
  if (!pending) {
    logEvent('stars_payment_unmatched', { payload: payment.invoicePayload });
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
    createdAt: new Date().toISOString(),
  };
  store.upsert('ledger', record);
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
