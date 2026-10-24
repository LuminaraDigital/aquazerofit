/**
 * Admin Stars refund: calls refundStarPayment, revokes the coach, and a
 * second call does not call Telegram again or credit the coach back.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CoachState, StarsPurchase, StarsRefund } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-stars-refund-'));
process.env.AZF_DATA_DIR = dataDir;
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.TELEGRAM_BOT_TOKEN = '123456789:test-bot-token';
delete process.env.MFA_REQUIRE_ADMIN;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');

const app = createApp();
const base = '/api/v1';
const SECRET = 'test-webhook-secret';
const PASSWORD = 'CorrectHorse9Battery';

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

const fetchCalls: FetchCall[] = [];
let telegramOk = true;
let telegramError = 'Bad Request: CHARGE_NOT_FOUND';

const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
  fetchCalls.push({ url: String(url), body });
  if (!telegramOk) {
    return new Response(JSON.stringify({ ok: false, description: telegramError }), {
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
let adminToken = '';

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  const user = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'buyer@example.com', password: PASSWORD, displayName: 'Buyer' });
  expect(user.status).toBe(201);
  userId = user.body.user.id as string;

  const admin = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'refund-admin@example.com', password: PASSWORD, displayName: 'Admin' });
  expect(admin.status).toBe(201);
  const stored = getStore().byId<{ id: string; role: string }>('users', admin.body.user.id)!;
  getStore().upsert('users', { ...stored, role: 'admin' });
  adminToken = admin.body.accessToken as string;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await getStore().flush();
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_BOT_TOKEN;
  // Overlay filesystems (the API image build) can return ENOTEMPTY while a
  // recursive delete is in progress. maxRetries covers that.
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

function seedPaid(chargeId: string): void {
  getStore().upsert('ledger', {
    type: 'starsInvoice',
    id: `inv-${chargeId}`,
    userId,
    coachId: 'uthman',
    stars: 200,
    payload: `coach.${chargeId}`,
    createdAt: new Date().toISOString(),
  });
}

async function pay(chargeId: string, telegramUserId = 5150): Promise<void> {
  seedPaid(chargeId);
  const res = await request(app)
    .post(`${base}/telegram/webhook`)
    .set({ 'X-Telegram-Bot-Api-Secret-Token': SECRET })
    .send({
      message: {
        from: { id: telegramUserId },
        successful_payment: {
          currency: 'XTR',
          total_amount: 200,
          invoice_payload: `coach.${chargeId}`,
          telegram_payment_charge_id: chargeId,
        },
      },
    });
  expect(res.status).toBe(200);
}

function refund(chargeId: string, token = adminToken, extra: Record<string, unknown> = {}) {
  return request(app)
    .post(`${base}/admin/payments/stars/refund`)
    .set('Authorization', `Bearer ${token}`)
    .send({ telegramPaymentChargeId: chargeId, reason: 'Customer asked', ...extra });
}

const purchased = (): string[] =>
  getStore().byId<CoachState>('profiles', `coachState:${userId}`)?.purchased ?? [];

describe('POST /admin/payments/stars/refund', () => {
  it('refuses anyone who is not an admin', async () => {
    const user = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: 'buyer@example.com', password: PASSWORD });
    const res = await refund('charge-nobody', user.body.accessToken as string);
    expect(res.status).toBe(403);
    expect(fetchCalls.filter((c) => c.url.endsWith('/refundStarPayment'))).toHaveLength(0);
  });

  it('refunds once, revokes the coach, and a repeat does not call Telegram', async () => {
    fetchCalls.length = 0;
    telegramOk = true;
    await pay('charge-ok', 5150);

    const purchase = getStore()
      .where<StarsPurchase>('ledger', (d) => d.type === 'starsPurchase')
      .find((d) => d.telegramPaymentChargeId === 'charge-ok');
    expect(purchase?.telegramUserId).toBe(5150);
    expect(purchased()).toContain('uthman');

    const state = getStore().byId<CoachState>('profiles', `coachState:${userId}`)!;
    getStore().upsert('profiles', { ...state, activeCoachId: 'uthman' });

    const first = await refund('charge-ok');
    expect(first.status).toBe(200);
    expect(first.body.refund.status).toBe('refunded');
    expect(first.body.refund.coachId).toBe('uthman');

    const calls = fetchCalls.filter((c) => c.url.endsWith('/refundStarPayment'));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({
      user_id: 5150,
      telegram_payment_charge_id: 'charge-ok',
    });
    expect(purchased()).not.toContain('uthman');
    expect(getStore().byId<CoachState>('profiles', `coachState:${userId}`)!.activeCoachId).toBe('akin');
    expect(
      getStore().where<StarsRefund>(
        'ledger',
        (d) => d.type === 'starsRefund' && d.telegramPaymentChargeId === 'charge-ok',
      ),
    ).toHaveLength(1);
    // The purchase row stays. The ledger is append-only.
    expect(
      getStore().where<StarsPurchase>(
        'ledger',
        (d) => d.type === 'starsPurchase' && d.telegramPaymentChargeId === 'charge-ok',
      ),
    ).toHaveLength(1);

    const second = await refund('charge-ok');
    expect(second.status).toBe(200);
    expect(second.body.refund.status).toBe('already_refunded');
    expect(fetchCalls.filter((c) => c.url.endsWith('/refundStarPayment'))).toHaveLength(1);
    expect(purchased().filter((id) => id === 'uthman')).toHaveLength(0);
  });

  it('does not revoke when Telegram refuses the refund', async () => {
    telegramOk = false;
    telegramError = 'Bad Request: CHARGE_NOT_FOUND';
    await pay('charge-nope', 6161);
    const res = await refund('charge-nope');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENT_UNAVAILABLE');
    expect(purchased()).toContain('uthman');
    expect(
      getStore().where<StarsRefund>(
        'ledger',
        (d) => d.type === 'starsRefund' && d.telegramPaymentChargeId === 'charge-nope',
      ),
    ).toHaveLength(0);
    telegramOk = true;
  });

  it('revokes when Telegram says the charge was already refunded', async () => {
    telegramOk = false;
    telegramError = 'Bad Request: CHARGE_ALREADY_REFUNDED';
    await pay('charge-already', 7171);
    const res = await refund('charge-already');
    expect(res.status).toBe(200);
    expect(res.body.refund.status).toBe('already_refunded');
    expect(purchased()).not.toContain('uthman');
    telegramOk = true;
  });

  it('returns 404 for an unknown charge and does not call Telegram', async () => {
    const before = fetchCalls.length;
    const res = await refund('charge-missing');
    expect(res.status).toBe(404);
    expect(fetchCalls.length).toBe(before);
  });

  it('uses a supplied telegram user id only when the purchase has none', async () => {
    getStore().upsert('ledger', {
      type: 'starsPurchase',
      id: 'pur-legacy',
      userId,
      coachId: 'uthman',
      stars: 200,
      telegramPaymentChargeId: 'charge-legacy',
      providerPaymentChargeId: null,
      invoicePayload: 'coach.legacy',
      createdAt: new Date().toISOString(),
    });
    // No tgId on the account either.
    const res = await refund('charge-legacy', adminToken, { telegramUserId: 8080 });
    expect(res.status).toBe(200);
    const call = fetchCalls.filter((c) => c.url.endsWith('/refundStarPayment')).at(-1);
    expect(call?.body.user_id).toBe(8080);
  });

  it('ignores a body user id when the purchase already names the payer', async () => {
    await pay('charge-bound', 9090);
    await refund('charge-bound', adminToken, { telegramUserId: 1 });
    const call = fetchCalls.filter((c) =>
      c.body.telegram_payment_charge_id === 'charge-bound',
    ).at(-1);
    expect(call?.body.user_id).toBe(9090);
  });
});
