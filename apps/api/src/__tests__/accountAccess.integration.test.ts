/**
 * Account access flows (AQF-09 §2.3): the bridge between the two sign-in
 * surfaces.
 *
 *  - a Telegram-provisioned account has no credentials record, so before this
 *    flow existed it could never pass `login()` — POST /me/credentials is its
 *    only path onto the web;
 *  - POST /me/link-telegram is the mirror: an email account, signed in inside
 *    the Mini App, attaches its Telegram identity so auto-login lands on the
 *    same account thereafter.
 *
 * Every case exercises the real HTTP surface with real signed launch data
 * (signTelegramInitData shares the dev bot token with the validator).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-account-access-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { signTelegramInitData } = await import('../modules/auth/telegram');
const { resetTelegramNewAccountLimits } = await import('../modules/auth/service');

const app = createApp();
const base = '/api/v1';

/** Freshly signed launch data for a given Telegram user id. */
function initDataFor(tgId: number, name = 'Tess'): string {
  return signTelegramInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `AA-${tgId}`,
    user: JSON.stringify({ id: tgId, first_name: name }),
  });
}

async function telegramSignIn(tgId: number): Promise<{ token: string; userId: string }> {
  const res = await request(app).post(`${base}/auth/telegram`).send({ initData: initDataFor(tgId) });
  expect(res.status).toBe(200);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// The per-IP auto-provision cap (3/min) is service-level, not middleware, so
// the test-env rate-limiter bypass does not cover it. Reset it between cases.
beforeEach(() => {
  resetTelegramNewAccountLimits();
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows can hold the dir briefly; the tmpdir reaper will get it. */
  }
});

describe('telegram-provisioned account → web credentials', () => {
  it('provisions without a password and reports hasPassword=false', async () => {
    const { token } = await telegramSignIn(910001);
    const me = await request(app).get(`${base}/me`).set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.user.telegramLinked).toBe(true);
    expect(me.body.user.hasPassword).toBe(false);
    expect(me.body.user.email).toMatch(/^tg-910001@/);

    // And the account genuinely cannot sign in on the web yet.
    const login = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: me.body.user.email, password: 'AnythingAtAll1x' });
    expect(login.status).toBe(401);
  });

  it('rejects a password that fails the shared policy', async () => {
    const { token } = await telegramSignIn(910002);
    const res = await request(app)
      .post(`${base}/me/credentials`)
      .set(auth(token))
      .send({ email: 'tess2@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('sets email + password once, then that account signs in on the web', async () => {
    const { token, userId } = await telegramSignIn(910003);

    const set = await request(app)
      .post(`${base}/me/credentials`)
      .set(auth(token))
      .send({ email: 'Tess3@Example.com', password: 'CorrectHorse9Battery' });
    expect(set.status).toBe(200);
    expect(set.body.user.email).toBe('tess3@example.com'); // normalised
    expect(set.body.user.hasPassword).toBe(true);
    expect(set.body.user.telegramLinked).toBe(true);

    const login = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: 'tess3@example.com', password: 'CorrectHorse9Battery' });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(userId); // same account, not a new one

    // One-shot: a second call must bounce to the reset flow instead.
    const again = await request(app)
      .post(`${base}/me/credentials`)
      .set(auth(token))
      .send({ email: 'tess3b@example.com', password: 'CorrectHorse9Battery' });
    expect(again.status).toBe(409);
  });

  it('refuses an email already owned by another account', async () => {
    await request(app)
      .post(`${base}/auth/register`)
      .send({ email: 'taken@example.com', password: 'CorrectHorse9Battery', displayName: 'Owner' })
      .expect(201);

    const { token } = await telegramSignIn(910004);
    const res = await request(app)
      .post(`${base}/me/credentials`)
      .set(auth(token))
      .send({ email: 'taken@example.com', password: 'CorrectHorse9Battery' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('email-registered accounts report hasPassword=true from day one', async () => {
    const reg = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: 'has-pass@example.com', password: 'CorrectHorse9Battery' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.hasPassword).toBe(true);
    expect(reg.body.user.telegramLinked).toBe(false);
  });
});

describe('email account → telegram link (mirror direction)', () => {
  it('links a Telegram identity and rejects double-claiming it', async () => {
    const reg = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: 'linker@example.com', password: 'CorrectHorse9Battery' });
    expect(reg.status).toBe(201);
    const token = reg.body.accessToken as string;

    const link = await request(app)
      .post(`${base}/me/link-telegram`)
      .set(auth(token))
      .send({ initData: initDataFor(920001, 'Linker') });
    expect(link.status).toBe(200);
    expect(link.body.user.telegramLinked).toBe(true);
    expect(link.body.user.hasPassword).toBe(true);

    // The Mini App auto-login now lands on the linked account.
    const tg = await request(app)
      .post(`${base}/auth/telegram`)
      .send({ initData: initDataFor(920001, 'Linker') });
    expect(tg.status).toBe(200);
    expect(tg.body.user.id).toBe(reg.body.user.id);

    // A different account cannot claim the same Telegram identity.
    const other = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: 'other-linker@example.com', password: 'CorrectHorse9Battery' });
    expect(other.status).toBe(201);
    const conflict = await request(app)
      .post(`${base}/me/link-telegram`)
      .set(auth(other.body.accessToken as string))
      .send({ initData: initDataFor(920001, 'Linker') });
    expect(conflict.status).toBe(409);
  });
});
