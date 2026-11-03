/**
 * Telegram Stars subscription for Premium inside the Mini App.
 *
 * The price is TELEGRAM_STARS_PREMIUM_PRICE. Nothing in this file picks a
 * number when that variable is unset. The period Telegram will accept for a
 * Stars subscription is 2592000 seconds (30 days), which is a Bot API
 * constraint, not a price.
 *
 * Renewals reuse the invoice payload and carry a new charge id plus
 * subscription_expiration_date. Premium runs until that instant. A renewal
 * that does not arrive is not invented here: there is no extra 30 days.
 *
 * The anchor (type starsSubscription) stays after the first payment so the
 * next charge can still find the account. Coach invoices are a different
 * type and are deleted on payment; this module does not touch them.
 */
import { randomUUID } from 'node:crypto';
import type {
  StarsSubscription,
  StarsSubscriptionPayment,
  StarsSubscriptionRefund,
  User,
} from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { config } from '../../platform/config';
import {
  DuplicateIndexError,
  LEDGER_BY_STARS_CHARGE,
  getStore,
  indexKey,
  newId,
} from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { grantPremium, revokePremium, tierOf } from '../billing/entitlements';
import { starsAlreadyRefunded } from './stars';
import {
  botConfigured,
  createStarsInvoiceLink,
  editUserStarSubscription,
  refundStarPayment,
  sendBotMessage,
} from './telegramBot';

/** Bot API: Stars subscriptions are 30 days, expressed in seconds. */
export const STARS_SUBSCRIPTION_PERIOD_SECONDS = 2_592_000;

export const PREMIUM_PAYLOAD_PREFIX = 'premium.';

const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export function starsPremiumPrice(): number | null {
  return config.telegramStarsPremiumPrice;
}

/** True only when a real bot token and a configured price are both present. */
export function starsPremiumAvailable(): boolean {
  return botConfigured() && starsPremiumPrice() !== null;
}

function sweepUnpaidAnchors(): void {
  const cutoff = Date.now() - PENDING_TTL_MS;
  const store = getStore();
  const paidPayloads = new Set(
    store
      .where<StarsSubscriptionPayment>('ledger', (d) => d.type === 'starsSubscriptionPayment')
      .map((payment) => payment.invoicePayload),
  );
  for (const anchor of store.where<StarsSubscription>('ledger', (d) => d.type === 'starsSubscription')) {
    if (paidPayloads.has(anchor.payload)) continue;
    if (Date.parse(anchor.createdAt) < cutoff) store.delete('ledger', anchor.id);
  }
}

export function findSubscriptionAnchor(payload: string): StarsSubscription | undefined {
  return getStore()
    .where<StarsSubscription>('ledger', (d) => d.type === 'starsSubscription' && d.payload === payload)
    .at(0);
}

export function findSubscriptionPayment(chargeId: string): StarsSubscriptionPayment | undefined {
  return getStore()
    .whereIndexed<StarsSubscriptionPayment>(
      'ledger',
      LEDGER_BY_STARS_CHARGE,
      indexKey(chargeId),
      (d) => d.type === 'starsSubscriptionPayment' && d.telegramPaymentChargeId === chargeId,
    )
    .at(0);
}

function findSubscriptionRefund(chargeId: string): StarsSubscriptionRefund | undefined {
  return getStore()
    .where<StarsSubscriptionRefund>(
      'ledger',
      (d) => d.type === 'starsSubscriptionRefund' && d.telegramPaymentChargeId === chargeId,
    )
    .at(0);
}

function payloadRefunded(payload: string): boolean {
  return (
    getStore()
      .where<StarsSubscriptionRefund>(
        'ledger',
        (d) => d.type === 'starsSubscriptionRefund' && d.invoicePayload === payload,
      )
      .length > 0
  );
}

/**
 * Open a subscription invoice. Refused for a non-premium-capable deployment,
 * and for an account that is already premium: a second subscription would
 * bill twice for one tier. Renewals of an existing subscription do not come
 * through this function.
 */
export async function createPremiumSubscriptionInvoice(
  userId: string,
): Promise<{ invoiceLink: string; stars: number }> {
  const stars = starsPremiumPrice();
  if (!starsPremiumAvailable() || stars === null) {
    throw new AppError(
      'PAYMENT_UNAVAILABLE',
      'Premium is not available for Stars on this deployment yet.',
    );
  }
  if (tierOf(userId) === 'premium') {
    throw new AppError('CONFLICT', 'This account is already on premium.');
  }

  sweepUnpaidAnchors();

  const payload = `${PREMIUM_PAYLOAD_PREFIX}${randomUUID()}`;
  const anchor: StarsSubscription = {
    type: 'starsSubscription',
    id: newId('sub'),
    userId,
    stars,
    payload,
    createdAt: new Date().toISOString(),
  };
  // Persisted before the Telegram call so a paid invoice can still be matched
  // if the process restarts between the two.
  getStore().upsert('ledger', anchor);

  const link = await createStarsInvoiceLink({
    title: 'AquaZeroFit Premium',
    description: 'Premium for 30 days. Renews every 30 days until support stops it.',
    payload,
    stars,
    subscriptionPeriod: STARS_SUBSCRIPTION_PERIOD_SECONDS,
  });
  if (!link.ok) {
    getStore().delete('ledger', anchor.id);
    logEvent('stars_subscription_invoice_failed', { reason: link.error });
    throw new AppError('PAYMENT_UNAVAILABLE', 'Could not start the subscription. Please try again.');
  }
  return { invoiceLink: link.result, stars };
}

export interface SubscriptionCheckoutQuery {
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

/** Whether a premium pre-checkout may proceed. The payload is not logged. */
export function premiumCheckoutAccepts(query: SubscriptionCheckoutQuery): boolean {
  if (!query.invoice_payload.startsWith(PREMIUM_PAYLOAD_PREFIX)) return false;
  const anchor = findSubscriptionAnchor(query.invoice_payload);
  if (!anchor) return false;
  if (payloadRefunded(query.invoice_payload)) return false;
  return query.currency === 'XTR' && query.total_amount >= anchor.stars;
}

export interface SubscriptionPaymentInput {
  invoicePayload: string;
  totalAmount: number;
  currency: string;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string;
  telegramUserId?: number;
  /** Unix seconds, as Telegram sends subscription_expiration_date. */
  subscriptionExpirationDate?: number;
  isRecurring?: boolean;
  isFirstRecurring?: boolean;
}

export type SubscriptionPaymentOutcome =
  | { status: 'granted'; userId: string; premiumUntil: string }
  | { status: 'duplicate'; userId: string }
  | { status: 'rejected'; reason: string };

function grantForPayment(payment: StarsSubscriptionPayment): string {
  const outcome = grantPremium({
    userId: payment.userId,
    source: 'stars',
    externalId: `stars:${payment.telegramPaymentChargeId}`,
    providerRef: payment.invoicePayload,
    premiumUntil: payment.subscriptionExpirationDate,
    reason: payment.isRecurring ? 'stars:renewal' : 'stars:subscription',
  });
  return outcome.premiumUntil;
}

/**
 * Settle one subscription charge.
 *
 * The period end is subscription_expiration_date. A missing date is a reject:
 * this function does not assume 30 days. is_recurring is recorded. A second
 * charge with a new id and a new expiration moves the Stars source to that
 * expiration and no further.
 */
export function completeSubscriptionPayment(payment: SubscriptionPaymentInput): SubscriptionPaymentOutcome {
  const existing = findSubscriptionPayment(payment.telegramPaymentChargeId);
  if (existing) {
    // Redelivery, or a first attempt that stored the charge and died before
    // the grant. grantPremium is idempotent on the charge id.
    grantForPayment(existing);
    return { status: 'duplicate', userId: existing.userId };
  }

  const anchor = findSubscriptionAnchor(payment.invoicePayload);
  if (!anchor) {
    logEvent('stars_subscription_unmatched', { reason: 'no_matching_invoice' });
    return { status: 'rejected', reason: 'No matching subscription.' };
  }
  if (payloadRefunded(payment.invoicePayload)) {
    logEvent('stars_subscription_rejected', { reason: 'cancelled' });
    return { status: 'rejected', reason: 'This subscription was refunded.' };
  }
  if (payment.currency !== 'XTR' || payment.totalAmount < anchor.stars) {
    logEvent('stars_subscription_rejected', { reason: 'amount' });
    return { status: 'rejected', reason: 'Amount did not match the invoice.' };
  }
  if (typeof payment.subscriptionExpirationDate !== 'number' || !Number.isFinite(payment.subscriptionExpirationDate)) {
    logEvent('stars_subscription_rejected', { reason: 'missing_expiration' });
    return { status: 'rejected', reason: 'Telegram did not report an expiration.' };
  }

  const telegramUserId =
    typeof payment.telegramUserId === 'number' && payment.telegramUserId > 0 ? payment.telegramUserId : null;
  const record: StarsSubscriptionPayment = {
    type: 'starsSubscriptionPayment',
    id: newId('sspay'),
    userId: anchor.userId,
    stars: payment.totalAmount,
    telegramPaymentChargeId: payment.telegramPaymentChargeId,
    providerPaymentChargeId: payment.providerPaymentChargeId ?? null,
    invoicePayload: payment.invoicePayload,
    telegramUserId,
    subscriptionExpirationDate: new Date(payment.subscriptionExpirationDate * 1000).toISOString(),
    isRecurring: payment.isRecurring === true,
    isFirstRecurring: payment.isFirstRecurring === true,
    createdAt: new Date().toISOString(),
  };

  try {
    getStore().upsert('ledger', record);
  } catch (err) {
    if (err instanceof DuplicateIndexError) {
      const winner = findSubscriptionPayment(payment.telegramPaymentChargeId);
      if (winner) grantForPayment(winner);
      return { status: 'duplicate', userId: winner?.userId ?? anchor.userId };
    }
    throw err;
  }

  const premiumUntil = grantForPayment(record);
  logEvent('stars_subscription_completed', {
    stars: payment.totalAmount,
    recurring: record.isRecurring,
  });

  const user = getStore().byId<User>('users', anchor.userId);
  if (user?.tgId) {
    void sendBotMessage(
      user.tgId,
      'Premium is on. It lasts until the expiration Telegram reported for this payment.',
    );
  }
  return { status: 'granted', userId: anchor.userId, premiumUntil };
}

export type StarsSubscriptionRefundOutcome =
  | { status: 'refunded'; userId: string; telegramPaymentChargeId: string }
  | { status: 'already_refunded'; userId: string; telegramPaymentChargeId: string };

function payerTelegramId(
  payment: StarsSubscriptionPayment,
  user: User | undefined,
  override: number | undefined,
): number | undefined {
  if (typeof payment.telegramUserId === 'number' && payment.telegramUserId > 0) return payment.telegramUserId;
  if (typeof user?.tgId === 'number' && user.tgId > 0) return user.tgId;
  if (typeof override === 'number' && override > 0) return override;
  return undefined;
}

/** Telegram's wording when editUserStarSubscription is repeated after a cancel. */
export function starsSubscriptionAlreadyCanceled(error: string): boolean {
  return /already cancel/i.test(error);
}

function refundFailureReason(error: string): string {
  if (starsAlreadyRefunded(error)) return 'already_refunded';
  if (starsSubscriptionAlreadyCanceled(error)) return 'already_canceled';
  if (/not configured/i.test(error)) return 'bot_not_configured';
  if (/CHARGE_NOT_FOUND/i.test(error)) return 'charge_not_found';
  if (/timeout|aborted/i.test(error)) return 'timeout';
  return 'rejected';
}

/**
 * Refund one subscription charge and stop further renewals.
 *
 * refundStarPayment returns the Stars for that charge. It does not cancel
 * the subscription, so editUserStarSubscription is called with is_canceled
 * true. The local refund row is written only after both calls succeed, so a
 * retry can finish the cancel (Telegram then reports the charge already
 * refunded). The entitlement revoke is charge-scoped: a Stripe or Play
 * period on the same account stays until its own end.
 *
 * A repeat finds the refund row, revokes again, and does not call Telegram.
 */
export async function refundStarsSubscription(input: {
  telegramPaymentChargeId: string;
  reason: string;
  actorId: string;
  telegramUserId?: number;
}): Promise<StarsSubscriptionRefundOutcome> {
  const payment = findSubscriptionPayment(input.telegramPaymentChargeId);
  if (!payment) {
    throw new AppError('NOT_FOUND', 'No Stars subscription payment matches that charge.');
  }

  const done = (status: StarsSubscriptionRefundOutcome['status']): StarsSubscriptionRefundOutcome => ({
    status,
    userId: payment.userId,
    telegramPaymentChargeId: payment.telegramPaymentChargeId,
  });

  const revokeCharge = () => {
    revokePremium(
      payment.userId,
      'stars',
      `stars:refund:${payment.telegramPaymentChargeId}`,
      input.reason,
      payment.invoicePayload,
      `stars:${payment.telegramPaymentChargeId}`,
    );
  };

  if (findSubscriptionRefund(payment.telegramPaymentChargeId)) {
    revokeCharge();
    return done('already_refunded');
  }

  const user = getStore().byId<User>('users', payment.userId);
  const telegramUserId = payerTelegramId(payment, user, input.telegramUserId);
  if (telegramUserId === undefined) {
    throw new AppError(
      'CONFLICT',
      'This payment has no Telegram user id, so the Stars refund cannot be sent.',
    );
  }

  const refunded = await refundStarPayment(telegramUserId, payment.telegramPaymentChargeId);
  if (!refunded.ok && !starsAlreadyRefunded(refunded.error)) {
    logEvent('stars_subscription_refund_failed', { reason: refundFailureReason(refunded.error) });
    throw new AppError('PAYMENT_UNAVAILABLE', 'Telegram did not refund this payment.');
  }

  const canceled = await editUserStarSubscription(telegramUserId, payment.telegramPaymentChargeId, true);
  if (!canceled.ok && !starsSubscriptionAlreadyCanceled(canceled.error)) {
    logEvent('stars_subscription_cancel_failed', { reason: refundFailureReason(canceled.error) });
    throw new AppError(
      'PAYMENT_UNAVAILABLE',
      'Telegram refunded the charge but did not stop the subscription. Retry the refund to finish cancelling it.',
    );
  }

  const record: StarsSubscriptionRefund = {
    type: 'starsSubscriptionRefund',
    id: newId('ssref'),
    userId: payment.userId,
    stars: payment.stars,
    telegramPaymentChargeId: payment.telegramPaymentChargeId,
    invoicePayload: payment.invoicePayload,
    telegramUserId,
    reason: input.reason,
    actorId: input.actorId,
    createdAt: new Date().toISOString(),
  };
  getStore().upsert('ledger', record);
  revokeCharge();
  logEvent('stars_subscription_refund_completed', {
    stars: payment.stars,
    alreadyRefunded: !refunded.ok,
  });
  return done(refunded.ok ? 'refunded' : 'already_refunded');
}
