/**
 * Stripe Checkout subscriptions for the web app.
 *
 * Same posture as the Play rail next door: Stripe is the only authority on
 * what was paid. The browser never reports a payment, a period or an amount;
 * it can only ask us to open a Checkout Session, and later ask us to look one
 * up. Anything that grants premium reads it from Stripe  -  a signed webhook
 * delivery, or our own authenticated API call.
 *
 * NO NEW DEPENDENCY, for the reason `play.ts` gives: the SDK would be a large
 * tree for three HTTP calls and one HMAC. Requests pin `Stripe-Version`, and
 * the webhook endpoint must be created at the same version, because the field
 * this module reads to find the account moved between versions:
 * `invoice.parent.subscription_details` from 2025-03-31.basil onwards.
 *
 * What each event does to the entitlement:
 *
 *  - `invoice.paid` grants through the end of the period the invoice paid
 *    for, plus RENEWAL_GRACE_S. It fires for the first payment and for every
 *    renewal, so it is the one grant path; keyed on the invoice id, so
 *    redelivery settles once. An invoice paid before its subscription's
 *    recorded deletion grants nothing, whenever it arrives.
 *  - `customer.subscription.deleted` ends premium now. Cancelling "at period
 *    end" does not fire it until that end, so paid time is never taken away.
 *  - `charge.refunded` (in full), and a chargeback reported by
 *    `charge.dispute.created` or `charge.dispute.funds_withdrawn`, retire the
 *    one period that payment bought. An inquiry does not.
 *  - `invoice.payment_failed` revokes nothing; it is logged for dunning.
 *
 * `customer.subscription.updated` is deliberately not handled. Only a paid
 * invoice grants, so a lapsed subscription's premium already ends with its
 * last paid period, and Stripe sends `customer.subscription.deleted` whenever
 * a subscription ends. A revoke on an update - delivered late, or retried -
 * could only take back time a later payment bought.
 */
import { createHmac } from 'node:crypto';
import { AppError } from '../../platform/errors';
import { config } from '../../platform/config';
import { secureEquals } from '../../platform/auth';
import { logEvent } from '../../platform/telemetry';
import { entitlementHistory, grantPremium, revokePremiumOnce } from './entitlements';
import { fetchWithTimeout } from './play';

const STRIPE_API = 'https://api.stripe.com/v1';
export const STRIPE_API_VERSION = '2025-11-17.clover';
/**
 * How long a paid period outlives its end. Stripe raises the renewal invoice
 * at the period end and charges it about an hour later, and a card that needs
 * 3D Secure or a retry takes days. A subscription that ends sends
 * `customer.subscription.deleted`, which still retires the period at once, so
 * this only covers a renewal still being collected.
 */
const RENEWAL_GRACE_S = 3 * 86_400;
/** Subscription statuses after which Stripe never charges again. */
const ENDED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired']);
/** Stripe's own libraries default to five minutes; a replay older than that is refused. */
const SIGNATURE_TOLERANCE_S = 300;
const PRICE_TTL_MS = 10 * 60_000;
/** A failed price read is retried sooner, so a Stripe blip does not hide checkout for ten minutes. */
const PRICE_FAILURE_TTL_MS = 60_000;

interface StripeInvoice {
  id: string;
  status: string | null;
  /** Unix seconds; `paid_at` is when Stripe collected the payment, not when we heard. */
  status_transitions?: { paid_at?: number | null } | null;
  billing_reason?: string | null;
  parent?: {
    subscription_details?: { subscription?: string; metadata?: Record<string, string> | null } | null;
  } | null;
  lines?: { data?: { period?: { end?: number } }[] };
  /** On a failed payment: collection attempts that have failed so far. */
  attempt_count?: number;
  /** Unix seconds of Stripe's next automatic retry; null once it has given up. */
  next_payment_attempt?: number | null;
}

interface StripeSubscription {
  id: string;
  metadata?: Record<string, string> | null;
}

export interface StripeEvent {
  type: string;
  data?: { object?: unknown };
}

interface CheckoutSession {
  url?: string | null;
  status?: string | null;
  client_reference_id?: string | null;
  invoice?: StripeInvoice | string | null;
}

export interface PremiumPrice {
  /** Minor units, as Stripe stores it: 999 is $9.99. */
  amount: number;
  currency: string;
  interval: string;
}

export function stripeConfigured(): boolean {
  return config.stripeSecretKey !== '' && config.stripePriceId !== '';
}

async function stripeApi<T>(path: string, form?: URLSearchParams): Promise<T> {
  if (!stripeConfigured()) {
    throw new AppError('PAYMENT_UNAVAILABLE', 'Stripe is not configured on this server.');
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(`${STRIPE_API}${path}`, {
      method: form ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${config.stripeSecretKey}`,
        'Stripe-Version': STRIPE_API_VERSION,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: form?.toString(),
    });
  } catch {
    throw new AppError('PAYMENT_UNAVAILABLE', 'Could not reach Stripe.');
  }
  if (res.status === 404) {
    throw new AppError('PURCHASE_INVALID', 'Stripe did not recognise this checkout.');
  }
  if (!res.ok) {
    // Status only: Stripe error bodies can echo request parameters back.
    logEvent('stripe_api_failed', { status: res.status });
    throw new AppError('PAYMENT_UNAVAILABLE', 'Stripe could not complete this request.');
  }
  return (await res.json()) as T;
}

let cachedPrice: { value: PremiumPrice | null; expiresAt: number } | null = null;

export function resetStripePriceCache(): void {
  cachedPrice = null;
}

/**
 * What premium costs, as Stripe holds it. Null means checkout is not offered:
 * the plan page states the price on the button, and a button without one is
 * not shown at all.
 */
export async function premiumPrice(): Promise<PremiumPrice | null> {
  if (!stripeConfigured()) return null;
  if (cachedPrice && cachedPrice.expiresAt > Date.now()) return cachedPrice.value;
  let value: PremiumPrice | null = null;
  try {
    const price = await stripeApi<{
      unit_amount?: number | null;
      currency?: string;
      recurring?: { interval?: string } | null;
    }>(`/prices/${encodeURIComponent(config.stripePriceId)}`);
    if (typeof price.unit_amount === 'number' && price.currency && price.recurring?.interval) {
      value = { amount: price.unit_amount, currency: price.currency, interval: price.recurring.interval };
    }
  } catch {
    value = null;
  }
  cachedPrice = { value, expiresAt: Date.now() + (value ? PRICE_TTL_MS : PRICE_FAILURE_TTL_MS) };
  return value;
}

/**
 * Open a hosted Checkout page for the premium price.
 *
 * The account id goes in twice. `client_reference_id` lets the success
 * redirect prove the session is the caller's; the subscription's metadata is
 * copied onto every invoice it ever raises, which is how a renewal months from
 * now is traced back to an account. Return URLs come from APP_PUBLIC_URL,
 * never from the request.
 */
export async function createCheckoutSession(userId: string): Promise<string> {
  const session = await stripeApi<CheckoutSession>(
    '/checkout/sessions',
    new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': config.stripePriceId,
      'line_items[0][quantity]': '1',
      client_reference_id: userId,
      'subscription_data[metadata][userId]': userId,
      success_url: `${config.appPublicUrl}/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appPublicUrl}/plan?checkout=cancelled`,
    }),
  );
  if (!session.url) {
    throw new AppError('PAYMENT_UNAVAILABLE', 'Stripe returned no checkout page.');
  }
  return session.url;
}

/**
 * Grant the period a paid invoice covers. The service period lives on the
 * line items  -  Stripe's docs say so explicitly of `invoice.period_end`, which
 * is an invoicing window, not what was bought.
 */
function grantFromInvoice(userId: string, invoice: StripeInvoice): void {
  if (invoice.status !== 'paid') return;
  const end = Math.max(0, ...(invoice.lines?.data ?? []).map((line) => line.period?.end ?? 0));
  if (end === 0) {
    // Guessing a period would be inventing an entitlement.
    logEvent('stripe_invoice_without_period', { invoice: invoice.id });
    return;
  }
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (subscription && paidBeforeDeletion(userId, subscription, invoice)) {
    logEvent('stripe_invoice_after_deletion', { invoice: invoice.id });
    return;
  }
  grantPremium({
    userId,
    source: 'stripe',
    externalId: `stripe:${invoice.id}`,
    providerRef: subscription,
    premiumUntil: new Date((end + RENEWAL_GRACE_S) * 1000).toISOString(),
    reason: `stripe:${invoice.billing_reason ?? 'invoice'}`,
  });
}

/**
 * True when this subscription's deletion is already recorded and the invoice
 * was paid before it: a delivery that lost the race with the deletion (Stripe
 * retries a failed one for days), whose period the deletion already ended.
 * Stripe never restarts a deleted subscription, so an invoice paid after the
 * deletion is a customer settling an overdue bill, and that still grants. A
 * paid invoice always carries `paid_at` at the pinned version; one without it
 * cannot show it came later, so it is treated as earlier.
 */
function paidBeforeDeletion(userId: string, subscription: string, invoice: StripeInvoice): boolean {
  const deletion = entitlementHistory(userId).find((g) => g.externalId === `stripe:deleted:${subscription}`);
  if (!deletion) return false;
  const paidAt = invoice.status_transitions?.paid_at;
  return !paidAt || paidAt * 1000 <= Date.parse(deletion.createdAt);
}

/**
 * A subscription this account bought through Checkout that Stripe may still
 * charge, or null.
 *
 * Asked of Stripe rather than read from the ledger alone: a missed or late
 * deletion would otherwise stop the account ever subscribing again. Only
 * subscriptions the ledger has granted from and has no deletion for are looked
 * up, so a first purchase makes no extra call.
 */
export async function liveSubscriptionOf(userId: string): Promise<string | null> {
  const history = entitlementHistory(userId);
  const deleted = (ref: string) => history.some((g) => g.externalId === `stripe:deleted:${ref}`);
  const candidates = new Set(
    history.flatMap((g) =>
      g.source === 'stripe' && g.action === 'grant' && g.providerRef && !deleted(g.providerRef) ? [g.providerRef] : [],
    ),
  );
  for (const id of candidates) {
    try {
      const sub = await stripeApi<{ status?: string }>(`/subscriptions/${encodeURIComponent(id)}`);
      if (sub.status && !ENDED_SUBSCRIPTION_STATUSES.has(sub.status)) return id;
    } catch (err) {
      // One Stripe does not know (a test-mode id after a switch to live keys) will never be charged.
      if (!(err instanceof AppError && err.code === 'PURCHASE_INVALID')) throw err;
    }
  }
  return null;
}

/**
 * Settle a Checkout Session the buyer has just returned from.
 *
 * The webhook would get there on its own, usually within seconds  -  but
 * "usually" is the user staring at a free plan they have just paid for, and on
 * a deployment whose webhook is misconfigured it is never. Both paths key the
 * grant on the same invoice id, so whichever lands second is a duplicate.
 */
export async function syncCheckoutSession(userId: string, sessionId: string): Promise<void> {
  const session = await stripeApi<CheckoutSession>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=invoice`,
  );
  if (session.client_reference_id !== userId) {
    logEvent('stripe_session_account_mismatch', { userId });
    throw new AppError('PURCHASE_INVALID', 'This checkout belongs to a different account.');
  }
  if (session.status === 'complete' && session.invoice && typeof session.invoice === 'object') {
    grantFromInvoice(userId, session.invoice);
  }
}

/**
 * Verify a `Stripe-Signature` header against the exact bytes received.
 * https://docs.stripe.com/webhooks#verify-manually  -  v1 only (v0 is a test
 * decoy and anything else is a downgrade), constant-time compared, and refused
 * outside the tolerance window so a captured delivery cannot be replayed.
 */
export function stripeSignatureValid(
  payload: Buffer,
  header: string | undefined,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!secret || !header) return false;
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=');
    if (key === 't' && value) timestamp = value;
    else if (key === 'v1' && value) signatures.push(value);
  }
  const t = Number(timestamp);
  if (!Number.isFinite(t) || Math.abs(nowMs / 1000 - t) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest('hex');
  return signatures.some((signature) => secureEquals(signature, expected));
}

export async function handleStripeEvent(event: StripeEvent): Promise<void> {
  if (event.type === 'invoice.paid') {
    const invoice = event.data?.object as StripeInvoice;
    const userId = invoice.parent?.subscription_details?.metadata?.userId;
    if (!userId) {
      // Not one of ours (a manual invoice, another product on this account),
      // or an endpoint created at an API version older than the pin.
      logEvent('stripe_invoice_unmapped', { invoice: invoice.id });
      return;
    }
    grantFromInvoice(userId, invoice);
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data?.object as StripeSubscription;
    const userId = subscription.metadata?.userId;
    if (!userId) return;
    /*
     * Retires this subscription's grants only. activePremiumUntil then keeps
     * any Play or Stars period, and any later Stripe subscription, through
     * its own end. Periods are not added together and a deleted subscription
     * does not wipe the others.
     */
    revokePremiumOnce(
      userId,
      'stripe',
      `stripe:deleted:${subscription.id}`,
      'stripe:subscription_deleted',
      subscription.id,
    );
    return;
  }

  if (event.type === 'invoice.payment_failed') {
    onPaymentFailed(event.data?.object as StripeInvoice);
    return;
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data?.object as StripeCharge;
    if (!charge.refunded) {
      // Partial: the purchase stands. Logged for support, nothing revoked.
      logEvent('stripe_charge_partially_refunded', {
        charge: charge.id,
        amountRefunded: charge.amount_refunded ?? null,
      });
      return;
    }
    await revokeForPayment(charge.id, charge.payment_intent, `stripe:refund:${charge.id}`, 'stripe:charge_refunded');
    return;
  }

  /*
   * A chargeback is reported by `created` and again by `funds_withdrawn` when
   * Stripe takes the money; both share the dispute's key, so it settles once.
   * An inquiry (status `warning_*`) is the issuer asking a question: no money
   * has moved and most never escalate, so it revokes nothing. One that does
   * escalate turns the same dispute into a chargeback and debits the account
   * (Stripe's testing docs), which `funds_withdrawn` reports; the shared key
   * settles it once whichever of the two events arrive.
   */
  if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.funds_withdrawn') {
    const dispute = event.data?.object as StripeDispute;
    if (dispute.status?.startsWith('warning_')) {
      logEvent('stripe_dispute_inquiry', { dispute: dispute.id, status: dispute.status });
      return;
    }
    await revokeForPayment(
      dispute.charge ?? dispute.id,
      dispute.payment_intent,
      `stripe:dispute:${dispute.id}`,
      'stripe:charge_disputed',
    );
  }
}

/**
 * A renewal charge failed. Nothing is revoked: the period already paid for
 * stands, Stripe retries on its own schedule, and premium already stops at the
 * last paid period's end if no retry ever lands, because only a paid invoice
 * grants. What ops and dunning need is to see it happen, and this line is all
 * of that. It writes no state, so a redelivery only repeats the line.
 */
function onPaymentFailed(invoice: StripeInvoice): void {
  const details = invoice.parent?.subscription_details;
  logEvent('stripe_invoice_payment_failed', {
    invoice: invoice.id,
    subscription: details?.subscription ?? null,
    userId: details?.metadata?.userId ?? null,
    attempt: invoice.attempt_count ?? null,
    nextAttemptAt: invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000).toISOString()
      : null,
  });
}

interface StripeCharge {
  id: string;
  payment_intent?: string | null;
  /** True only once the whole amount is refunded; a partial refund leaves it false. */
  refunded?: boolean;
  amount_refunded?: number;
}

interface StripeDispute {
  id: string;
  charge?: string | null;
  payment_intent?: string | null;
  /** `warning_*` for an inquiry; anything else is a chargeback. */
  status?: string;
}

interface InvoicePaymentList {
  data?: { invoice?: StripeInvoice | string | null }[];
}

/**
 * The invoice a payment intent paid, and the account and subscription it
 * names.
 *
 * At the pinned version neither a Charge nor a PaymentIntent carries its
 * invoice: 2025-03-31.basil removed the field for InvoicePayment objects, and
 * Stripe's changelog points at this list for the link. The invoice is expanded
 * in the same call, and the account is read from exactly the field that
 * granted the period - the subscription metadata Checkout stamped. A Checkout
 * subscription's payment intent pays one invoice, so the first entry is it.
 *
 * Null for a payment that is not ours. A Stripe outage surfaces as the
 * PAYMENT_UNAVAILABLE stripeApi throws, which the webhook route answers with
 * a 503 so Stripe redelivers. Nothing has been written by then, and the
 * revoke is keyed on the charge or dispute, so the redelivery settles once.
 */
async function paidInvoiceFor(
  paymentIntent: string,
): Promise<{ invoice: string; userId: string; subscription: string } | null> {
  const query = new URLSearchParams({
    'payment[type]': 'payment_intent',
    'payment[payment_intent]': paymentIntent,
    'expand[]': 'data.invoice',
  });
  const list = await stripeApi<InvoicePaymentList>(`/invoice_payments?${query}`);
  const invoice = list.data?.[0]?.invoice;
  if (!invoice || typeof invoice !== 'object') return null;
  const details = invoice.parent?.subscription_details;
  if (!details?.metadata?.userId || !details.subscription) return null;
  return { invoice: invoice.id, userId: details.metadata.userId, subscription: details.subscription };
}

/**
 * Take back the period one payment bought: a full refund, or a chargeback.
 *
 * Charge-scoped, like the Stars refund. `revokesExternalId` names the grant
 * that invoice made, so a later renewal on the same subscription, and any
 * other rail's period, stays. Keyed on the charge or the dispute, each of
 * which happens to a payment once.
 *
 * A payment it cannot place is logged and acknowledged, never thrown: Stripe
 * redelivers anything that is not a 2xx, and a payment that is not ours will
 * not become ours on the next attempt.
 */
async function revokeForPayment(
  chargeId: string,
  paymentIntent: string | null | undefined,
  externalId: string,
  reason: string,
): Promise<void> {
  const paid = paymentIntent ? await paidInvoiceFor(paymentIntent) : null;
  if (!paid) {
    logEvent('stripe_charge_unmapped', { charge: chargeId, reason });
    return;
  }
  revokePremiumOnce(paid.userId, 'stripe', externalId, reason, paid.subscription, `stripe:${paid.invoice}`);
}
