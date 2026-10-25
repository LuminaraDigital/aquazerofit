/**
 * A Telegram charge id credits a coach once. The in-memory unique index is
 * what enforces that on the JSON store the tests and local dev use. Postgres
 * has the same rule as a partial unique index, asserted in pgStore.test.ts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DuplicateIndexError,
  JsonStore,
  LEDGER_BY_STARS_CHARGE,
  indexKey,
} from '../platform/store';

const dirs: string[] = [];
const opened: JsonStore[] = [];

function newStore(): JsonStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-charge-'));
  dirs.push(dir);
  const store = new JsonStore(dir);
  opened.push(store);
  return store;
}

afterEach(async () => {
  for (const store of opened.splice(0)) await store.close();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const purchase = (id: string, chargeId: string) => ({
  id,
  type: 'starsPurchase' as const,
  userId: 'usr-1',
  coachId: 'uthman',
  stars: 200,
  telegramPaymentChargeId: chargeId,
  providerPaymentChargeId: null,
  invoicePayload: 'coach.one',
  createdAt: new Date().toISOString(),
});

describe('Stars charge unique index', () => {
  it('rejects a second purchase with the same charge id and leaves the first', () => {
    const store = newStore();
    store.upsert('ledger', purchase('pur-1', 'charge-1'));
    expect(() => store.upsert('ledger', purchase('pur-2', 'charge-1'))).toThrow(DuplicateIndexError);
    expect(store.byId('ledger', 'pur-2')).toBeUndefined();
    expect(store.indexedIds('ledger', LEDGER_BY_STARS_CHARGE, indexKey('charge-1'))).toEqual(['pur-1']);
  });

  it('allows an update of the same purchase row', () => {
    const store = newStore();
    store.upsert('ledger', purchase('pur-1', 'charge-1'));
    store.upsert('ledger', { ...purchase('pur-1', 'charge-1'), stars: 200 });
    expect(store.where('ledger', (d) => (d as { type?: string }).type === 'starsPurchase')).toHaveLength(1);
  });

  it('rejects a second subscription charge with the same charge id', () => {
    const store = newStore();
    const payment = {
      id: 'sspay-1',
      type: 'starsSubscriptionPayment' as const,
      userId: 'usr-1',
      stars: 100,
      telegramPaymentChargeId: 'charge-sub',
      providerPaymentChargeId: null,
      invoicePayload: 'premium.one',
      subscriptionExpirationDate: new Date().toISOString(),
      isRecurring: false,
      isFirstRecurring: true,
      createdAt: new Date().toISOString(),
    };
    store.upsert('ledger', payment);
    expect(() => store.upsert('ledger', { ...payment, id: 'sspay-2' })).toThrow(DuplicateIndexError);
    expect(store.byId('ledger', 'sspay-2')).toBeUndefined();
  });

  it('does not let a subscription refund occupy the charge id', () => {
    const store = newStore();
    store.upsert('ledger', {
      id: 'ssref-1',
      type: 'starsSubscriptionRefund',
      userId: 'usr-1',
      stars: 100,
      telegramPaymentChargeId: 'charge-sub',
      invoicePayload: 'premium.one',
      telegramUserId: 42,
      reason: 'support',
      actorId: 'admin',
      createdAt: new Date().toISOString(),
    });
    store.upsert('ledger', {
      id: 'sspay-1',
      type: 'starsSubscriptionPayment',
      userId: 'usr-1',
      stars: 100,
      telegramPaymentChargeId: 'charge-sub',
      providerPaymentChargeId: null,
      invoicePayload: 'premium.one',
      subscriptionExpirationDate: new Date().toISOString(),
      isRecurring: false,
      isFirstRecurring: true,
      createdAt: new Date().toISOString(),
    });
    expect(store.indexedIds('ledger', LEDGER_BY_STARS_CHARGE, indexKey('charge-sub'))).toEqual(['sspay-1']);
  });

  it('does not treat an invoice or a refund as a purchase', () => {
    const store = newStore();
    store.upsert('ledger', {
      id: 'inv-1',
      type: 'starsInvoice',
      userId: 'usr-1',
      coachId: 'uthman',
      stars: 200,
      payload: 'coach.one',
      createdAt: new Date().toISOString(),
    });
    store.upsert('ledger', {
      id: 'sref-1',
      type: 'starsRefund',
      userId: 'usr-1',
      coachId: 'uthman',
      stars: 200,
      telegramPaymentChargeId: 'charge-1',
      telegramUserId: 42,
      reason: 'support',
      actorId: 'admin',
      createdAt: new Date().toISOString(),
    });
    store.upsert('ledger', purchase('pur-1', 'charge-1'));
    expect(store.byId('ledger', 'pur-1')).toBeDefined();
  });
});
