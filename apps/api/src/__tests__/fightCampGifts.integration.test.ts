/**
 * S12 Gift a Round over HTTP (AZF-P1 US-G1): the invoice gates, Telegram's
 * pre-checkout re-validation, settlement through the Stars webhook, refunds,
 * and the financial row surviving erasure. Telegram itself is a stub.
 *
 * Mia owns "Corner Crew" with Rizal, Ana and Ben in it; Jay owns another
 * squad. Each payment case gifts a different member so no case leans on
 * state another one left behind.
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
let ana: Person;
let ben: Person;
let jay: Person;
let admin: Person;
let squadId = '';
let tgSeq = 7000;

type Doc = Record<string, unknown> & { id: string };
const userDoc = (p: Person) => getStore().byId<Doc & { tgId?: number; premiumUntil?: string | null }>('users', p.userId)!;
const tgIdOf = (p: Person) => userDoc(p).tgId!;
const premiumUntil = (p: Person) => userDoc(p).premiumUntil ?? null;
const ledgerFor = (externalId: string) =>
  getStore().where<Doc & { type?: string; externalId?: string; revokesExternalId?: string }>(
    'ledger',
    (d) => (d as { type?: string }).type === 'entitlementGrant' && (d as { externalId?: string }).externalId === externalId,
  );
const callsOf = (method: string, since = 0) => calls.slice(since).filter((c) => c.method === method);

async function refOf(viewer: Person, name: string): Promise<string> {
  const members = (await request(h.app).get(`${h.base}/squads/current`).set(viewer.auth())).body.squad.members as Array<{
    ref: string;
    displayName: string;
  }>;
  return members.find((m) => m.displayName === name)!.ref;
}
const invoice = (from: Person, to: string, extra: Record<string, unknown> = {}) =>
  request(h.app).post(`${h.base}/gifts/premium/invoice`).set(from.auth()).send({ to, ...extra });
const webhook = (update: Record<string, unknown>) =>
  request(h.app).post(`${h.base}/telegram/webhook`).set({ 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }).send(update);
const refund = (chargeId: string, extra: Record<string, unknown> = {}) =>
  request(h.app)
    .post(`${h.base}/admin/payments/stars/refund`)
    .set(admin.auth())
    .send({ telegramPaymentChargeId: chargeId, reason: 'Gifter asked', ...extra });

const lastPayload = () => String(callsOf('createInvoiceLink').at(-1)!.body.payload);
const lastAnswer = () => callsOf('answerPreCheckoutQuery').at(-1)!.body;

const preCheckout = (payload: string, payer: number, amount = PRICE) =>
  webhook({
    pre_checkout_query: { id: `pcq-${calls.length}`, from: { id: payer }, currency: 'XTR', total_amount: amount, invoice_payload: payload },
  });
const paid = (payload: string, chargeId: string, payer: number) =>
  webhook({
    message: {
      from: { id: payer },
      successful_payment: { currency: 'XTR', total_amount: PRICE, invoice_payload: payload, telegram_payment_charge_id: chargeId },
    },
  });

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h = await fightCampHarness('fc-gifts');
  h.enable('squads', 'gifting');
  mia = await h.register('Mia');
  rizal = await h.register('Rizal');
  ana = await h.register('Ana');
  ben = await h.register('Ben');
  jay = await h.register('Jay');
  admin = await h.register('Admin');
  getStore().upsert('users', { ...userDoc(admin), role: 'admin' });
  for (const p of [mia, rizal, ana, ben, jay]) {
    tgSeq += 1;
    getStore().upsert('users', { ...userDoc(p), tgId: tgSeq });
  }
  const made = await request(h.app).post(`${h.base}/squads`).set(mia.auth()).send({ name: 'Corner Crew', consent: true });
  squadId = made.body.squad.id as string;
  for (const [i, p] of [rizal, ana, ben].entries()) {
    vi.setSystemTime(new Date(NOW.getTime() + (i + 1) * 1000));
    await request(h.app).post(`${h.base}/squads/join`).set(p.auth()).send({ code: made.body.squad.inviteCode, consent: true });
  }
  await request(h.app).post(`${h.base}/squads`).set(jay.auth()).send({ name: 'Other Crew', consent: true });
  vi.setSystemTime(NOW);
});

beforeEach(() => {
  process.env.GIFT_PREMIUM_7D_STARS = String(PRICE);
  h.enable('squads', 'gifting');
});

afterEach(() => {
  delete process.env.GIFT_PREMIUM_7D_STARS;
  vi.setSystemTime(NOW);
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

  it('states the fixed price, also to an adult not linked to Telegram', async () => {
    for (const who of [mia, admin]) {
      expect((await request(h.app).get(`${h.base}/fight-record`).set(who.auth())).body.fightCamp.gifting).toEqual({
        stars: PRICE,
        received: null,
      });
    }
  });

  it('refuses a squad mate ref from another squad, yourself, a minor gifter and an unlinked one', async () => {
    const rizalRef = await refOf(mia, 'Rizal');
    // Jay is in a squad of his own: Rizal's ref names nobody in it.
    expect((await invoice(jay, rizalRef)).body.details).toEqual({ reason: 'gift_not_eligible' });
    expect((await invoice(mia, await refOf(mia, 'Mia'))).status).toBe(403);
    h.setAge(mia.userId, 17);
    expect((await invoice(mia, rizalRef)).status).toBe(403);
    h.setAge(mia.userId, 30);
    const linked = userDoc(mia);
    getStore().upsert('users', { ...linked, tgId: undefined });
    expect((await invoice(mia, rizalRef)).status).toBe(403);
    getStore().upsert('users', linked);
  });

  it('refuses a recipient who already has Premium', async () => {
    const before = userDoc(ben);
    getStore().upsert('users', { ...before, premiumUntil: new Date(NOW.getTime() + 3 * DAY_MS).toISOString() });
    const res = await invoice(mia, await refOf(mia, 'Ben'));
    expect(res.status).toBe(409);
    expect(res.body.details).toEqual({ reason: 'recipient_has_premium' });
    getStore().upsert('users', before);
  });
});

describe('paying for a gift (AC3, AC5)', () => {
  it('prices from the environment, re-validates at pre-checkout and grants exactly seven days once', async () => {
    // A price in the request is ignored: the amount only ever comes from the environment.
    const res = await invoice(mia, await refOf(mia, 'Rizal'), { stars: 1, amount: 1, days: 365 });
    expect(res.status).toBe(201);
    expect(res.body.invoiceLink).toMatch(/^https:\/\/t\.me\//);
    const invoiceCall = callsOf('createInvoiceLink').at(-1)!.body;
    expect(invoiceCall).toMatchObject({ currency: 'XTR', prices: [{ amount: PRICE }] });
    expect(String(invoiceCall.description)).toContain('7 days of AquaZeroFit Premium for Rizal');
    const payload = lastPayload();
    expect(payload).toMatch(/^gift:/);

    // Only the gifter may pay, and only the full price.
    await preCheckout(payload, tgIdOf(rizal));
    expect(lastAnswer()).toMatchObject({ ok: false });
    await preCheckout(payload, tgIdOf(mia), PRICE - 1);
    expect(lastAnswer()).toMatchObject({ ok: false });
    await preCheckout(payload, tgIdOf(mia));
    expect(lastAnswer()).toMatchObject({ ok: true });

    expect((await paid(payload, 'charge-rizal', tgIdOf(mia))).status).toBe(200);
    expect(Date.parse(premiumUntil(rizal)!)).toBe(NOW.getTime() + 7 * DAY_MS);
    // A redelivery grants nothing more.
    expect((await paid(payload, 'charge-rizal', tgIdOf(mia))).status).toBe(200);
    expect(ledgerFor('gift:charge-rizal')).toHaveLength(1);
    expect(await engageRepo().gifts.byCharge('charge-rizal')).toMatchObject({ status: 'granted', starsAmount: PRICE });

    const theirs = (await request(h.app).get(`${h.base}/fight-record`).set(rizal.auth())).body.fightCamp.gifting;
    expect(theirs.received).toMatchObject({ fromName: 'Mia' });
  });

  it('declines a link made before a price change, or more than a day ago', async () => {
    expect((await invoice(mia, await refOf(mia, 'Ben'))).status).toBe(201);
    const payload = lastPayload();
    process.env.GIFT_PREMIUM_7D_STARS = '250';
    await preCheckout(payload, tgIdOf(mia));
    expect(lastAnswer()).toMatchObject({ ok: false });
    process.env.GIFT_PREMIUM_7D_STARS = String(PRICE);
    vi.setSystemTime(new Date(NOW.getTime() + DAY_MS + 1000));
    await preCheckout(payload, tgIdOf(mia));
    expect(lastAnswer()).toMatchObject({ ok: false });
  });

  it('asks Telegram to retry a storage fault, and the redelivery grants once', async () => {
    expect((await invoice(mia, await refOf(mia, 'Ana'))).status).toBe(201);
    const payload = lastPayload();
    const spy = vi.spyOn(engageRepo().gifts, 'settle').mockRejectedValueOnce(new Error('database away'));
    try {
      expect((await paid(payload, 'charge-ana', tgIdOf(mia))).status).toBe(503);
    } finally {
      spy.mockRestore();
    }
    expect(await engageRepo().gifts.byCharge('charge-ana')).toMatchObject({ status: 'paid' });
    expect((await paid(payload, 'charge-ana', tgIdOf(mia))).status).toBe(200);
    expect(await engageRepo().gifts.byCharge('charge-ana')).toMatchObject({ status: 'granted' });
    expect(ledgerFor('gift:charge-ana')).toHaveLength(1);
    expect(Date.parse(premiumUntil(ana)!)).toBe(NOW.getTime() + 7 * DAY_MS);
  });

  it('refunds at once a second charge on a link that was already paid', async () => {
    const payload = (await engageRepo().gifts.byCharge('charge-ana'))!.invoicePayload;
    const before = calls.length;
    expect((await paid(payload, 'charge-ana-twice', tgIdOf(mia))).status).toBe(200);
    expect(callsOf('refundStarPayment', before)).toEqual([
      { method: 'refundStarPayment', body: { user_id: tgIdOf(mia), telegram_payment_charge_id: 'charge-ana-twice' } },
    ]);
    expect(ledgerFor('gift:charge-ana-twice')).toEqual([]);
  });

  it('declines at pre-checkout when the recipient has left the squad since', async () => {
    expect((await invoice(mia, await refOf(mia, 'Ben'))).status).toBe(201);
    const payload = lastPayload();
    await request(h.app).post(`${h.base}/squads/${squadId}/leave`).set(ben.auth());
    await preCheckout(payload, tgIdOf(mia));
    expect(lastAnswer()).toMatchObject({ ok: false });
  });
});

describe('refunds (AC4)', () => {
  it('returns the Stars to the gifter, takes back the rest of the week, and does it once', async () => {
    expect(Date.parse(premiumUntil(ana)!)).toBeGreaterThan(NOW.getTime());
    const before = calls.length;
    const res = await refund('charge-ana');
    expect(res.status).toBe(200);
    expect(res.body.refund).toMatchObject({ status: 'refunded', userId: mia.userId });
    expect(callsOf('refundStarPayment', before)).toEqual([
      { method: 'refundStarPayment', body: { user_id: tgIdOf(mia), telegram_payment_charge_id: 'charge-ana' } },
    ]);
    expect(premiumUntil(ana)).toBeNull();
    expect(ledgerFor('gift:refund:charge-ana')).toEqual([
      expect.objectContaining({ action: 'revoke', revokesExternalId: 'gift:charge-ana' }),
    ]);
    expect(await engageRepo().gifts.byCharge('charge-ana')).toMatchObject({ status: 'refunded' });

    expect((await refund('charge-ana')).body.refund).toMatchObject({ status: 'already_refunded' });
    expect(callsOf('refundStarPayment', before)).toHaveLength(1);
  });

  it('answers 404 for a charge no rail knows', async () => {
    const res = await refund('charge-nobody');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('No Stars payment matches that charge.');
  });
});

describe('erasure (§8.4)', () => {
  it('keeps the financial row, nulls the people, and can still refund to the payer an operator names', async () => {
    const payerTelegramId = tgIdOf(mia);
    await purgeUser(mia.userId);
    const gift = await engageRepo().gifts.byCharge('charge-rizal');
    expect(gift).toMatchObject({ gifterUserId: null, starsAmount: PRICE, status: 'granted' });
    expect((await engageRepo().exportUser(rizal.userId)).giftsReceived).toEqual([
      expect.objectContaining({ id: gift!.id, status: 'granted' }),
    ]);

    expect((await refund('charge-rizal')).status).toBe(409);
    const before = calls.length;
    const res = await refund('charge-rizal', { telegramUserId: payerTelegramId });
    expect(res.body.refund).toMatchObject({ status: 'refunded', userId: null });
    expect(callsOf('refundStarPayment', before)[0]!.body).toEqual({
      user_id: payerTelegramId,
      telegram_payment_charge_id: 'charge-rizal',
    });
    expect(premiumUntil(rizal)).toBeNull();
  });
});
