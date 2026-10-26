/**
 * Stripe billing routes.
 *
 * Same three ways to give the product away as the Play rail: an unconfigured
 * deployment, a forged notification, a purchase claimed by the wrong account,
 * plus one Stripe adds: the webhook signature covers the exact bytes Stripe
 * sent, so a body that was parsed and re-serialised before verification can
 * never verify. Every webhook case below is signed over the raw string it
 * sends, the way Stripe signs it.
 *
 * `fetch` is stubbed rather than reaching Stripe. Payload shapes follow the
 * pinned API version (2025-11-17.clover): an invoice names its subscription
 * and that subscription's metadata under `parent.subscription_details`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@aquazerofit/shared';

// logEvent is silent under test, and for the events that change no state (a
// failed renewal, a partial refund, an unmapped charge) the line it writes is
// the whole observable outcome, so it is captured rather than discarded.
const { logEvent } = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('../platform/telemetry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../platform/telemetry')>();
  return { ...actual, logEvent };
});

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-stripe-billing-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { effectiveTier, entitlementHistory, grantPremium } = await import(
  '../modules/billing/entitlements'
);
const { resetStripePriceCache } = await import('../modules/billing/stripe');
const { signTelegramInitData } = await import('../modules/auth/telegram');
const { resetTelegramNewAccountLimits } = await import('../modules/auth/service');

const app = createApp();
const base = '/api/v1';
const WHSEC = 'whsec_test_local_only';

const savedEnv = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
};

let token = '';
let userId = '';
let otherUserId = '';
const auth = () => ({ Authorization: `Bearer ${token}` });

const nowS = () => Math.floor(Date.now() / 1000);
const inDaysS = (n: number) => nowS() + n * 86_400;
/** How long a Stripe period outlives its end while the renewal is collected. */
const GRACE_S = 3 * 86_400;

function userDoc(): User {
  return getStore().byId<User>('users', userId)!;
}

/** Sign `body` the way Stripe does: HMAC-SHA256 over `${t}.${body}`. */
function signature(body: string, secret = WHSEC, t = nowS()): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

function deliver(event: unknown, sign: (body: string) => string = (b) => signature(b)) {
  const body = JSON.stringify(event);
  return request(app)
    .post(`${base}/billing/stripe/webhook`)
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', sign(body))
    .send(body);
}

const event = (type: string, object: unknown) => ({
  id: `evt_${crypto.randomUUID()}`,
  object: 'event',
  type,
  data: { object },
});

function invoice(opts: { id: string; sub: string; uid: string; end: number; status?: string; paidAt?: number }) {
  return {
    id: opts.id,
    object: 'invoice',
    status: opts.status ?? 'paid',
    status_transitions: { paid_at: opts.paidAt ?? nowS() },
    billing_reason: 'subscription_create',
    parent: {
      type: 'subscription_details',
      subscription_details: { subscription: opts.sub, metadata: { userId: opts.uid } },
    },
    lines: { object: 'list', data: [{ id: 'il_1', period: { start: nowS(), end: opts.end } }] },
  };
}

const subscription = (id: string, uid: string) => ({
  id,
  object: 'subscription',
  status: 'canceled',
  metadata: { userId: uid },
});

/** Stripe answers every call with `body`; the requests are kept for assertions. */
function stubStripe(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

/**
 * Stripe answers by method and path, so a test pins which calls were made and
 * in what order. An unrouted call answers 500, which fails any assertion that
 * depended on it rather than passing by accident.
 */
function routeStripe(routes: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`;
    const found = key in routes;
    return new Response(JSON.stringify(found ? routes[key] : { error: { message: `unrouted: ${key}` } }), {
      status: found ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

const callsOf = (spy: ReturnType<typeof routeStripe>) =>
  spy.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`);

function grantStripe(uid: string, sub: string) {
  grantPremium({
    userId: uid,
    source: 'stripe',
    externalId: `stripe:in_${crypto.randomUUID()}`,
    providerRef: sub,
    premiumUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
}

function grantsFor(externalId: string) {
  return entitlementHistory(userId).filter((g) => g.externalId === externalId);
}

async function register(email: string) {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email, password: 'CorrectHorse9Battery' });
  expect(res.status).toBe(201);
  return res.body as { accessToken: string; user: { id: string } };
}

beforeAll(async () => {
  const me = await register('stripe-billing@example.com');
  token = me.accessToken;
  userId = me.user.id;
  otherUserId = (await register('stripe-other@example.com')).user.id;
});

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_stub';
  process.env.STRIPE_PRICE_ID = 'price_test_premium';
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  process.env.APP_PUBLIC_URL = 'https://staging.aquazerofit.test';
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStripePriceCache();
  // premiumUntil is recomputed from the ledger, so a reset that only nulls
  // the user field would leave an earlier invoice covering the next test.
  const store = getStore();
  for (const id of [userId, otherUserId]) {
    if (!id) continue;
    for (const grant of store.where<{ id: string }>(
      'ledger',
      (d) => (d as { type?: string }).type === 'entitlementGrant' && (d as { userId?: string }).userId === id,
    )) {
      store.delete('ledger', grant.id);
    }
    const user = store.byId<User>('users', id);
    if (user?.premiumUntil) store.upsert('users', { ...user, premiumUntil: null });
  }
});

afterAll(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort on Windows */
  }
});

describe('POST /billing/stripe/webhook', () => {
  it('trusts nobody when no signing secret is configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await deliver(
      event('invoice.paid', invoice({ id: 'in_nosecret', sub: 'sub_a', uid: userId, end: inDaysS(30) })),
      (b) => signature(b, ''),
    );

    expect(res.status).toBe(401);
    expect(effectiveTier(userDoc())).toBe('free');
  });

  it('refuses a payload signed with any other secret', async () => {
    const res = await deliver(
      event('invoice.paid', invoice({ id: 'in_forged', sub: 'sub_a', uid: userId, end: inDaysS(30) })),
      (b) => signature(b, 'whsec_guessed'),
    );

    expect(res.status).toBe(401);
    expect(effectiveTier(userDoc())).toBe('free');
  });

  it('refuses a correctly signed delivery replayed outside the tolerance window', async () => {
    const res = await deliver(
      event('invoice.paid', invoice({ id: 'in_replayed', sub: 'sub_a', uid: userId, end: inDaysS(30) })),
      (b) => signature(b, WHSEC, nowS() - 600),
    );

    expect(res.status).toBe(401);
    expect(effectiveTier(userDoc())).toBe('free');
  });

  it('grants through the period the invoice paid for, once per invoice however often it arrives', async () => {
    const end = inDaysS(30);
    const paid = event('invoice.paid', invoice({ id: 'in_first', sub: 'sub_a', uid: userId, end }));

    expect((await deliver(paid)).status).toBe(200);
    expect((await deliver(paid)).status).toBe(200);

    expect(effectiveTier(userDoc())).toBe('premium');
    expect(userDoc().premiumUntil).toBe(new Date((end + GRACE_S) * 1000).toISOString());
    expect(grantsFor('stripe:in_first')).toHaveLength(1);
    expect(grantsFor('stripe:in_first')[0]?.providerRef).toBe('sub_a');
  });

  it('grants nothing for an invoice that is not paid', async () => {
    const res = await deliver(
      event(
        'invoice.paid',
        invoice({ id: 'in_open', sub: 'sub_a', uid: userId, end: inDaysS(30), status: 'open' }),
      ),
    );

    expect(res.status).toBe(200);
    expect(effectiveTier(userDoc())).toBe('free');
  });

  it('acknowledges an invoice for an account that no longer exists instead of failing forever', async () => {
    const res = await deliver(
      event('invoice.paid', invoice({ id: 'in_gone', sub: 'sub_gone', uid: 'usr_deleted', end: inDaysS(30) })),
    );

    expect(res.status).toBe(200);
  });

  it('ends premium when the subscription is deleted', async () => {
    await deliver(event('invoice.paid', invoice({ id: 'in_del', sub: 'sub_del', uid: userId, end: inDaysS(30) })));
    expect(effectiveTier(userDoc())).toBe('premium');

    const res = await deliver(event('customer.subscription.deleted', subscription('sub_del', userId)));

    expect(res.status).toBe(200);
    expect(effectiveTier(userDoc())).toBe('free');
  });

  /*
   * Stripe does not order deliveries. A cancelled subscription's deletion that
   * arrives after the user has already bought a new one must not take away the
   * month they just paid for.
   */
  it('removes a replaced subscription and keeps the period of the one that replaced it', async () => {
    const end = inDaysS(30);
    await deliver(event('invoice.paid', invoice({ id: 'in_old', sub: 'sub_old', uid: userId, end: inDaysS(5) })));
    await deliver(event('invoice.paid', invoice({ id: 'in_new', sub: 'sub_new', uid: userId, end })));

    await deliver(event('customer.subscription.deleted', subscription('sub_old', userId)));

    expect(effectiveTier(userDoc())).toBe('premium');
    expect(userDoc().premiumUntil).toBe(new Date((end + GRACE_S) * 1000).toISOString());
  });

  /*
   * Stripe raises a renewal invoice at the period end and charges it about an
   * hour later, longer when a card needs 3D Secure or a retry. The paid period
   * must not lapse into the free tier while that happens.
   */
  it('keeps premium in the hours after the period ends while the renewal is collected', async () => {
    await deliver(
      event('invoice.paid', invoice({ id: 'in_renewing', sub: 'sub_renewing', uid: userId, end: nowS() - 3600 })),
    );

    expect(effectiveTier(userDoc())).toBe('premium');
  });

  it('ends premium once the grace runs out with no renewal', async () => {
    await deliver(
      event(
        'invoice.paid',
        invoice({ id: 'in_lapsed', sub: 'sub_lapsed', uid: userId, end: nowS() - GRACE_S - 3600 }),
      ),
    );

    expect(effectiveTier(userDoc())).toBe('free');
  });

  it('ignores event types it does not act on', async () => {
    const res = await deliver(event('customer.created', { id: 'cus_1', object: 'customer' }));
    expect(res.status).toBe(200);
  });

  /*
   * Lifecycle and reversal events. A charge carries no invoice at the pinned
   * version (Charge.invoice went in 2025-03-31.basil), so refunds and disputes
   * reach the account through Stripe's invoice_payments list, stubbed here.
   */
  describe('subscription lifecycle and payment reversals', () => {
    const iso = (s: number) => new Date(s * 1000).toISOString();
    const revokes = () => entitlementHistory(userId).filter((g) => g.action === 'revoke');
    const updated = (id: string, fields: Record<string, unknown>) => ({
      id,
      object: 'subscription',
      status: 'active',
      cancel_at_period_end: false,
      metadata: { userId },
      ...fields,
    });
    const charge = (id: string, fields: Record<string, unknown> = {}) => ({
      id,
      object: 'charge',
      amount: 999,
      amount_refunded: 999,
      refunded: true,
      payment_intent: `pi_${id}`,
      ...fields,
    });
    /** The invoice_payments list for one payment intent, its invoice expanded. */
    const paymentsFor = (paidInvoice: unknown) => ({
      object: 'list',
      data: paidInvoice
        ? [{ id: 'inpay_1', object: 'invoice_payment', invoice: paidInvoice, status: 'paid' }]
        : [],
    });

    beforeEach(() => {
      logEvent.mockClear();
    });

    it('keeps the paid period when the subscriber cancels at period end', async () => {
      const end = inDaysS(30);
      await deliver(event('invoice.paid', invoice({ id: 'in_cape', sub: 'sub_cape', uid: userId, end })));

      const res = await deliver(
        event('customer.subscription.updated', updated('sub_cape', { cancel_at_period_end: true, cancel_at: end })),
      );

      expect(res.status).toBe(200);
      expect(effectiveTier(userDoc())).toBe('premium');
      expect(userDoc().premiumUntil).toBe(iso(end + GRACE_S));
      expect(revokes()).toHaveLength(0);
    });

    /*
     * Regression: an `unpaid` update used to revoke the whole subscription.
     * Its first delivery failed, the customer paid the open invoice, and
     * Stripe's retry of the old update then retired the period just paid
     * for. Only a paid invoice grants, so a lapse needs no revoke at all.
     */
    it('leaves a renewal standing when an older lapse is delivered after it', async () => {
      await deliver(event('invoice.paid', invoice({ id: 'in_late1', sub: 'sub_late', uid: userId, end: inDaysS(2) })));
      const end = inDaysS(30);
      await deliver(event('invoice.paid', invoice({ id: 'in_late2', sub: 'sub_late', uid: userId, end })));

      const late = await deliver(event('customer.subscription.updated', updated('sub_late', { status: 'unpaid' })));

      expect(late.status).toBe(200);
      expect(effectiveTier(userDoc())).toBe('premium');
      expect(userDoc().premiumUntil).toBe(iso(end + GRACE_S));
      expect(revokes()).toHaveLength(0);
    });

    it('settles a redelivered deletion once', async () => {
      await deliver(event('invoice.paid', invoice({ id: 'in_twice', sub: 'sub_twice', uid: userId, end: inDaysS(30) })));
      const deleted = event('customer.subscription.deleted', subscription('sub_twice', userId));

      await deliver(deleted);
      await deliver(deleted);

      expect(effectiveTier(userDoc())).toBe('free');
      expect(revokes()).toHaveLength(1);
    });

    it('records a failed renewal for dunning and leaves the paid period alone', async () => {
      const end = inDaysS(30);
      await deliver(event('invoice.paid', invoice({ id: 'in_dunning_ok', sub: 'sub_dunning', uid: userId, end })));
      const failed = event('invoice.payment_failed', {
        ...invoice({ id: 'in_dunning', sub: 'sub_dunning', uid: userId, end: inDaysS(60), status: 'open' }),
        attempt_count: 1,
        next_payment_attempt: inDaysS(3),
      });

      expect((await deliver(failed)).status).toBe(200);
      expect((await deliver(failed)).status).toBe(200);

      expect(effectiveTier(userDoc())).toBe('premium');
      expect(userDoc().premiumUntil).toBe(iso(end + GRACE_S));
      expect(revokes()).toHaveLength(0);
      expect(logEvent).toHaveBeenCalledWith(
        'stripe_invoice_payment_failed',
        expect.objectContaining({ invoice: 'in_dunning', subscription: 'sub_dunning', userId, attempt: 1 }),
      );
    });

    it('retires only the period a fully refunded payment bought, however often the refund arrives', async () => {
      const otherEnd = inDaysS(10);
      await deliver(event('invoice.paid', invoice({ id: 'in_other', sub: 'sub_other', uid: userId, end: otherEnd })));
      const refundedInvoice = invoice({ id: 'in_refund', sub: 'sub_refund', uid: userId, end: inDaysS(30) });
      await deliver(event('invoice.paid', refundedInvoice));
      const stripe = stubStripe(paymentsFor(refundedInvoice));
      const refund = event('charge.refunded', charge('ch_refund'));

      expect((await deliver(refund)).status).toBe(200);
      expect((await deliver(refund)).status).toBe(200);

      // The other subscription's period stands; the refunded one is gone.
      expect(userDoc().premiumUntil).toBe(iso(otherEnd + GRACE_S));
      expect(revokes()).toHaveLength(1);
      expect(revokes()[0]).toMatchObject({
        externalId: 'stripe:refund:ch_refund',
        revokesExternalId: 'stripe:in_refund',
        providerRef: 'sub_refund',
      });
      const asked = new URL(String(stripe.mock.calls[0]![0]));
      expect(asked.pathname).toBe('/v1/invoice_payments');
      expect(asked.searchParams.get('payment[type]')).toBe('payment_intent');
      expect(asked.searchParams.get('payment[payment_intent]')).toBe('pi_ch_refund');
      expect(asked.searchParams.getAll('expand[]')).toContain('data.invoice');
    });

    /*
     * A lookup that failed because Stripe was unreachable or throttling must
     * not be acknowledged: that would drop the revoke for good. Nothing is
     * written before the lookup, so the redelivery starts clean.
     */
    it.each([503, 429])(
      'answers non-2xx when the invoice lookup gets %i, and the redelivery revokes once',
      async (status) => {
        const refundedInvoice = invoice({ id: `in_outage_${status}`, sub: 'sub_outage', uid: userId, end: inDaysS(30) });
        await deliver(event('invoice.paid', refundedInvoice));
        const refund = event('charge.refunded', charge(`ch_outage_${status}`));
        stubStripe({ error: { message: 'unavailable' } }, status);

        const first = await deliver(refund);

        expect(first.status).toBe(503);
        expect(effectiveTier(userDoc())).toBe('premium');
        expect(revokes()).toHaveLength(0);

        vi.restoreAllMocks();
        stubStripe(paymentsFor(refundedInvoice));
        expect((await deliver(refund)).status).toBe(200);
        expect((await deliver(refund)).status).toBe(200);

        expect(effectiveTier(userDoc())).toBe('free');
        expect(revokes()).toHaveLength(1);
      },
    );

    /*
     * Stripe does not order deliveries, and a failed invoice.paid delivery is
     * retried for days. Whichever arrives first, a refunded payment's period
     * stays retired.
     */
    it('keeps a refunded period retired when its invoice is granted after the refund', async () => {
      const refundedInvoice = invoice({ id: 'in_refund_first', sub: 'sub_refund_first', uid: userId, end: inDaysS(30) });
      stubStripe(paymentsFor(refundedInvoice));
      expect((await deliver(event('charge.refunded', charge('ch_refund_first')))).status).toBe(200);

      expect((await deliver(event('invoice.paid', refundedInvoice))).status).toBe(200);

      expect(effectiveTier(userDoc())).toBe('free');
      expect(userDoc().premiumUntil).toBeNull();
    });

    it('grants nothing for an invoice paid before its subscription was deleted but delivered after', async () => {
      await deliver(event('customer.subscription.deleted', subscription('sub_gone_first', userId)));

      const late = await deliver(
        event(
          'invoice.paid',
          invoice({ id: 'in_gone_first', sub: 'sub_gone_first', uid: userId, end: inDaysS(30), paidAt: nowS() - 3600 }),
        ),
      );

      expect(late.status).toBe(200);
      expect(effectiveTier(userDoc())).toBe('free');
      expect(grantsFor('stripe:in_gone_first')).toHaveLength(0);
    });

    it('grants an overdue invoice the customer pays after the subscription has ended', async () => {
      await deliver(event('customer.subscription.deleted', subscription('sub_overdue', userId)));

      await deliver(
        event(
          'invoice.paid',
          invoice({ id: 'in_overdue', sub: 'sub_overdue', uid: userId, end: inDaysS(20), paidAt: nowS() + 60 }),
        ),
      );

      expect(effectiveTier(userDoc())).toBe('premium');
    });

    const dispute = (id: string, status: string) => ({
      id,
      object: 'dispute',
      charge: `ch_${id}`,
      payment_intent: `pi_${id}`,
      amount: 999,
      reason: 'fraudulent',
      status,
    });

    it('retires the disputed payment\'s period once, whether created or funds_withdrawn says so', async () => {
      const disputedInvoice = invoice({ id: 'in_disputed', sub: 'sub_disputed', uid: userId, end: inDaysS(30) });
      await deliver(event('invoice.paid', disputedInvoice));
      stubStripe(paymentsFor(disputedInvoice));

      const res = await deliver(event('charge.dispute.created', dispute('dp_1', 'needs_response')));
      await deliver(event('charge.dispute.funds_withdrawn', dispute('dp_1', 'needs_response')));

      expect(res.status).toBe(200);
      expect(effectiveTier(userDoc())).toBe('free');
      expect(revokes()).toHaveLength(1);
      expect(revokes()[0]).toMatchObject({
        externalId: 'stripe:dispute:dp_1',
        revokesExternalId: 'stripe:in_disputed',
      });
    });

    /*
     * An inquiry (status warning_*) is the issuer asking a question: no money
     * has moved and most never escalate. If one does, Stripe moves the same
     * dispute to a chargeback and takes the funds, which funds_withdrawn
     * reports.
     */
    it('keeps premium through an inquiry and retires it when the inquiry escalates', async () => {
      const disputedInvoice = invoice({ id: 'in_inquiry', sub: 'sub_inquiry', uid: userId, end: inDaysS(30) });
      await deliver(event('invoice.paid', disputedInvoice));
      const stripe = stubStripe(paymentsFor(disputedInvoice));

      const inquiry = await deliver(event('charge.dispute.created', dispute('dp_inq', 'warning_needs_response')));

      expect(inquiry.status).toBe(200);
      expect(effectiveTier(userDoc())).toBe('premium');
      expect(stripe).not.toHaveBeenCalled();
      expect(logEvent).toHaveBeenCalledWith('stripe_dispute_inquiry', expect.objectContaining({ dispute: 'dp_inq' }));

      await deliver(event('charge.dispute.funds_withdrawn', dispute('dp_inq', 'needs_response')));

      expect(effectiveTier(userDoc())).toBe('free');
      expect(revokes()[0]?.externalId).toBe('stripe:dispute:dp_inq');
    });

    it('logs a partial refund and keeps premium, without asking Stripe anything', async () => {
      await deliver(event('invoice.paid', invoice({ id: 'in_partial', sub: 'sub_partial', uid: userId, end: inDaysS(30) })));
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await deliver(
        event('charge.refunded', charge('ch_partial', { refunded: false, amount_refunded: 300 })),
      );

      expect(res.status).toBe(200);
      expect(effectiveTier(userDoc())).toBe('premium');
      expect(revokes()).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(logEvent).toHaveBeenCalledWith(
        'stripe_charge_partially_refunded',
        expect.objectContaining({ charge: 'ch_partial' }),
      );
    });

    it('acknowledges a refund it cannot trace to an account and revokes nothing', async () => {
      await deliver(event('invoice.paid', invoice({ id: 'in_mapped', sub: 'sub_mapped', uid: userId, end: inDaysS(30) })));
      stubStripe(paymentsFor(null));

      const res = await deliver(event('charge.refunded', charge('ch_unmapped')));

      expect(res.status).toBe(200);
      expect(effectiveTier(userDoc())).toBe('premium');
      expect(revokes()).toHaveLength(0);
      expect(logEvent).toHaveBeenCalledWith('stripe_charge_unmapped', expect.objectContaining({ charge: 'ch_unmapped' }));
    });

    it('acknowledges a dispute with no payment intent without a lookup', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await deliver(
        event('charge.dispute.created', { id: 'dp_orphan', object: 'dispute', charge: 'ch_orphan', payment_intent: null }),
      );

      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(logEvent).toHaveBeenCalledWith('stripe_charge_unmapped', expect.objectContaining({ charge: 'ch_orphan' }));
    });
  });
});

describe('POST /billing/stripe/checkout', () => {
  it('requires a signed-in account', async () => {
    const res = await request(app).post(`${base}/billing/stripe/checkout`);
    expect(res.status).toBe(401);
  });

  it('answers PAYMENT_UNAVAILABLE without calling Stripe when unconfigured', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await request(app).post(`${base}/billing/stripe/checkout`).set(auth());

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENT_UNAVAILABLE');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('opens a subscription checkout for the configured price, bound to the caller', async () => {
    const stripe = stubStripe({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });

    const res = await request(app).post(`${base}/billing/stripe/checkout`).set(auth()).send({});

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.com/c/pay/cs_test_1');

    const [url, init] = stripe.mock.calls[0]!;
    expect(String(url)).toBe('https://api.stripe.com/v1/checkout/sessions');
    const sent = new URLSearchParams(String(init?.body));
    expect(sent.get('mode')).toBe('subscription');
    expect(sent.get('line_items[0][price]')).toBe('price_test_premium');
    // Both: the session reference proves ownership on the success redirect,
    // the subscription metadata names the account on every renewal invoice.
    expect(sent.get('client_reference_id')).toBe(userId);
    expect(sent.get('subscription_data[metadata][userId]')).toBe(userId);
    expect(sent.get('success_url')).toBe(
      'https://staging.aquazerofit.test/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    );
  });

  it('refuses checkout for a Telegram session, including after refresh', async () => {
    resetTelegramNewAccountLimits();
    const initData = signTelegramInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'AA-stripe-tg',
      user: JSON.stringify({ id: 880001, first_name: 'StripeTg' }),
    });
    const tg = await request(app).post(`${base}/auth/telegram`).send({ initData });
    expect(tg.status).toBe(200);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const blocked = await request(app)
      .post(`${base}/billing/stripe/checkout`)
      .set({ Authorization: `Bearer ${tg.body.accessToken as string}` });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('FORBIDDEN');
    expect(blocked.body.message).toMatch(/not available in Telegram/);
    expect(fetchSpy).not.toHaveBeenCalled();

    const refreshed = await request(app)
      .post(`${base}/auth/refresh`)
      .send({ refreshToken: tg.body.refreshToken });
    expect(refreshed.status).toBe(200);
    const blockedAgain = await request(app)
      .post(`${base}/billing/stripe/checkout`)
      .set({ Authorization: `Bearer ${refreshed.body.accessToken as string}` });
    expect(blockedAgain.status).toBe(403);
    expect(blockedAgain.body.code).toBe('FORBIDDEN');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses to sell premium to an account that already has it', async () => {
    grantPremium({
      userId,
      source: 'admin',
      externalId: `comp-${crypto.randomUUID()}`,
      premiumUntil: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await request(app).post(`${base}/billing/stripe/checkout`).set(auth());

    expect(res.status).toBe(409);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /*
   * A renewal Stripe is still retrying leaves the account free once the grace
   * runs out, but Stripe will charge that subscription again. A second one
   * would bill the customer twice for one tier.
   */
  it('refuses a second subscription while Stripe still holds the first one open', async () => {
    await deliver(
      event('invoice.paid', invoice({ id: 'in_past_due', sub: 'sub_past_due', uid: userId, end: nowS() - GRACE_S - 3600 })),
    );
    expect(effectiveTier(userDoc())).toBe('free');
    const stripe = routeStripe({
      'GET /v1/subscriptions/sub_past_due': { id: 'sub_past_due', object: 'subscription', status: 'past_due' },
      'POST /v1/checkout/sessions': { id: 'cs_second', url: 'https://checkout.stripe.com/c/pay/cs_second' },
    });

    const res = await request(app).post(`${base}/billing/stripe/checkout`).set(auth());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(callsOf(stripe)).toEqual(['GET /v1/subscriptions/sub_past_due']);
  });

  it('opens checkout once the earlier subscription has ended, whether or not its deletion arrived', async () => {
    const lapsed = nowS() - GRACE_S - 3600;
    await deliver(event('invoice.paid', invoice({ id: 'in_ended', sub: 'sub_ended', uid: userId, end: lapsed })));
    await deliver(event('invoice.paid', invoice({ id: 'in_deleted', sub: 'sub_deleted', uid: userId, end: lapsed })));
    await deliver(event('customer.subscription.deleted', subscription('sub_deleted', userId)));
    const stripe = routeStripe({
      'GET /v1/subscriptions/sub_ended': { id: 'sub_ended', object: 'subscription', status: 'canceled' },
      'POST /v1/checkout/sessions': { id: 'cs_again', url: 'https://checkout.stripe.com/c/pay/cs_again' },
    });

    const res = await request(app).post(`${base}/billing/stripe/checkout`).set(auth());

    expect(res.status).toBe(200);
    // sub_deleted has a recorded deletion, so Stripe is not asked about it.
    expect(callsOf(stripe)).toEqual(['GET /v1/subscriptions/sub_ended', 'POST /v1/checkout/sessions']);
  });
});

describe('POST /billing/stripe/sync', () => {
  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'cs_test_sync',
    object: 'checkout.session',
    status: 'complete',
    payment_status: 'paid',
    client_reference_id: userId,
    invoice: invoice({ id: 'in_sync', sub: 'sub_sync', uid: userId, end: inDaysS(30) }),
    ...overrides,
  });

  it('grants as soon as the buyer is back, and the late webhook for the same invoice settles nothing new', async () => {
    const stripe = stubStripe(session());

    const res = await request(app)
      .post(`${base}/billing/stripe/sync`)
      .set(auth())
      .send({ sessionId: 'cs_test_sync' });

    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('premium');
    expect(String(stripe.mock.calls[0]![0])).toContain('/v1/checkout/sessions/cs_test_sync');

    await deliver(
      event('invoice.paid', invoice({ id: 'in_sync', sub: 'sub_sync', uid: userId, end: inDaysS(30) })),
    );
    expect(grantsFor('stripe:in_sync')).toHaveLength(1);
  });

  it("refuses a checkout that belongs to another account and grants nothing", async () => {
    stubStripe(session({ client_reference_id: otherUserId }));

    const res = await request(app)
      .post(`${base}/billing/stripe/sync`)
      .set(auth())
      .send({ sessionId: 'cs_test_sync' });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PURCHASE_INVALID');
    expect(effectiveTier(userDoc())).toBe('free');
  });

  it('reports the free tier, without error, while the payment is still processing', async () => {
    stubStripe(
      session({
        payment_status: 'unpaid',
        invoice: invoice({ id: 'in_pending', sub: 'sub_sync', uid: userId, end: inDaysS(30), status: 'open' }),
      }),
    );

    const res = await request(app)
      .post(`${base}/billing/stripe/sync`)
      .set(auth())
      .send({ sessionId: 'cs_test_sync' });

    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('free');
  });

  it('rejects anything that is not a Checkout Session id before it reaches Stripe', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await request(app)
      .post(`${base}/billing/stripe/sync`)
      .set(auth())
      .send({ sessionId: '../../customers/cus_1' });

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('GET /billing/config', () => {
  it('offers Stripe with the price Stripe holds for the configured price id', async () => {
    stubStripe({ id: 'price_test_premium', unit_amount: 999, currency: 'aud', recurring: { interval: 'month' } });

    const res = await request(app).get(`${base}/billing/config`);

    expect(res.status).toBe(200);
    expect(res.body.stripe).toEqual({
      available: true,
      price: { amount: 999, currency: 'aud', interval: 'month' },
    });
  });

  it('does not offer Stripe when the price cannot be read, so no button appears without a price', async () => {
    stubStripe({ error: { message: 'No such price' } }, 404);

    const res = await request(app).get(`${base}/billing/config`);

    expect(res.body.stripe).toEqual({ available: false, price: null });
  });

  it('does not offer Stripe on an unconfigured deployment', async () => {
    delete process.env.STRIPE_PRICE_ID;

    const res = await request(app).get(`${base}/billing/config`);

    expect(res.body.stripe).toEqual({ available: false, price: null });
  });
});

describe('POST /billing/stripe/portal', () => {
  it('requires a signed-in account', async () => {
    const res = await request(app).post(`${base}/billing/stripe/portal`);
    expect(res.status).toBe(401);
  });

  it('answers 404 without calling Stripe for an account that never subscribed through it', async () => {
    const fresh = await register('stripe-portal-none@example.com');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await request(app)
      .post(`${base}/billing/stripe/portal`)
      .set({ Authorization: `Bearer ${fresh.accessToken}` });

    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opens Stripe's billing portal for the customer behind the latest Stripe subscription", async () => {
    const subscriber = await register('stripe-portal@example.com');
    grantStripe(subscriber.user.id, 'sub_portal_old');
    grantStripe(subscriber.user.id, 'sub_portal_new');
    const stripe = routeStripe({
      'GET /v1/subscriptions/sub_portal_new': { id: 'sub_portal_new', customer: 'cus_portal' },
      'POST /v1/billing_portal/sessions': { url: 'https://billing.stripe.com/p/session/test_1' },
    });

    const res = await request(app)
      .post(`${base}/billing/stripe/portal`)
      .set({ Authorization: `Bearer ${subscriber.accessToken}` });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://billing.stripe.com/p/session/test_1' });
    expect(callsOf(stripe)).toEqual(['GET /v1/subscriptions/sub_portal_new', 'POST /v1/billing_portal/sessions']);
    const sent = new URLSearchParams(String(stripe.mock.calls[1]![1]?.body));
    expect(sent.get('customer')).toBe('cus_portal');
    // From APP_PUBLIC_URL, never from the request.
    expect(sent.get('return_url')).toBe('https://staging.aquazerofit.test/plan');
  });
});

describe('GET /me/entitlements billingSource', () => {
  it('names the rail behind the latest entitlement, so the plan page knows where it is managed', async () => {
    const fresh = await register('stripe-source@example.com');
    const read = () =>
      request(app).get(`${base}/me/entitlements`).set({ Authorization: `Bearer ${fresh.accessToken}` });

    expect((await read()).body.billingSource).toBeNull();
    grantStripe(fresh.user.id, 'sub_source');
    expect((await read()).body.billingSource).toBe('stripe');
  });
});

/*
 * Erasing an account must not leave Stripe billing a person who no longer has
 * one. The cancellation runs before the purge, because the purge anonymises the
 * ledger that names the subscription — and it never blocks the erasure: a
 * Stripe outage is logged for follow-up, not a reason to keep someone's data.
 */
describe('account deletion with a Stripe subscription', () => {
  async function deleteAccount(email: string, sub?: string) {
    const doomed = await register(email);
    if (sub) grantStripe(doomed.user.id, sub);
    const del = () =>
      request(app).delete(`${base}/me`).set({ Authorization: `Bearer ${doomed.accessToken}` });
    expect((await del()).body.purged).toBe(false);
    return { id: doomed.user.id, confirm: del };
  }

  it('cancels a live subscription, then erases the account', async () => {
    const doomed = await deleteAccount('stripe-delete-live@example.com', 'sub_doomed');
    const stripe = routeStripe({
      'GET /v1/subscriptions/sub_doomed': { id: 'sub_doomed', status: 'active', customer: 'cus_doomed' },
      'DELETE /v1/subscriptions/sub_doomed': { id: 'sub_doomed', status: 'canceled' },
    });

    const res = await doomed.confirm();

    expect(res.status).toBe(200);
    expect(res.body.purged).toBe(true);
    expect(callsOf(stripe)).toEqual(['GET /v1/subscriptions/sub_doomed', 'DELETE /v1/subscriptions/sub_doomed']);
    expect(getStore().byId<User>('users', doomed.id)).toBeUndefined();
  });

  it('does not cancel a subscription Stripe already holds as cancelled', async () => {
    const doomed = await deleteAccount('stripe-delete-ended@example.com', 'sub_ended');
    const stripe = routeStripe({
      'GET /v1/subscriptions/sub_ended': { id: 'sub_ended', status: 'canceled', customer: 'cus_ended' },
    });

    expect((await doomed.confirm()).body.purged).toBe(true);
    expect(callsOf(stripe)).toEqual(['GET /v1/subscriptions/sub_ended']);
  });

  it('still erases the account when Stripe cannot be reached', async () => {
    const doomed = await deleteAccount('stripe-delete-outage@example.com', 'sub_outage');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const res = await doomed.confirm();

    expect(res.status).toBe(200);
    expect(res.body.purged).toBe(true);
    expect(getStore().byId<User>('users', doomed.id)).toBeUndefined();
  });

  it('never calls Stripe for an account that has no Stripe subscription', async () => {
    const doomed = await deleteAccount('stripe-delete-none@example.com');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect((await doomed.confirm()).body.purged).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
