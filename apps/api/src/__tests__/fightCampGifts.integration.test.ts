/**
 * S12 Gift a Round over HTTP (AZF-P1 US-G1): the invoice gates, Telegram's
 * pre-checkout re-validation, settlement through the Stars webhook, refunds,
 * and the financial row surviving erasure. Telegram itself is a stub.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.TELEGRAM_BOT_TOKEN = '123456789:test-bot-token';
delete process.env.MFA_REQUIRE_ADMIN;

const { addDays } = await import('../platform/dates');
const { getStore } = await import('../platform/store');
const { engageRepo } = await import('../modules/fightCamp/repo');
const { purgeUser } = await import('../modules/me/service');

const TODAY = addDays(SEASON_ONE_STARTS_ON, 10);
const NOW = new Date(`${TODAY}T09:00:00.000Z`);
const DAY_MS = 86_400_000;
const PRICE = 150;

interface TelegramCall {
  method: string;
  body: Record<string, unknown>;
}
const calls: TelegramCall[] = [];
const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
  const method = String(url).split('/').pop()!;
  calls.push({ method, body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
  const result = method === 'createInvoiceLink' ? `https://t.me/$gift-${calls.length}` : true;
  return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

let h: FightCampHarness;
let mia: Person;
let rizal: Person;
let jay: Person;
let admin: Person;
let squadId = '';
let tgSeq = 7000;

function linkTelegram(person: Person): number {
  tgSeq += 1;
  const user = getStore().byId<Record<string, unknown> & { id: string }>('users', person.userId)!;
  getStore().upsert('users', { ...user, tgId: tgSeq });
  return tgSeq;
}

const tgIdOf = (p: Person) => getStore().byId<{ id: string; tgId?: number }>('users', p.userId)!.tgId!;
const userDoc = (p: Person) => getStore().byId<{ id: string; premiumUntil?: string | null; tier: string }>('users', p.userId)!;
const refOf = async (viewer: Person, name: string) =>
  ((await request(h.app).get(`${h.base}/squads/current`).set(viewer.auth())).body.squad.members as Array<{ ref: string; displayName: string }>).find(
    (m) => m.displayName === name,
  )!.ref;
const invoice = (from: Person, to: string) =>
  request(h.app).post(`${h.base}/gifts/premium/invoice`).set(from.auth()).send({ to });
const webhook = (update: Record<string, unknown>) =>
  request(h.app).post(`${h.base}/telegram/webhook`).set({ 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }).send(update);
const refund = (chargeId: string) =>
  request(h.app)
    .post(`${h.base}/admin/payments/stars/refund`)
    .set(admin.auth())
    .send({ telegramPaymentChargeId: chargeId, reason: 'Gifter asked' });

async function payloadOfLastInvoice(): Promise<string> {
  const call = calls.filter((c) => c.method === 'createInvoiceLink').at(-1)!;
  return String(call.body.payload);
}

function preCheckout(payload: string, payer: number, amount = PRICE) {
  return webhook({
    pre_checkout_query: { id: `pcq-${calls.length}`, from: { id: payer }, currency: 'XTR', total_amount: amount, invoice_payload: payload },
  });
}

function paid(payload: string, chargeId: string, payer: number) {
  return webhook({
    message: {
      from: { id: payer },
      successful_payment: { currency: 'XTR', total_amount: PRICE, invoice_payload: payload, telegram_payment_charge_id: chargeId },
    },
  });
}

const lastAnswer = () => calls.filter((c) => c.method === 'answerPreCheckoutQuery').at(-1)!.body;

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h = await fightCampHarness('fc-gifts');
  h.enable('squads', 'gifting');
  mia = await h.register('Mia');
  rizal = await h.register('Rizal');
  jay = await h.register('Jay');
  admin = await h.register('Admin');
  const stored = getStore().byId<{ id: string; role: string }>('users', admin.userId)!;
  getStore().upsert('users', { ...stored, role: 'admin' });
  for (const p of [mia, rizal, jay]) linkTelegram(p);
  const made = await request(h.app).post(`${h.base}/squads`).set(mia.auth()).send({ name: 'Corner Crew', consent: true });
  squadId = made.body.squad.id as string;
  vi.setSystemTime(new Date(NOW.getTime() + 1000));
  await request(h.app).post(`${h.base}/squads/join`).set(rizal.auth()).send({ code: made.body.squad.inviteCode, consent: true });
});

beforeEach(() => {
  process.env.GIFT_PREMIUM_7D_STARS = String(PRICE);
  h.enable('squads', 'gifting');
});

afterEach(() => {
  delete process.env.GIFT_PREMIUM_7D_STARS;
});

afterAll(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_BOT_TOKEN;
  await h.cleanup();
});

describe('who can gift (US-G1 AC1, AC2, AC6)', () => {
  it('does not exist while the switch is off or no price is set', async () => {
    const to = await refOf(mia, 'Rizal');
    delete process.env.GIFT_PREMIUM_7D_STARS;
    expect((await invoice(mia, to)).status).toBe(404);
    expect((await request(h.app).get(`${h.base}/fight-record`).set(mia.auth())).body.fightCamp.gifting).toBeNull();
    process.env.GIFT_PREMIUM_7D_STARS = '0';
    expect((await invoice(mia, to)).status).toBe(404);
    process.env.GIFT_PREMIUM_7D_STARS = String(PRICE);
    h.disableAll();
    h.enable('squads');
    expect((await invoice(mia, to)).status).toBe(404);
  });

  it('shows the fixed price only to adults linked to Telegram', async () => {
    expect((await request(h.app).get(`${h.base}/fight-record`).set(mia.auth())).body.fightCamp.gifting).toEqual({
      stars: PRICE,
      received: null,
    });
    expect((await request(h.app).get(`${h.base}/fight-record`).set(admin.auth())).body.fightCamp.gifting).toBeNull();
  });

  it('refuses a gift outside your squad, to yourself, from a minor, and without Telegram', async () => {
    const theirs = await refOf(mia, 'Rizal');
    const own = await refOf(mia, 'Mia');
    expect((await invoice(jay, theirs)).body.details).toEqual({ reason: 'gift_not_eligible' });
    expect((await invoice(mia, own)).status).toBe(403);
    h.setAge(mia.userId, 17);
    expect((await invoice(mia, theirs)).status).toBe(403);
    h.setAge(mia.userId, 30);
    const user = getStore().byId<Record<string, unknown> & { id: string }>('users', mia.userId)!;
    getStore().upsert('users', { ...user, tgId: undefined });
    expect((await invoice(mia, theirs)).status).toBe(403);
    getStore().upsert('users', user);
  });

  it('refuses a recipient who already has Premium', async () => {
    const to = await refOf(mia, 'Rizal');
    const user = getStore().byId<Record<string, unknown> & { id: string }>('users', rizal.userId)!;
    getStore().upsert('users', { ...user, premiumUntil: new Date(NOW.getTime() + 3 * DAY_MS).toISOString() });
    const res = await invoice(mia, to);
    expect(res.status).toBe(409);
    expect(res.body.details).toEqual({ reason: 'recipient_has_premium' });
    getStore().upsert('users', user);
  });
});

describe('paying for a gift (AC3, AC5)', () => {
  it('prices from the environment, re-validates at pre-checkout and grants exactly seven days once', async () => {
    // A price in the request is ignored: the amount only ever comes from the environment.
    const res = await request(h.app)
      .post(`${h.base}/gifts/premium/invoice`)
      .set(mia.auth())
      .send({ to: await refOf(mia, 'Rizal'), stars: 1, amount: 1, days: 365 });
    expect(res.status).toBe(201);
    expect(res.body.invoiceLink).toMatch(/^https:\/\/t\.me\//);
    const invoiceCall = calls.filter((c) => c.method === 'createInvoiceLink').at(-1)!.body;
    expect(invoiceCall).toMatchObject({ currency: 'XTR', prices: [{ amount: PRICE }] });
    expect(String(invoiceCall.description)).toContain('7 days of AquaZeroFit Premium for Rizal');
    const payload = await payloadOfLastInvoice();
    expect(payload).toMatch(/^gift:/);

    // Only the gifter may pay, and only the full price.
    await preCheckout(payload, tgIdOf(rizal));
    expect(lastAnswer()).toMatchObject({ ok: false });
    await preCheckout(payload, tgIdOf(mia), PRICE - 1);
    expect(lastAnswer()).toMatchObject({ ok: false });
    await preCheckout(payload, tgIdOf(mia));
    expect(lastAnswer()).toMatchObject({ ok: true });

    expect((await paid(payload, 'charge-gift-1', tgIdOf(mia))).status).toBe(200);
    expect(Date.parse(userDoc(rizal).premiumUntil!)).toBe(Date.now() + 7 * DAY_MS);
    // A redelivery grants nothing more.
    expect((await paid(payload, 'charge-gift-1', tgIdOf(mia))).status).toBe(200);
    const grants = getStore().where<{ id: string; type?: string; externalId?: string }>(
      'ledger',
      (d) => (d as { type?: string }).type === 'entitlementGrant' && (d as { externalId?: string }).externalId === 'gift:charge-gift-1',
    );
    expect(grants).toHaveLength(1);
    expect((await engageRepo().gifts.byCharge('charge-gift-1'))).toMatchObject({ status: 'granted', starsAmount: PRICE });

    const theirs = (await request(h.app).get(`${h.base}/fight-record`).set(rizal.auth())).body.fightCamp.gifting;
    expect(theirs.received).toMatchObject({ fromName: 'Mia' });
  });

  it('declines at pre-checkout when the recipient has left the squad since', async () => {
    const res = await invoice(mia, await refOf(mia, 'Rizal'));
    expect(res.status).toBe(409);
    // Rizal has Premium now; clear it and send another, then have them leave.
    const user = getStore().byId<Record<string, unknown> & { id: string }>('users', rizal.userId)!;
    const ledger = getStore().where<{ id: string; userId?: string; type?: string }>(
      'ledger',
      (d) => (d as { type?: string }).type === 'entitlementGrant' && (d as { userId?: string }).userId === rizal.userId,
    );
    for (const doc of ledger) getStore().delete('ledger', doc.id);
    getStore().upsert('users', { ...user, premiumUntil: null });
    expect((await invoice(mia, await refOf(mia, 'Rizal'))).status).toBe(201);
    const payload = await payloadOfLastInvoice();
    await request(h.app).post(`${h.base}/squads/${squadId}/leave`).set(rizal.auth());
    await preCheckout(payload, tgIdOf(mia));
    expect(lastAnswer()).toMatchObject({ ok: false });
  });

  it('asks Telegram to retry when the gift cannot be recorded', async () => {
    const spy = vi.spyOn(engageRepo().gifts, 'byCharge').mockRejectedValueOnce(new Error('database away'));
    try {
      expect((await paid('gift:whatever', 'charge-gift-down', tgIdOf(mia))).status).toBe(503);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('refunds (AC4)', () => {
  it('returns the Stars to the gifter, takes back the rest of the week, and does it once', async () => {
    const before = calls.length;
    const res = await refund('charge-gift-1');
    expect(res.status).toBe(200);
    expect(res.body.refund).toMatchObject({ status: 'refunded', userId: mia.userId });
    const refunds = calls.slice(before).filter((c) => c.method === 'refundStarPayment');
    expect(refunds).toEqual([
      { method: 'refundStarPayment', body: { user_id: tgIdOf(mia), telegram_payment_charge_id: 'charge-gift-1' } },
    ]);
    expect(userDoc(rizal).premiumUntil ?? null).toBeNull();
    expect((await engageRepo().gifts.byCharge('charge-gift-1'))).toMatchObject({ status: 'refunded' });

    const again = await refund('charge-gift-1');
    expect(again.body.refund).toMatchObject({ status: 'already_refunded' });
    expect(calls.slice(before).filter((c) => c.method === 'refundStarPayment')).toHaveLength(1);
  });
});

describe('erasure (§8.4)', () => {
  it('keeps the financial row and nulls the people in it', async () => {
    await purgeUser(mia.userId);
    const gift = await engageRepo().gifts.byCharge('charge-gift-1');
    expect(gift).toMatchObject({ gifterUserId: null, starsAmount: PRICE, status: 'refunded' });
    expect((await engageRepo().exportUser(rizal.userId)).giftsReceived).toEqual([
      expect.objectContaining({ id: gift!.id, status: 'refunded' }),
    ]);
  });
});
