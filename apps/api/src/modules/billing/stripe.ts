/**
 * Stripe Checkout subscriptions for the web app.
 *
 * Same posture as the Play rail next door: Stripe is the only authority on
 * what was paid. The browser never reports a payment, a period or an amount;
 * it can only ask us to open a Checkout Session, and later ask us to look one
 * up. Anything that grants premium reads it from Stripe — a signed webhook
 * delivery, or our own authenticated API call.
 *
 * NO NEW DEPENDENCY, for the reason `play.ts` gives: the SDK would be a large
 * tree for three HTTP calls and one HMAC. Requests pin `Stripe-Version`, and
 * the webhook endpoint must be created at the same version, because the field
 * this module reads to find the account moved between versions:
 * `invoice.parent.subscription_details` from 2025-03-31.basil onwards.
 *
 * Two events drive the entitlement:
 *
 *  - `invoice.paid` grants through the end of the period the invoice paid
 *    for. It fires for the first payment and for every renewal, so it is the
 *    one grant path; keyed on the invoice id, so redelivery settles once.
 *  - `customer.subscription.deleted` ends premium now. Cancelling "at period
 *    end" does not fire it until that end, so paid time is never taken away.
 */
import { createHmac } from 'node:crypto';
import { AppError } from '../../platform/errors';
import { config } from '../../platform/config';
import { secureEquals } from '../../platform/auth';
import { logEvent } from '../../platform/telemetry';
import { entitlementHistory, grantPremium, revokePremium } from './entitlements';
import { fetchWithTimeout } from './play';

const STRIPE_API = 'https://api.stripe.com/v1';
export const STRIPE_API_VERSION = '2025-11-17.clover';
/** Stripe's own libraries default to five minutes; a replay older than that is refused. */
const SIGNATURE_TOLERANCE_S = 300;
const PRICE_TTL_MS = 10 * 60_000;
/** A failed price read is retried sooner, so a Stripe blip does not hide checkout for ten minutes. */
const PRICE_FAILURE_TTL_MS = 60_000;

interface StripeInvoice {
  id: string;
  status: string | null;
  billing_reason?: string | null;
  parent?: {
    subscription_details?: { subscription?: string; metadata?: Record<string, string> | null } | null;
  } | null;
  lines?: { data?: { period?: { end?: number } }[] };
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
 * line items — Stripe's docs say so explicitly of `invoice.period_end`, which
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
  grantPremium({
    userId,
    source: 'stripe',
    externalId: `stripe:${invoice.id}`,
    providerRef: invoice.parent?.subscription_details?.subscription,
    premiumUntil: new Date(end * 1000).toISOString(),
    reason: `stripe:${invoice.billing_reason ?? 'invoice'}`,
  });
}

/**
 * Settle a Checkout Session the buyer has just returned from.
 *
 * The webhook would get there on its own, usually within seconds — but
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
 * https://docs.stripe.com/webhooks#verify-manually — v1 only (v0 is a test
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

export function handleStripeEvent(event: StripeEvent): void {
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
     * Only when this subscription is still the account's latest entitlement.
     * Stripe does not order deliveries: the deletion of a subscription the
     * user has since replaced — or one superseded by a Play renewal — must
     * not end the period they paid for elsewhere.
     */
    if (entitlementHistory(userId)[0]?.providerRef !== subscription.id) {
      logEvent('stripe_deletion_superseded', { userId });
      return;
    }
    revokePremium(
      userId,
      'stripe',
      `stripe:deleted:${subscription.id}`,
      'stripe:subscription_deleted',
      subscription.id,
    );
  }
}
