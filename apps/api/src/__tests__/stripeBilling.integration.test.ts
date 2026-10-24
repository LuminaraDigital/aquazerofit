/**
 * Stripe billing routes.
 *
 * Same three ways to give the product away as the Play rail — an unconfigured
 * deployment, a forged notification, a purchase claimed by the wrong account —
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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-stripe-billing-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { effectiveTier, entitlementHistory, grantPremium } = await import(
  '../modules/billing/entitlements'
);
const { resetStripePriceCache } = await import('../modules/billing/stripe');

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

function invoice(opts: { id: string; sub: string; uid: string; end: number; status?: string }) {
  return {
    id: opts.id,
    object: 'invoice',
    status: opts.status ?? 'paid',
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
  const user = getStore().byId<User>('users', userId);
  if (user) getStore().upsert('users', { ...user, premiumUntil: null });
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
    expect(userDoc().premiumUntil).toBe(new Date(end * 1000).toISOString());
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
  it('ignores the deletion of a subscription the account has since replaced', async () => {
    await deliver(event('invoice.paid', invoice({ id: 'in_old', sub: 'sub_old', uid: userId, end: inDaysS(5) })));
    await deliver(event('invoice.paid', invoice({ id: 'in_new', sub: 'sub_new', uid: userId, end: inDaysS(30) })));

    await deliver(event('customer.subscription.deleted', subscription('sub_old', userId)));

    expect(effectiveTier(userDoc())).toBe('premium');
  });

  it('ignores event types it does not act on', async () => {
    const res = await deliver(event('customer.created', { id: 'cus_1', object: 'customer' }));
    expect(res.status).toBe(200);
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
