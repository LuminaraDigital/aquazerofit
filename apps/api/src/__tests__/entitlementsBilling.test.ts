/**
 * Paid entitlements: the spine every billing rail feeds into.
 *
 * The cases here are the ones that cost real money when they are wrong. A
 * subscription that does not expire is revenue given away forever; a renewal
 * counted twice is a period the user did not buy; an out-of-order delivery
 * that shortens a paid period is a refund request. None of them announce
 * themselves in normal use, which is why they are pinned here rather than
 * discovered in a support queue.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bindIsolatedDataDir,
  createIsolatedDataDir,
  pinIsolatedDataDir,
  teardownIsolatedDataDir,
} from './helpers/integrationIsolation';
import type { User } from '@aquazerofit/shared';

const savedAzfDataDir = process.env.AZF_DATA_DIR;
const dataDir = createIsolatedDataDir('azf-entitlements-');
bindIsolatedDataDir(dataDir);

const { effectiveTier, entitlementHistory, grantPremium, revokePremium } = await import(
  '../modules/billing/entitlements'
);
const { getStore } = await import('../platform/store');

afterAll(async () => {
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir);
});

let seq = 0;
function newUser(overrides: Partial<User> = {}): string {
  seq += 1;
  const id = `u_ent_${seq}`;
  getStore().upsert('users', {
    id,
    type: 'user',
    email: `${id}@example.test`,
    emailVerified: true,
    role: 'user',
    tier: 'free',
    displayName: 'Test User',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as User);
  return id;
}

function userDoc(id: string): User {
  return getStore().byId<User>('users', id)!;
}

const inDays = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString();

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
});

describe('effectiveTier', () => {
  it('is free with no entitlement at all', () => {
    expect(effectiveTier({ tier: 'free', premiumUntil: null })).toBe('free');
    expect(effectiveTier({ tier: 'free' })).toBe('free');
  });

  it('is premium while the paid period is still running', () => {
    expect(effectiveTier({ tier: 'free', premiumUntil: inDays(1) })).toBe('premium');
  });

  /*
   * The case the whole design exists for. A cancelled or lapsed subscription
   * must stop being premium on its own, with no scheduled job in the loop —
   * a job is a thing that can fail to run, and the failure mode is silent
   * unlimited access.
   */
  it('lapses to free the moment the period ends, with nothing having to run', () => {
    expect(effectiveTier({ tier: 'free', premiumUntil: inDays(-1) })).toBe('free');
  });

  it('keeps a comped account premium regardless of any period', () => {
    // Seeded and staff accounts are premium for reasons unconnected to a
    // payment; a lapsed period must not demote them.
    expect(effectiveTier({ tier: 'premium', premiumUntil: null })).toBe('premium');
    expect(effectiveTier({ tier: 'premium', premiumUntil: inDays(-30) })).toBe('premium');
  });

  it('fails closed on an unparseable period rather than handing out premium', () => {
    expect(effectiveTier({ tier: 'free', premiumUntil: 'whenever' })).toBe('free');
  });
});

describe('grantPremium', () => {
  it('establishes a period and flips the effective tier', () => {
    const id = newUser();
    expect(effectiveTier(userDoc(id))).toBe('free');

    grantPremium({ userId: id, source: 'play', externalId: 'tok-1', premiumUntil: inDays(30) });

    expect(effectiveTier(userDoc(id))).toBe('premium');
  });

  /*
   * Every billing provider retries a notification it believes failed. Without
   * this the user's period grows by a month on each redelivery — free
   * subscription time, granted by an infrastructure detail.
   */
  it('is idempotent on the provider reference, so a redelivery grants nothing extra', () => {
    const id = newUser();
    const first = grantPremium({
      userId: id,
      source: 'play',
      externalId: 'tok-dup',
      premiumUntil: inDays(30),
    });
    const second = grantPremium({
      userId: id,
      source: 'play',
      externalId: 'tok-dup',
      premiumUntil: inDays(30),
    });

    expect(first.status).toBe('granted');
    expect(second.status).toBe('duplicate');
    expect(second.premiumUntil).toBe(first.premiumUntil);
    expect(entitlementHistory(id).filter((g) => g.action === 'grant')).toHaveLength(1);
  });

  it('extends the period on a genuine renewal', () => {
    const id = newUser();
    grantPremium({ userId: id, source: 'play', externalId: 'tok-a', premiumUntil: inDays(30) });
    grantPremium({ userId: id, source: 'play', externalId: 'tok-b', premiumUntil: inDays(60) });

    expect(Date.parse(userDoc(id).premiumUntil!)).toBeGreaterThan(Date.now() + 59 * 86_400_000);
  });

  /*
   * Providers deliver out of order. A renewal arriving before the purchase it
   * renews is ordinary, and a naive assignment would let the older, shorter
   * period overwrite the longer one the user has already paid for.
   */
  it('never shortens a paid period when notifications arrive out of order', () => {
    const id = newUser();
    grantPremium({ userId: id, source: 'play', externalId: 'tok-late', premiumUntil: inDays(60) });
    grantPremium({ userId: id, source: 'play', externalId: 'tok-early', premiumUntil: inDays(30) });

    expect(Date.parse(userDoc(id).premiumUntil!)).toBeGreaterThan(Date.now() + 59 * 86_400_000);
  });

  it('refuses a period that is not an instant', () => {
    const id = newUser();
    expect(() =>
      grantPremium({ userId: id, source: 'admin', externalId: 'x', premiumUntil: 'soon' }),
    ).toThrow();
  });
});

describe('revokePremium', () => {
  it('ends the period immediately', () => {
    const id = newUser();
    grantPremium({ userId: id, source: 'stripe', externalId: 'sub-1', premiumUntil: inDays(30) });
    expect(effectiveTier(userDoc(id))).toBe('premium');

    revokePremium(id, 'stripe', 'chargeback-1', 'chargeback');

    expect(effectiveTier(userDoc(id))).toBe('free');
    expect(userDoc(id).premiumUntil).toBeNull();
  });

  it('leaves a comped account alone — its premium was never a payment', () => {
    const id = newUser({ tier: 'premium' });
    revokePremium(id, 'admin', 'rev-1', 'testing');
    expect(effectiveTier(userDoc(id))).toBe('premium');
  });

  it('keeps the overwritten period in history, which is what support reads', () => {
    const id = newUser();
    grantPremium({ userId: id, source: 'play', externalId: 'tok-h', premiumUntil: inDays(30) });
    revokePremium(id, 'play', 'refund-h', 'refunded');

    const history = entitlementHistory(id);
    expect(history).toHaveLength(2);
    expect(history[0]!.action).toBe('revoke');
    // The value the User doc no longer carries is still recoverable.
    expect(history[0]!.previousPremiumUntil).not.toBeNull();
  });
});
