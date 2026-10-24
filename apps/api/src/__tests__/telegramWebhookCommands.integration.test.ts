/**
 * Webhook behaviour the payment suite does not cover: command replies, zod
 * rejection, and an awaited pre-checkout answer whose failure is logged
 * without the invoice payload.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-tg-cmd-'));
process.env.AZF_DATA_DIR = dataDir;
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.TELEGRAM_BOT_TOKEN = '123456789:test-bot-token';
process.env.TELEGRAM_MINI_APP_URL = 'https://aquazerofit.com/';
process.env.SUPPORT_EMAIL = 'pay-help@example.com';
process.env.APP_PUBLIC_URL = 'https://aquazerofit.com';

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const telemetry = await import('../platform/telemetry');

const app = createApp();
const base = '/api/v1';
const SECRET = 'test-webhook-secret';

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

const fetchCalls: FetchCall[] = [];
const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
  fetchCalls.push({
    url: String(url),
    body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
  });
  return new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

let userId = '';

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'commands@example.com', password: 'CorrectHorse9Battery', displayName: 'Pat' });
  expect(res.status).toBe(201);
  userId = res.body.user.id as string;
});

afterEach(() => {
  fetchCalls.length = 0;
  fetchMock.mockClear();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await getStore().flush();
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_MINI_APP_URL;
  delete process.env.SUPPORT_EMAIL;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function post(body: unknown) {
  return request(app)
    .post(`${base}/telegram/webhook`)
    .set({ 'X-Telegram-Bot-Api-Secret-Token': SECRET })
    .send(body as object);
}

describe('command replies', () => {
  it('answers /start with a Mini App button and does not echo secrets', async () => {
    const res = await post({
      update_id: 1,
      message: { text: '/start', chat: { id: 4242, type: 'private' } },
    });
    expect(res.status).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toMatch(/\/sendMessage$/);
    const body = fetchCalls[0]!.body;
    expect(body.chat_id).toBe(4242);
    expect(body.text).toMatch(/Welcome to AquaZeroFit/);
    expect(body.parse_mode).toBeUndefined();
    const button = (body.reply_markup as { inline_keyboard: { web_app?: { url: string } }[][] })
      .inline_keyboard[0]![0]!;
    expect(button.web_app?.url).toBe('https://aquazerofit.com/');
    const wire = JSON.stringify(body);
    expect(wire).not.toContain('test-bot-token');
    expect(wire).not.toContain(SECRET);
  });

  it('answers /paysupport, /stop and /terms from config', async () => {
    for (const [text, needle] of [
      ['/paysupport', 'pay-help@example.com'],
      ['/stop', '/account/deletion'],
      ['/terms', '/privacy'],
    ] as const) {
      fetchCalls.length = 0;
      const res = await post({ message: { text, chat: { id: 7, type: 'private' } } });
      expect(res.status).toBe(200);
      expect(String(fetchCalls[0]!.body.text)).toContain(needle);
    }
    const terms = String(fetchCalls[0]!.body.text);
    expect(terms).toContain('/terms');
    expect(terms).toContain('/refund');
  });

  it('still acknowledges a message that is not one of those commands', async () => {
    const res = await post({ message: { text: 'hello', chat: { id: 7, type: 'private' } } });
    expect(res.status).toBe(200);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('webhook validation and pre-checkout', () => {
  it('acknowledges an update that fails validation and does not grant', async () => {
    const res = await post({ pre_checkout_query: { id: 5 } });
    expect(res.status).toBe(200);
    expect(fetchCalls).toHaveLength(0);
    expect(
      getStore().where('ledger', (d) => (d as { type?: string }).type === 'starsPurchase'),
    ).toHaveLength(0);
  });

  it('awaits answerPreCheckoutQuery and does not log the invoice payload', async () => {
    const payload = 'coach.do-not-log-this';
    const spy = vi.spyOn(telemetry, 'logEvent');
    getStore().upsert('ledger', {
      type: 'starsInvoice',
      id: 'inv-pre',
      userId,
      coachId: 'uthman',
      stars: 200,
      payload,
      createdAt: new Date().toISOString(),
    });

    const res = await post({
      pre_checkout_query: {
        id: 'pcq-1',
        currency: 'XTR',
        total_amount: 1,
        invoice_payload: payload,
      },
    });
    expect(res.status).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toMatch(/\/answerPreCheckoutQuery$/);
    expect(fetchCalls[0]!.body.ok).toBe(false);
    expect(JSON.stringify(fetchCalls[0]!.body)).not.toContain(payload);

    const logged = spy.mock.calls.map((call) => JSON.stringify(call));
    expect(logged.some((line) => line.includes('stars_precheckout_declined'))).toBe(true);
    expect(logged.some((line) => line.includes(payload))).toBe(false);
    spy.mockRestore();
  });

  it('approves a pre-checkout that matches the roster price', async () => {
    getStore().upsert('ledger', {
      type: 'starsInvoice',
      id: 'inv-ok',
      userId,
      coachId: 'uthman',
      stars: 200,
      payload: 'coach.pre-ok',
      createdAt: new Date().toISOString(),
    });
    const res = await post({
      pre_checkout_query: {
        id: 'pcq-ok',
        currency: 'XTR',
        total_amount: 200,
        invoice_payload: 'coach.pre-ok',
      },
    });
    expect(res.status).toBe(200);
    expect(fetchCalls[0]!.body.ok).toBe(true);
  });

  it('still answers 200 when Telegram rejects the pre-checkout answer', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('network down');
    });
    const res = await post({
      pre_checkout_query: {
        id: 'pcq-fail',
        currency: 'XTR',
        total_amount: 200,
        invoice_payload: 'coach.pre-ok',
      },
    });
    expect(res.status).toBe(200);
  });

  it('does not log an unmatched payment payload', async () => {
    const payload = 'coach.unmatched-secret';
    const spy = vi.spyOn(telemetry, 'logEvent');
    const res = await post({
      message: {
        from: { id: 4242 },
        successful_payment: {
          currency: 'XTR',
          total_amount: 200,
          invoice_payload: payload,
          telegram_payment_charge_id: 'charge-unmatched',
        },
      },
    });
    expect(res.status).toBe(200);
    const logged = spy.mock.calls.map((call) => JSON.stringify(call));
    expect(logged.some((line) => line.includes('stars_payment_unmatched'))).toBe(true);
    expect(logged.some((line) => line.includes(payload))).toBe(false);
    spy.mockRestore();
  });
});
