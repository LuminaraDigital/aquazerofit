/**
 * Stars Premium inside the Mini App.
 *
 * The price is whatever TELEGRAM_STARS_PREMIUM_PRICE says in that test. No
 * case here accepts a charge without an anchor, an expiration, or a matching
 * amount, and a redelivery of the same charge id grants once.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StarsSubscriptionPayment, StarsSubscriptionRefund, User } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-stars-sub-'));
process.env.AZF_DATA_DIR = dataDir;
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.TELEGRAM_BOT_TOKEN = '123456789:stars-sub-test';
delete process.env.TELEGRAM_STARS_PREMIUM_PRICE;
delete process.env.MFA_REQUIRE_ADMIN;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { signTelegramInitData } = await import('../modules/auth/telegram');
const { resetTelegramNewAccountLimits } = await import('../modules/auth/service');
const { effectiveTier, grantPremium, revokePremium } = await import('../modules/billing/entitlements');
const telemetry = await import('../platform/telemetry');

const app = createApp();
const base = '/api/v1';
const SECRET = 'test-webhook-secret';
const PASSWORD = 'CorrectHorse9Battery';
const PERIOD = 2_592_000;

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

const fetchCalls: FetchCall[] = [];
const failMethods = new Set<string>();
let refundAlready = false;

const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
  const target = String(url);
  fetchCalls.push({ url: target, body });
  const method = target.split('/').pop() ?? '';
  if (method === 'refundStarPayment' && refundAlready) {
    return new Response(JSON.stringify({ ok: false, description: 'Bad Request: CHARGE_ALREADY_REFUNDED' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (failMethods.has(method)) {
    return new Response(JSON.stringify({ ok: false, description: 'Bad Request: CHARGE_NOT_FOUND' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (method === 'createInvoiceLink') {
    return new Response(JSON.stringify({ ok: true, result: 'https://t.me/invoice/test-premium' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

let userId = '';
let accessToken = '';
let adminToken = '';

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  resetTelegramNewAccountLimits();
  const initData = signTelegramInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AA-stars-premium',
    user: JSON.stringify({ id: 880417, first_name: 'Stars' }),
  });
  const tg = await request(app).post(`${base}/auth/telegram`).send({ initData });
  expect(tg.status).toBe(200);
  userId = tg.body.user.id as string;
  accessToken = tg.body.accessToken as string;

  const admin = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'stars-sub-admin@example.com', password: PASSWORD, displayName: 'Admin' });
  expect(admin.status).toBe(201);
  const stored = getStore().byId<User>('users', admin.body.user.id as string)!;
  getStore().upsert('users', { ...stored, role: 'admin' });
  adminToken = admin.body.accessToken as string;
});

beforeEach(() => {
  fetchCalls.length = 0;
  failMethods.clear();
  refundAlready = false;
  delete process.env.TELEGRAM_STARS_PREMIUM_PRICE;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await getStore().close();
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_STARS_PREMIUM_PRICE;
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

function auth(token = accessToken): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function seedAnchor(payload: string, stars = 417): void {
  getStore().upsert('ledger', {
    type: 'starsSubscription',
    id: `anchor-${payload}`,
    userId,
    stars,
    payload,
    createdAt: new Date().toISOString(),
  });
}

function paymentBody(
  payload: string,
  chargeId: string,
  expiration: number | undefined,
  amount = 417,
  extra: Record<string, unknown> = {},
) {
  return {
    message: {
      from: { id: 880417 },
      successful_payment: {
        currency: 'XTR',
        total_amount: amount,
        invoice_payload: payload,
        telegram_payment_charge_id: chargeId,
        ...(expiration === undefined ? {} : { subscription_expiration_date: expiration }),
        ...extra,
      },
    },
  };
}

async function postUpdate(body: object) {
  return request(app)
    .post(`${base}/telegram/webhook`)
    .set({ 'X-Telegram-Bot-Api-Secret-Token': SECRET })
    .send(body);
}

function payments(chargeId?: string): StarsSubscriptionPayment[] {
  return getStore().where<StarsSubscriptionPayment>(
    'ledger',
    (d) =>
      d.type === 'starsSubscriptionPayment' &&
      d.userId === userId &&
      (chargeId === undefined || d.telegramPaymentChargeId === chargeId),
  );
}

function userDoc(): User {
  return getStore().byId<User>('users', userId)!;
}

const inSeconds = (days: number): number => Math.floor(Date.now() / 1000) + days * 86_400;

describe('POST /billing/stars/subscription', () => {
  it('stays unavailable and does not call Telegram when the price is unset', async () => {
    const res = await request(app).post(`${base}/billing/stars/subscription`).set(auth());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENT_UNAVAILABLE');
    expect(fetchCalls).toHaveLength(0);
  });

  it('refuses a web session even when a price is configured', async () => {
    process.env.TELEGRAM_STARS_PREMIUM_PRICE = '417';
    const web = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: 'stars-web@example.com', password: PASSWORD, displayName: 'Web' });
    expect(web.status).toBe(201);
    const res = await request(app)
      .post(`${base}/billing/stars/subscription`)
      .set(auth(web.body.accessToken as string));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(fetchCalls).toHaveLength(0);
  });

  it('passes the configured price and the 30 day period to createInvoiceLink', async () => {
    process.env.TELEGRAM_STARS_PREMIUM_PRICE = '417';
    const res = await request(app).post(`${base}/billing/stars/subscription`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ invoiceLink: 'https://t.me/invoice/test-premium', stars: 417 });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toMatch(/\/createInvoiceLink$/);
    expect(fetchCalls[0]!.body.currency).toBe('XTR');
    expect(fetchCalls[0]!.body.subscription_period).toBe(PERIOD);
    expect(fetchCalls[0]!.body.provider_token).toBeUndefined();
    const prices = fetchCalls[0]!.body.prices as { amount: number }[];
    expect(prices[0]!.amount).toBe(417);
  });

  it('refuses a second subscription when the account is already premium', async () => {
    process.env.TELEGRAM_STARS_PREMIUM_PRICE = '417';
    grantPremium({
      userId,
      source: 'admin',
      externalId: `comp-${crypto.randomUUID()}`,
      premiumUntil: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const res = await request(app).post(`${base}/billing/stars/subscription`).set(auth());
    expect(res.status).toBe(409);
    expect(fetchCalls).toHaveLength(0);
    revokePremium(userId, 'admin', `clear-${crypto.randomUUID()}`, 'test cleanup');
    expect(userDoc().premiumUntil).toBeNull();
  });

  it('keeps Stripe checkout refused for the Telegram session', async () => {
    const res = await request(app).post(`${base}/billing/stripe/checkout`).set(auth());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('GET /billing/config stars', () => {
  it('reports Stars unavailable with no period when the price is unset', async () => {
    const res = await request(app).get(`${base}/billing/config`);
    expect(res.status).toBe(200);
    expect(res.body.stars).toEqual({ available: false, price: null, periodSeconds: null });
  });

  it('reports the configured price and the server period', async () => {
    process.env.TELEGRAM_STARS_PREMIUM_PRICE = '417';
    const res = await request(app).get(`${base}/billing/config`);
    expect(res.body.stars).toEqual({ available: true, price: 417, periodSeconds: PERIOD });
  });
});

describe('subscription webhook', () => {
  it('grants premium until subscription_expiration_date, once per charge id', async () => {
    const payload = 'premium.once';
    const exp = inSeconds(30);
    seedAnchor(payload);
    const body = paymentBody(payload, 'chg-once', exp, 417, { is_first_recurring: true });

    expect((await postUpdate(body)).status).toBe(200);
    expect((await postUpdate(body)).status).toBe(200);

    expect(payments('chg-once')).toHaveLength(1);
    expect(userDoc().premiumUntil).toBe(new Date(exp * 1000).toISOString());
    expect(effectiveTier(userDoc())).toBe('premium');
    const anchor = getStore().where('ledger', (d) => (d as { payload?: string }).payload === payload);
    expect(anchor.some((row) => (row as { type?: string }).type === 'starsSubscription')).toBe(true);
  });

  it('moves the end to a renewal expiration and lapses when the next one does not arrive', async () => {
    revokePremium(userId, 'admin', `wipe-${crypto.randomUUID()}`, 'isolate');
    const payload = 'premium.renew';
    const first = inSeconds(10);
    // 12 days later, not 30. Adding the subscription period on our own would
    // land on a different instant than the expiration Telegram reported.
    const renewal = first + 12 * 86_400;
    seedAnchor(payload);
    await postUpdate(paymentBody(payload, 'chg-first', first, 417, { is_first_recurring: true }));
    await postUpdate(
      paymentBody(payload, 'chg-renew', renewal, 417, { is_recurring: true, is_first_recurring: false }),
    );

    expect(userDoc().premiumUntil).toBe(new Date(renewal * 1000).toISOString());
    expect(payments().filter((row) => row.invoicePayload === payload)).toHaveLength(2);
    expect(payments('chg-renew')[0]!.isRecurring).toBe(true);
    expect(Date.parse(userDoc().premiumUntil!)).not.toBe((first + PERIOD) * 1000);
    expect(Date.parse(userDoc().premiumUntil!)).not.toBe((renewal + PERIOD) * 1000);
    expect(effectiveTier(userDoc(), new Date(renewal * 1000 + 1000))).toBe('free');
  });

  it('does not grant when Telegram omits the expiration', async () => {
    const payload = 'premium.no-exp';
    seedAnchor(payload);
    const before = userDoc().premiumUntil;
    const res = await postUpdate(paymentBody(payload, 'chg-no-exp', undefined));
    expect(res.status).toBe(200);
    expect(payments('chg-no-exp')).toHaveLength(0);
    expect(userDoc().premiumUntil).toBe(before);
  });

  it('does not grant a forged payload or an underpayment', async () => {
    const forged = await postUpdate(paymentBody('premium.forged', 'chg-forged', inSeconds(30)));
    expect(forged.status).toBe(200);
    expect(payments('chg-forged')).toHaveLength(0);

    seedAnchor('premium.short', 417);
    const short = await postUpdate(paymentBody('premium.short', 'chg-short', inSeconds(30), 1));
    expect(short.status).toBe(200);
    expect(payments('chg-short')).toHaveLength(0);
  });

  it('awaits pre-checkout and does not log the payload', async () => {
    const payload = 'premium.do-not-log-this';
    seedAnchor(payload, 417);
    const spy = vi.spyOn(telemetry, 'logEvent');
    const res = await postUpdate({
      pre_checkout_query: {
        id: 'pcq-premium',
        currency: 'XTR',
        total_amount: 417,
        invoice_payload: payload,
      },
    });
    expect(res.status).toBe(200);
    const answered = fetchCalls.filter((call) => call.url.endsWith('/answerPreCheckoutQuery'));
    expect(answered).toHaveLength(1);
    expect(answered[0]!.body.ok).toBe(true);
    expect(JSON.stringify(answered[0]!.body)).not.toContain(payload);
    const logged = spy.mock.calls.map((call) => JSON.stringify(call));
    expect(logged.some((line) => line.includes(payload))).toBe(false);
    spy.mockRestore();
  });

  it('declines pre-checkout below the anchored price', async () => {
    seedAnchor('premium.low', 417);
    const res = await postUpdate({
      pre_checkout_query: {
        id: 'pcq-low',
        currency: 'XTR',
        total_amount: 1,
        invoice_payload: 'premium.low',
      },
    });
    expect(res.status).toBe(200);
    const answered = fetchCalls.find((call) => call.url.endsWith('/answerPreCheckoutQuery'));
    expect(answered?.body.ok).toBe(false);
  });
});

describe('admin refund of a subscription charge', () => {
  const payload = 'premium.refund-me';
  const chargeId = 'chg-refund';

  async function pay(): Promise<number> {
    const exp = inSeconds(20);
    seedAnchor(payload, 417);
    const res = await postUpdate(paymentBody(payload, chargeId, exp));
    expect(res.status).toBe(200);
    expect(effectiveTier(userDoc())).toBe('premium');
    fetchCalls.length = 0;
    return exp;
  }

  async function refund() {
    return request(app)
      .post(`${base}/admin/payments/stars/refund`)
      .set(auth(adminToken))
      .send({ telegramPaymentChargeId: chargeId, reason: 'support request' });
  }

  it('refunds the charge, cancels renewals, and does not call Telegram twice', async () => {
    const stripeUntil = new Date(Date.now() + 50 * 86_400_000).toISOString();
    grantPremium({
      userId,
      source: 'stripe',
      externalId: 'stripe:in_keep',
      providerRef: 'sub_keep',
      premiumUntil: stripeUntil,
    });
    await pay();
    // Stars expiration is sooner than Stripe, so the account end stays Stripe's.
    expect(userDoc().premiumUntil).toBe(stripeUntil);

    const first = await refund();
    expect(first.status).toBe(200);
    expect(first.body.refund.status).toBe('refunded');
    const methods = fetchCalls.map((call) => call.url.split('/').pop());
    expect(methods).toContain('refundStarPayment');
    expect(methods).toContain('editUserStarSubscription');
    const cancel = fetchCalls.find((call) => call.url.endsWith('/editUserStarSubscription'));
    expect(cancel?.body.is_canceled).toBe(true);
    expect(userDoc().premiumUntil).toBe(stripeUntil);
    expect(
      getStore().where<StarsSubscriptionRefund>(
        'ledger',
        (d) => d.type === 'starsSubscriptionRefund' && d.telegramPaymentChargeId === chargeId,
      ),
    ).toHaveLength(1);

    fetchCalls.length = 0;
    const second = await refund();
    expect(second.status).toBe(200);
    expect(second.body.refund.status).toBe('already_refunded');
    expect(fetchCalls).toHaveLength(0);
    expect(userDoc().premiumUntil).toBe(stripeUntil);
  });

  it('does not revoke when Telegram refuses the refund', async () => {
    const localPayload = 'premium.refuse';
    const localCharge = 'chg-refuse';
    const exp = inSeconds(15);
    seedAnchor(localPayload, 417);
    await postUpdate(paymentBody(localPayload, localCharge, exp));
    const until = userDoc().premiumUntil;
    fetchCalls.length = 0;
    failMethods.add('refundStarPayment');

    const res = await request(app)
      .post(`${base}/admin/payments/stars/refund`)
      .set(auth(adminToken))
      .send({ telegramPaymentChargeId: localCharge, reason: 'nope' });
    expect(res.status).toBe(503);
    expect(userDoc().premiumUntil).toBe(until);
    expect(
      getStore()
        .where<StarsSubscriptionRefund>('ledger', (d) => d.type === 'starsSubscriptionRefund')
        .some((row) => row.telegramPaymentChargeId === localCharge),
    ).toBe(false);
  });

  it('writes the refund only after the cancellation also succeeds', async () => {
    const localPayload = 'premium.cancel-retry';
    const localCharge = 'chg-cancel-retry';
    seedAnchor(localPayload, 417);
    await postUpdate(paymentBody(localPayload, localCharge, inSeconds(12)));
    // Drop the Stripe period from the earlier case so this charge is the one holding premium.
    const user = userDoc();
    getStore().upsert('users', { ...user, premiumUntil: new Date(inSeconds(12) * 1000).toISOString() });
    fetchCalls.length = 0;
    failMethods.add('editUserStarSubscription');

    const blocked = await request(app)
      .post(`${base}/admin/payments/stars/refund`)
      .set(auth(adminToken))
      .send({ telegramPaymentChargeId: localCharge, reason: 'retry cancel' });
    expect(blocked.status).toBe(503);
    expect(
      getStore()
        .where<StarsSubscriptionRefund>('ledger', (d) => d.type === 'starsSubscriptionRefund')
        .some((row) => row.telegramPaymentChargeId === localCharge),
    ).toBe(false);

    failMethods.clear();
    refundAlready = true;
    const done = await request(app)
      .post(`${base}/admin/payments/stars/refund`)
      .set(auth(adminToken))
      .send({ telegramPaymentChargeId: localCharge, reason: 'retry cancel' });
    expect(done.status).toBe(200);
    expect(done.body.refund.status).toBe('already_refunded');
    expect(
      getStore()
        .where<StarsSubscriptionRefund>('ledger', (d) => d.type === 'starsSubscriptionRefund')
        .some((row) => row.telegramPaymentChargeId === localCharge),
    ).toBe(true);
  });

  it('returns 404 for an unknown charge', async () => {
    const res = await request(app)
      .post(`${base}/admin/payments/stars/refund`)
      .set(auth(adminToken))
      .send({ telegramPaymentChargeId: 'chg-missing', reason: 'unknown' });
    expect(res.status).toBe(404);
    expect(fetchCalls).toHaveLength(0);
  });
});
