/**
 * Telegram Stars webhook: the one unauthenticated route that grants an
 * entitlement.
 *
 * Every test here corresponds to a way this endpoint could give away the paid
 * roster or double-charge somebody. They drive the HTTP surface rather than
 * the service functions, because the failure modes being guarded (a missing
 * header, a replayed update) live at exactly that boundary.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CoachState, StarsPurchase } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-stars-'));
process.env.AZF_DATA_DIR = dataDir;
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';
const SECRET = 'test-webhook-secret';

let userId = '';

beforeAll(async () => {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'stars@example.com', password: 'CorrectHorse9Battery', displayName: 'Pat' });
  expect(res.status).toBe(201);
  userId = res.body.user.id as string;
});

afterAll(async () => {
  await getStore().flush();
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

/** Stand in for `createCoachInvoice`, which would need a live bot token. */
function seedInvoice(payload: string, coachId = 'ogun', stars = 350): void {
  getStore().upsert('ledger', {
    type: 'starsInvoice',
    id: `inv-${payload}`,
    userId,
    coachId,
    stars,
    payload,
    createdAt: new Date().toISOString(),
  });
}

function paymentUpdate(payload: string, chargeId: string, amount = 350) {
  return {
    message: {
      successful_payment: {
        currency: 'XTR',
        total_amount: amount,
        invoice_payload: payload,
        telegram_payment_charge_id: chargeId,
      },
    },
  };
}

const purchasesFor = (coachId: string): StarsPurchase[] =>
  getStore().where<StarsPurchase>(
    'ledger',
    (d) => d.type === 'starsPurchase' && d.coachId === coachId && d.userId === userId,
  );

describe('webhook authentication', () => {
  it('rejects a delivery with no secret header', async () => {
    seedInvoice('coach.no-header');
    const res = await request(app)
      .post(`${base}/telegram/webhook`)
      .send(paymentUpdate('coach.no-header', 'charge-no-header'));

    expect(res.status).toBe(401);
    expect(purchasesFor('ogun')).toHaveLength(0);
  });

  it('rejects a delivery with the wrong secret', async () => {
    seedInvoice('coach.wrong-secret');
    const res = await request(app)
      .post(`${base}/telegram/webhook`)
      .set({ 'X-Telegram-Bot-Api-Secret-Token': 'not-the-secret' })
      .send(paymentUpdate('coach.wrong-secret', 'charge-wrong-secret'));

    expect(res.status).toBe(401);
    expect(purchasesFor('ogun')).toHaveLength(0);
  });
});

describe('successful payment', () => {
  it('grants the coach exactly once, however many times Telegram redelivers', async () => {
    seedInvoice('coach.happy');
    const update = paymentUpdate('coach.happy', 'charge-happy');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await request(app)
        .post(`${base}/telegram/webhook`)
        .set({ 'X-Telegram-Bot-Api-Secret-Token': SECRET })
        .send(update);
      // Always 2xx: a non-2xx makes Telegram retry forever.
      expect(res.status).toBe(200);
    }

    expect(purchasesFor('ogun')).toHaveLength(1);
    const state = getStore().byId<CoachState>('profiles', `coachState:${userId}`)!;
    expect(state.purchased.filter((id) => id === 'ogun')).toHaveLength(1);
  });

  it('consumes the pending invoice so the payload cannot be replayed', async () => {
    const remaining = getStore().where<{ id: string; type?: string; payload?: string }>(
      'ledger',
      (d) => d.type === 'starsInvoice' && d.payload === 'coach.happy',
    );
    expect(remaining).toHaveLength(0);
  });
});

describe('rejected payments', () => {
  it('grants nothing for a payload that matches no invoice', async () => {
    const res = await request(app)
      .post(`${base}/telegram/webhook`)
      .set({ 'X-Telegram-Bot-Api-Secret-Token': SECRET })
      .send(paymentUpdate('coach.forged-by-an-attacker', 'charge-forged'));

    expect(res.status).toBe(200);
    expect(purchasesFor('uthman')).toHaveLength(0);
  });

  it('grants nothing when the amount is below the invoiced price', async () => {
    seedInvoice('coach.underpaid', 'uthman', 200);
    const res = await request(app)
      .post(`${base}/telegram/webhook`)
      .set({ 'X-Telegram-Bot-Api-Secret-Token': SECRET })
      .send(paymentUpdate('coach.underpaid', 'charge-underpaid', 1));

    expect(res.status).toBe(200);
    expect(purchasesFor('uthman')).toHaveLength(0);
  });

  it('acknowledges an unrelated update without doing anything', async () => {
    const res = await request(app)
      .post(`${base}/telegram/webhook`)
      .set({ 'X-Telegram-Bot-Api-Secret-Token': SECRET })
      .send({ message: { text: 'hello' } });
    expect(res.status).toBe(200);
  });
});
