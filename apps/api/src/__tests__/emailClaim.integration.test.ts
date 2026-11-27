/**
 * An address added from a Telegram account is confirmed before it signs in.
 *
 * POST /me/credentials used to write the email onto the account at once,
 * unverified. A Telegram session could therefore claim someone else's
 * address: register then answered CONFLICT for the real owner, "forgot
 * password" mailed them a link, and the reset put them inside an account the
 * claimant could still reach through Telegram.
 *
 * Now a new address is only a pending claim. The email and password attach
 * when the link mailed to that address is opened, and that proves the
 * mailbox, so the account is marked verified. Until then the address belongs
 * to nobody here and register is free to take it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-email-claim-'));
process.env.AZF_DATA_DIR = dataDir;

const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; text: string }> }));
vi.mock('../platform/mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/mailer')>()),
  sendMail: async (msg: { to: string; text: string }) => {
    mail.sent.push({ to: msg.to, text: msg.text });
  },
}));

const { createApp } = await import('../app');
const { getStore, newId } = await import('../platform/store');
const { signAccess } = await import('../platform/auth');
const { findUserByEmail } = await import('../modules/auth/service');
const app = createApp();
const base = '/api/v1';
const PASSWORD = 'CorrectHorse9Battery';

afterAll(async () => {
  await getStore().flush();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  mail.sent.length = 0;
});

let n = 0;
const address = () => `claim-${Date.now()}-${n++}@example.com`;

/** A Telegram-provisioned account: synthetic address, no password. */
function telegramUser(): { user: User; token: string } {
  const id = newId('usr');
  const user: User = {
    id,
    email: `tg-${id}@telegram.aquazero.fit`,
    emailVerified: false,
    role: 'user',
    tier: 'free',
    displayName: 'Tele',
    tgId: Math.floor(Math.random() * 1e9),
    createdAt: new Date().toISOString(),
    deletionRequestedAt: null,
  };
  getStore().upsert('users', user);
  return { user, token: signAccess(user) };
}

const claim = (token: string, email: string, password = PASSWORD) =>
  request(app).post(`${base}/me/credentials`).set('authorization', `Bearer ${token}`).send({ email, password });

const confirm = (token: string) => request(app).post(`${base}/auth/email-confirm`).send({ token });

/** The token in the most recent mail to this address. */
async function mailedToken(to: string): Promise<string> {
  await vi.waitFor(() => expect(mail.sent.some((m) => m.to === to)).toBe(true));
  const text = mail.sent.filter((m) => m.to === to).at(-1)!.text;
  return /code in the app: (\S+)/.exec(text)![1]!;
}

describe('email claims from a Telegram account', () => {
  it('leaves an unconfirmed address off the account, free for its owner to register', async () => {
    const { user, token } = telegramUser();
    const email = address();

    const res = await claim(token, email);

    expect(res.status).toBe(202);
    expect(res.body.pendingEmail).toBe(email);
    expect(findUserByEmail(email)).toBeUndefined();
    expect(getStore().byId<User>('users', user.id)!.email).toBe(user.email);
    const owner = await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });
    expect(owner.status).toBe(201);
  });

  it('attaches the address and password, verified, once the mailed link is used', async () => {
    const { user, token } = telegramUser();
    const email = address();
    await claim(token, email);

    const res = await confirm(await mailedToken(email));

    expect(res.status).toBe(200);
    const after = getStore().byId<User>('users', user.id)!;
    expect(after).toMatchObject({ email, emailVerified: true, tgId: user.tgId });
    const login = await request(app).post(`${base}/auth/login`).send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(user.id);
  });

  it('refuses the link once someone else holds the address', async () => {
    const { user, token } = telegramUser();
    const email = address();
    await claim(token, email);
    const link = await mailedToken(email);
    await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });

    expect((await confirm(link)).status).toBe(409);
    expect(getStore().byId<User>('users', user.id)!.email).toBe(user.email);
  });

  it('uses a link once, and only the newest claim', async () => {
    const { token } = telegramUser();
    const first = address();
    await claim(token, first);
    const stale = await mailedToken(first);
    const second = address();
    await claim(token, second);

    expect((await confirm(stale)).status).toBe(400);
    const fresh = await mailedToken(second);
    expect((await confirm(fresh)).status).toBe(200);
    expect((await confirm(fresh)).status).toBe(400);
  });

  it('refuses an address on the domain nobody here receives mail for', async () => {
    const { token } = telegramUser();
    expect((await claim(token, `someone@telegram.aquazero.fit`)).status).toBe(400);
    expect(mail.sent).toEqual([]);
  });

  it('limits how many confirmation mails one account can send', async () => {
    const { token } = telegramUser();
    for (let i = 0; i < 3; i += 1) expect((await claim(token, address())).status).toBe(202);
    expect((await claim(token, address())).status).toBe(429);
  });
});
