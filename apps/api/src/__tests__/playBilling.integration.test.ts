/**
 * Play billing routes.
 *
 * The cases that matter here are the ones where getting it wrong gives the
 * product away: a forged purchase token granting premium, an unconfigured
 * deployment granting premium because it could not check, and an
 * unauthenticated webhook granting premium to anyone who finds the URL. Each
 * has exactly one correct answer — grant nothing — and each is pinned below.
 *
 * `fetch` is stubbed rather than reaching Google. What is under test is our
 * decision-making around the answer, not Google's API.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { User } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-play-billing-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { effectiveTier } = await import('../modules/billing/entitlements');
const { resetPlayTokenCache, obfuscatedAccountIdFor } = await import('../modules/billing/play');

const app = createApp();
const base = '/api/v1';

/*
 * A real RSA key, generated per run. `jwt.sign` with RS256 genuinely signs, so
 * a placeholder string throws inside the signer and every case downstream then
 * fails for a reason that has nothing to do with what is under test. Generated
 * rather than committed: a private key in a repository is a private key in a
 * repository, however inert.
 */
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'billing@aquazerofit.iam.gserviceaccount.com',
  private_key: privateKey,
});

const savedEnv = {
  PLAY_SERVICE_ACCOUNT_JSON: process.env.PLAY_SERVICE_ACCOUNT_JSON,
  PLAY_PACKAGE_NAME: process.env.PLAY_PACKAGE_NAME,
  PLAY_RTDN_SECRET: process.env.PLAY_RTDN_SECRET,
};

let token = '';
let userId = '';
const auth = () => ({ Authorization: `Bearer ${token}` });

/** Google answers: first the OAuth exchange, then the subscription lookup. */
function stubGoogle(subscription: unknown, status = 200): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'stub', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(subscription), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

const activeSubscription = (expiryTime: string) => ({
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  latestOrderId: 'GPA.1234',
  lineItems: [{ expiryTime }],
});

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

function userDoc(): User {
  return getStore().byId<User>('users', userId)!;
}

beforeAll(async () => {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'play-billing@example.com', password: 'CorrectHorse9Battery' });
  expect(res.status).toBe(201);
  token = res.body.accessToken as string;
  userId = res.body.user.id as string;
});

afterEach(() => {
  vi.restoreAllMocks();
  resetPlayTokenCache();
  process.env.PLAY_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT;
  process.env.PLAY_PACKAGE_NAME = 'fit.aquazero.app';
  process.env.PLAY_RTDN_SECRET = 'rtdn-secret';
  // Reset the account between cases so one grant cannot carry into the next.
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

describe('POST /billing/play/verify', () => {
  it('grants the period Google reports, not the one the client asked for', async () => {
    process.env.PLAY_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT;
    process.env.PLAY_PACKAGE_NAME = 'fit.aquazero.app';
    const expiry = inDays(30);
    stubGoogle(activeSubscription(expiry));

    const res = await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-good', productId: 'azf_premium_monthly' });

    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('premium');
    expect(effectiveTier(userDoc())).toBe('premium');
  });

  /*
   * The forged-token case. A purchase token is an opaque string any caller can
   * invent, so the only thing standing between a `curl` and a free
   * subscription is that Google is asked and its "no" is honoured.
   */
  it('grants nothing when Google does not recognise the token', async () => {
    stubGoogle({}, 404);

    const res = await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-forged', productId: 'azf_premium_monthly' });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PURCHASE_INVALID');
    expect(effectiveTier(userDoc())).toBe('free');
  });

  it('grants nothing for a subscription Google reports as on hold', async () => {
    stubGoogle({
      subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD',
      lineItems: [{ expiryTime: inDays(30) }],
    });

    const res = await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-hold', productId: 'azf_premium_monthly' });

    expect(res.status).toBe(402);
    expect(effectiveTier(userDoc())).toBe('free');
  });

  /*
   * The expensive misconfiguration. A deployment with no Play credentials
   * cannot check anything, and the tempting shortcut — trust the client
   * because we cannot verify — hands out the product silently and is invisible
   * until the revenue does not arrive.
   */
  it('refuses rather than assuming, when the server has no Play credentials', async () => {
    delete process.env.PLAY_SERVICE_ACCOUNT_JSON;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-any', productId: 'azf_premium_monthly' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENT_UNAVAILABLE');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(effectiveTier(userDoc())).toBe('free');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post(`${base}/billing/play/verify`)
      .send({ purchaseToken: 'tok-any', productId: 'azf_premium_monthly' });
    expect(res.status).toBe(401);
  });

  /*
   * The client acknowledges the purchase to Google only after this succeeds,
   * and an unacknowledged purchase is auto-refunded after three days — so a
   * retry is the normal path, not an edge case, and it must not stack periods.
   */
  it('is idempotent, so the client can safely retry a verification', async () => {
    const expiry = inDays(30);
    stubGoogle(activeSubscription(expiry));

    const send = () =>
      request(app)
        .post(`${base}/billing/play/verify`)
        .set(auth())
        .send({ purchaseToken: 'tok-retry', productId: 'azf_premium_monthly' });

    const first = await send();
    const second = await send();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.premiumUntil).toBe(first.body.premiumUntil);
  });

  /*
   * The regression this route existed with until now. A Play subscription
   * renews under the SAME purchase token, so keying idempotency on the token
   * alone made the first verification the only one that could ever move the
   * period — every later one deduplicated against it and handed back month
   * one. Renewals then worked only while the RTDN webhook was configured and
   * delivering, and nothing on the client could notice if it was not.
   */
  it('extends the period when the same token comes back with a later expiry', async () => {
    const firstMonth = inDays(30);
    stubGoogle(activeSubscription(firstMonth));
    const first = await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-renew', productId: 'azf_premium_monthly' });
    expect(first.body.premiumUntil).toBe(firstMonth);

    const secondMonth = inDays(60);
    stubGoogle(activeSubscription(secondMonth));
    const second = await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-renew', productId: 'azf_premium_monthly' });

    expect(second.status).toBe(200);
    expect(second.body.premiumUntil).toBe(secondMonth);
  });

  /*
   * A purchase token is a bearer string. Google confirming it is real says a
   * purchase happened, not that THIS caller made it, so without the account
   * check one leaked token would entitle every account it was pasted into.
   */
  it('refuses a purchase Google says was made by a different account', async () => {
    stubGoogle({
      ...activeSubscription(inDays(30)),
      externalAccountIdentifiers: { obfuscatedExternalAccountId: obfuscatedAccountIdFor('someone-else') },
    });

    const res = await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-stolen', productId: 'azf_premium_monthly' });

    expect(res.status).toBe(402);
    expect(effectiveTier(userDoc())).toBe('free');
  });

  it('accepts the purchase when the account identifier is the caller own', async () => {
    stubGoogle({
      ...activeSubscription(inDays(30)),
      externalAccountIdentifiers: { obfuscatedExternalAccountId: obfuscatedAccountIdFor(userId) },
    });

    const res = await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-mine', productId: 'azf_premium_monthly' });

    expect(res.status).toBe(200);
    expect(effectiveTier(userDoc())).toBe('premium');
  });

  /*
   * Purchases made by app builds from before the client sent an identifier
   * have none for Google to echo. Enforcing on absence would have revoked
   * premium from every existing subscriber the moment this deployed.
   */
  it('still honours a purchase that carries no account identifier at all', async () => {
    stubGoogle(activeSubscription(inDays(30)));

    const res = await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-legacy', productId: 'azf_premium_monthly' });

    expect(res.status).toBe(200);
    expect(effectiveTier(userDoc())).toBe('premium');
  });
});

describe('POST /billing/play/webhook', () => {
  const pubsub = (notification: unknown) => ({
    message: {
      messageId: 'm-1',
      data: Buffer.from(JSON.stringify(notification), 'utf8').toString('base64'),
    },
  });

  it('refuses a delivery with no secret — it is an entitlement-granting URL', async () => {
    const res = await request(app)
      .post(`${base}/billing/play/webhook`)
      .send(pubsub({ subscriptionNotification: { notificationType: 13, purchaseToken: 'x' } }));
    expect(res.status).toBe(401);
  });

  it('fails closed when no secret is configured, rather than trusting everyone', async () => {
    delete process.env.PLAY_RTDN_SECRET;
    const res = await request(app)
      .post(`${base}/billing/play/webhook`)
      .set('x-azf-rtdn-secret', 'anything')
      .send(pubsub({ subscriptionNotification: { notificationType: 13, purchaseToken: 'x' } }));
    expect(res.status).toBe(401);
  });

  it('acknowledges a token it has no grant for, without erroring', async () => {
    const res = await request(app)
      .post(`${base}/billing/play/webhook`)
      .set('x-azf-rtdn-secret', 'rtdn-secret')
      .send(pubsub({ subscriptionNotification: { notificationType: 2, purchaseToken: 'unknown' } }));
    // 200 because Pub/Sub redelivers anything else, forever.
    expect(res.status).toBe(200);
  });

  it('ends the entitlement on an EXPIRED notification', async () => {
    stubGoogle(activeSubscription(inDays(30)));
    await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-expire', productId: 'azf_premium_monthly' });
    expect(effectiveTier(userDoc())).toBe('premium');

    const res = await request(app)
      .post(`${base}/billing/play/webhook`)
      .set('x-azf-rtdn-secret', 'rtdn-secret')
      .send(
        pubsub({ subscriptionNotification: { notificationType: 13, purchaseToken: 'tok-expire' } }),
      );

    expect(res.status).toBe(200);
    expect(effectiveTier(userDoc())).toBe('free');
  });

  /*
   * Cancellation is not expiry. The user turned off auto-renew and has still
   * paid through the end of the period; taking it away immediately would be
   * confiscating time they bought.
   */
  it('leaves the period intact on a CANCELLED notification', async () => {
    stubGoogle(activeSubscription(inDays(30)));
    await request(app)
      .post(`${base}/billing/play/verify`)
      .set(auth())
      .send({ purchaseToken: 'tok-cancel', productId: 'azf_premium_monthly' });

    stubGoogle({
      subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
      lineItems: [{ expiryTime: inDays(30) }],
    });
    const res = await request(app)
      .post(`${base}/billing/play/webhook`)
      .set('x-azf-rtdn-secret', 'rtdn-secret')
      .send(
        pubsub({ subscriptionNotification: { notificationType: 3, purchaseToken: 'tok-cancel' } }),
      );

    expect(res.status).toBe(200);
    expect(effectiveTier(userDoc())).toBe('premium');
  });
});

describe('the account identifier shared with the Android client', () => {
  /*
   * CROSS-PLATFORM GOLDEN VECTOR — the twin of the assertion in
   * apps/android/.../PlayPurchaseRulesTest.kt, same input, same expected digest.
   *
   * The verify route refuses a purchase whose Play-reported account identifier
   * does not equal this function's output. If the two implementations drift,
   * the failure is not partial: every purchase on every device is rejected as
   * belonging to another account, from the very first one. Each side is
   * correct in isolation, so only a shared constant catches it — and it fails
   * on whichever side was edited.
   */
  it('is the digest the client is pinned to', () => {
    expect(obfuscatedAccountIdFor('usr_golden')).toBe(
      '362811fc7da81200c1d26e362d5036c27cf74c52f9356f0b5ccd864658524e4f',
    );
  });

  it('is 64 lowercase hex characters, the limit Play allows for the field', () => {
    expect(obfuscatedAccountIdFor('usr_any_account_id')).toMatch(/^[0-9a-f]{64}$/);
  });
});
