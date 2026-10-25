/**
 * Gift a Round (AZF-P1 Epic G, US-G1): an adult squad member buys a squad
 * mate a week of Premium with Telegram Stars.
 *
 * Optional and separately switched: FC_GIFTING_ENABLED, plus a price in
 * GIFT_PREMIUM_7D_STARS with no default. The rules, enforced when the
 * invoice is made and again at Telegram's pre-checkout:
 *  - both people are adults and active members of the same squad this
 *    season, and the gifter's account is linked to Telegram: Stars are paid
 *    there, only the gifter may pay, and a refund goes back to them;
 *  - the recipient has no Premium now, so a gift is never wasted;
 *  - the price comes from the environment, never from the request, and a
 *    gift is always seven days: no tiers, no odds.
 *
 * Payment settles through the Stars webhook (`gift:` payloads), idempotent on
 * Telegram's charge id, and the week is granted through the entitlement
 * ledger every rail uses. A refund returns the Stars and takes back whatever
 * is left of the week; the days already used are used.
 */
import { randomUUID } from 'node:crypto';
import {
  GIFT_PAYLOAD_PREFIX,
  GIFT_PREMIUM_DAYS,
  seasonFor,
  type FightCampStatus,
  type User,
} from '@aquazerofit/shared';
import { localDateFor } from '../../platform/dates';
import { AppError } from '../../platform/errors';
import { fightCampConfig } from '../../platform/fightCampConfig';
import { getStore, newId } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { effectiveTier, grantPremium, revokePremiumOnce } from '../billing/entitlements';
import { isAdult } from '../fightRecord/service';
import { getProfile } from '../me/service';
import { starsAlreadyRefunded } from '../payments/stars';
import { createStarsInvoiceLink, refundStarPayment } from '../payments/telegramBot';
import { fcEnabled } from './flags';
import { engageRepo, type GiftRow } from './repo';
import { adultMembers, displayNameOf, telegramSafe } from './squads';

const DAY_MS = 86_400_000;

type Refusal = 'gift_not_eligible' | 'recipient_has_premium';

function refuse(reason: Refusal): never {
  if (reason === 'recipient_has_premium') {
    throw new AppError('CONFLICT', 'They already have Premium, so a gift would not add anything right now.', { reason });
  }
  throw new AppError('FORBIDDEN', 'Gifting is not available for this squad mate.', { reason });
}

function userOf(userId: string | null): User | undefined {
  return userId ? getStore().byId<User>('users', userId) : undefined;
}

function telegramIdOf(user: User | undefined): number | null {
  return typeof user?.tgId === 'number' && user.tgId > 0 ? user.tgId : null;
}

/** Whether these two people may exchange a gift in this squad right now. */
async function eligibility(gifterId: string, recipientId: string, squadId: string, now: Date): Promise<Refusal | null> {
  if (gifterId === recipientId || fightCampConfig.giftPremium7dStars === null || !fcEnabled('gifting', gifterId)) {
    return 'gift_not_eligible';
  }
  const recipient = userOf(recipientId);
  if (!recipient || telegramIdOf(userOf(gifterId)) === null || !isAdult(getProfile(gifterId))) return 'gift_not_eligible';
  const mine = await engageRepo().activeMembership(gifterId, seasonFor(localDateFor(undefined, now)).number);
  if (mine?.squadId !== squadId) return 'gift_not_eligible';
  const adults = new Set((await adultMembers(squadId, now)).map((m) => m.userId));
  if (!adults.has(gifterId) || !adults.has(recipientId)) return 'gift_not_eligible';
  return effectiveTier(recipient, now) === 'premium' ? 'recipient_has_premium' : null;
}

/** The invoice for a week of Premium for the squad mate `toRef`. */
export async function createGiftInvoice(userId: string, toRef: string, now: Date = new Date()): Promise<{ invoiceLink: string }> {
  const repo = engageRepo();
  const stars = fightCampConfig.giftPremium7dStars;
  const mine = await repo.activeMembership(userId, seasonFor(localDateFor(undefined, now)).number);
  const target = mine ? await repo.activeMemberByRef(mine.squadId, toRef) : null;
  if (stars === null || !mine || !target) refuse('gift_not_eligible');
  const refusal = await eligibility(userId, target.userId, mine.squadId, now);
  if (refusal) refuse(refusal);

  const gift: GiftRow = {
    id: newId('gift'),
    gifterUserId: userId,
    recipientUserId: target.userId,
    squadId: mine.squadId,
    product: 'premium_7d',
    rail: 'stars',
    starsAmount: stars,
    invoicePayload: `${GIFT_PAYLOAD_PREFIX}${randomUUID()}`,
    telegramPaymentChargeId: null,
    status: 'pending',
    createdAt: now.toISOString(),
    grantedAt: null,
    refundedAt: null,
  };
  // Written before Telegram is asked: a paid invoice must always find its row.
  await repo.gifts.insert(gift);
  const name = telegramSafe(displayNameOf(target.userId), 'your squad mate');
  const link = await createStarsInvoiceLink({
    title: 'A week of Premium',
    description: `${GIFT_PREMIUM_DAYS} days of AquaZeroFit Premium for ${name}, starting when you pay. Refunds through /paysupport.`,
    payload: gift.invoicePayload,
    stars,
  });
  if (!link.ok) {
    await repo.gifts.settle(gift.id, 'failed', now.toISOString());
    logEvent('gift_invoice_failed', {});
    throw new AppError('PAYMENT_UNAVAILABLE', 'Could not start the gift. Please try again.');
  }
  logEvent('gift_invoice_created', { stars_amount: stars });
  return { invoiceLink: link.result };
}

/**
 * Telegram's pre-checkout, re-validated from scratch: the payload must name a
 * pending gift, the amount its price, the payer the gifter, and the two of
 * them must still be eligible. The payload itself is never trusted or logged.
 */
export async function giftCheckoutAccepts(
  query: { currency: string; total_amount: number; invoice_payload: string; payerTelegramId?: number },
  now: Date = new Date(),
): Promise<boolean> {
  const gift = await engageRepo().gifts.byPayload(query.invoice_payload);
  if (gift?.status !== 'pending' || !gift.gifterUserId || !gift.recipientUserId || !gift.squadId) return false;
  if (query.currency !== 'XTR' || query.total_amount < gift.starsAmount) return false;
  if (telegramIdOf(userOf(gift.gifterUserId)) !== query.payerTelegramId) return false;
  return (await eligibility(gift.gifterUserId, gift.recipientUserId, gift.squadId, now)) === null;
}

export type GiftPaymentOutcome =
  | { status: 'granted' | 'duplicate' }
  | { status: 'rejected' | 'failed'; reason: string };

async function grantWeek(gift: GiftRow, chargeId: string, now: Date): Promise<GiftPaymentOutcome> {
  const recipient = userOf(gift.recipientUserId);
  if (!recipient) {
    // Paid, but there is no one left to give it to: refunded by an operator.
    await engageRepo().gifts.settle(gift.id, 'failed', now.toISOString());
    logEvent('gift_grant_failed', { reason: 'recipient_gone' });
    return { status: 'failed', reason: 'The recipient account is gone.' };
  }
  grantPremium({
    userId: recipient.id,
    source: 'stars',
    externalId: `gift:${chargeId}`,
    providerRef: gift.invoicePayload,
    premiumUntil: new Date(now.getTime() + GIFT_PREMIUM_DAYS * DAY_MS).toISOString(),
    reason: 'stars:gift',
  });
  await engageRepo().gifts.settle(gift.id, 'granted', now.toISOString());
  logEvent('gift_granted', { stars_amount: gift.starsAmount });
  return { status: 'granted' };
}

/**
 * Settle a paid gift. Idempotent on the charge id: a redelivery, or a first
 * delivery that recorded the payment and stopped before the grant, finishes
 * the grant once and never twice (grantPremium is idempotent on it too).
 * Throws only on a storage fault, so the webhook can ask Telegram to retry.
 */
export async function completeGiftPayment(
  payment: { invoicePayload: string; totalAmount: number; currency: string; telegramPaymentChargeId: string },
  now: Date = new Date(),
): Promise<GiftPaymentOutcome> {
  const gifts = engageRepo().gifts;
  const chargeId = payment.telegramPaymentChargeId;
  const settled = await gifts.byCharge(chargeId);
  if (settled) return settled.status === 'paid' ? grantWeek(settled, chargeId, now) : { status: 'duplicate' };

  const pending = await gifts.byPayload(payment.invoicePayload);
  if (!pending) {
    logEvent('gift_payment_unmatched', { reason: 'no_matching_gift' });
    return { status: 'rejected', reason: 'No matching gift.' };
  }
  if (payment.currency !== 'XTR' || payment.totalAmount < pending.starsAmount) {
    logEvent('gift_payment_rejected', { reason: 'amount' });
    return { status: 'rejected', reason: 'Amount did not match the gift.' };
  }
  const marked = await gifts.markPaid(payment.invoicePayload, chargeId);
  if (marked === 'missing') return { status: 'rejected', reason: 'This gift was already settled.' };
  const paid = await gifts.byCharge(chargeId);
  if (marked === 'duplicate') return paid?.status === 'paid' ? grantWeek(paid, chargeId, now) : { status: 'duplicate' };
  logEvent('gift_paid', { stars_amount: payment.totalAmount });
  return grantWeek(paid!, chargeId, now);
}

/**
 * Refund one gift: the Stars go back to the gifter's Telegram account and
 * the rest of the recipient's week is taken back. Idempotent on the charge
 * id, like the other Stars refunds, and only ever to the account that paid.
 */
export async function refundGift(
  input: { telegramPaymentChargeId: string; reason: string },
  now: Date = new Date(),
): Promise<{ status: 'refunded' | 'already_refunded'; userId: string | null }> {
  const gifts = engageRepo().gifts;
  const chargeId = input.telegramPaymentChargeId;
  const gift = await gifts.byCharge(chargeId);
  if (!gift) throw new AppError('NOT_FOUND', 'No gift matches that charge.');
  const takeBack = () => {
    const recipient = userOf(gift.recipientUserId);
    if (recipient) {
      revokePremiumOnce(recipient.id, 'stars', `gift:refund:${chargeId}`, input.reason, gift.invoicePayload, `gift:${chargeId}`);
    }
  };
  if (gift.status === 'refunded') {
    takeBack();
    return { status: 'already_refunded', userId: gift.gifterUserId };
  }

  const payer = telegramIdOf(userOf(gift.gifterUserId));
  if (payer === null) {
    throw new AppError('CONFLICT', 'This gift has no linked Telegram account to refund to.');
  }
  const result = await refundStarPayment(payer, chargeId);
  if (!result.ok && !starsAlreadyRefunded(result.error)) {
    logEvent('gift_refund_failed', {});
    throw new AppError('PAYMENT_UNAVAILABLE', 'Telegram did not refund this gift.');
  }
  takeBack();
  await gifts.settle(gift.id, 'refunded', now.toISOString());
  logEvent('gift_refunded', { stars_amount: gift.starsAmount });
  return { status: result.ok ? 'refunded' : 'already_refunded', userId: gift.gifterUserId };
}

/** The `gifting` part of the Fight Camp block; the caller has checked the switch and age. */
export async function giftingStatus(userId: string, now: Date = new Date()): Promise<FightCampStatus['gifting']> {
  const stars = fightCampConfig.giftPremium7dStars;
  if (stars === null || telegramIdOf(userOf(userId)) === null) return null;
  const since = new Date(now.getTime() - GIFT_PREMIUM_DAYS * DAY_MS).toISOString();
  const latest = await engageRepo().gifts.latestGrantedTo(userId, since);
  return {
    stars,
    received:
      latest?.grantedAt
        ? { fromName: latest.gifterUserId ? displayNameOf(latest.gifterUserId) : 'A former squad mate', grantedAt: latest.grantedAt }
        : null,
  };
}
