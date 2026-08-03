/**
 * REGRESSION GUARD — account recovery is actually deliverable.
 *
 * Password reset minted a token and stored its hash, then had nowhere to send
 * it: the only delivery path was a console line behind EXPOSE_DEV_TOKENS,
 * which is hard gated off in production. The request endpoint answered its
 * enumeration-safe 202 either way, so a production deployment looked healthy
 * while every user who forgot a password was permanently locked out.
 *
 * These cover the transport, the copy, and the round trip: the token that
 * leaves in the mail must be the one that /password-reset/confirm accepts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-mail-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { drainOutbox, resolveMailProvider, sendMail } = await import('../platform/mailer');
const { passwordResetLink } = await import('../modules/auth/emails');

const app = createApp();
const base = '/api/v1';
const EMAIL = 'reset-mail@example.com';

/** The send is fire-and-forget; let its microtask settle before asserting. */
async function flushDelivery(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeAll(async () => {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: EMAIL, password: 'CorrectHorse9Battery', displayName: 'Resetter' });
  expect(res.status).toBe(201);
  drainOutbox();
});

afterEach(() => {
  drainOutbox();
  delete process.env.MAIL_PROVIDER;
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('password reset delivery', () => {
  it('sends a reset mail carrying a token that actually works', async () => {
    const requested = await request(app)
      .post(`${base}/auth/password-reset/request`)
      .send({ email: EMAIL });
    expect(requested.status).toBe(202);

    await flushDelivery();
    const sent = drainOutbox();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(EMAIL);
    expect(sent[0]!.subject).toMatch(/reset/i);

    // Recover the token from the link exactly as a recipient's browser would.
    const link = sent[0]!.text.match(/https?:\/\/\S+\?reset=\S+/)?.[0];
    expect(link).toBeDefined();
    const token = new URL(link!).searchParams.get('reset');
    expect(token).toBeTruthy();

    const confirmed = await request(app)
      .post(`${base}/auth/password-reset/confirm`)
      .send({ token, newPassword: 'BrandNewSecret9Pass' });
    expect(confirmed.status).toBe(200);

    const signedIn = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: EMAIL, password: 'BrandNewSecret9Pass' });
    expect(signedIn.status).toBe(200);
  });

  it('stays enumeration-safe: unknown addresses get the same answer and no mail', async () => {
    const res = await request(app)
      .post(`${base}/auth/password-reset/request`)
      .send({ email: 'nobody-here@example.com' });

    expect(res.status).toBe(202);
    expect(res.body.message).toMatch(/if that account exists/i);
    await flushDelivery();
    expect(drainOutbox()).toHaveLength(0);
  });

  it('does not fail the request when the transport is down', async () => {
    process.env.MAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream exploded', { status: 500 })),
    );

    const res = await request(app)
      .post(`${base}/auth/password-reset/request`)
      .send({ email: EMAIL });

    // A provider outage must not become a 500 — that would answer the
    // question the 202 exists to hide.
    expect(res.status).toBe(202);
    await flushDelivery();
    delete process.env.RESEND_API_KEY;
  });
});

describe('mail transport selection', () => {
  it('captures to the in-memory outbox under test', () => {
    expect(resolveMailProvider()).toBe('memory');
  });

  it('honours an explicit provider override', () => {
    process.env.MAIL_PROVIDER = 'console';
    expect(resolveMailProvider()).toBe('console');
  });

  it('posts to the provider API with the configured sender', async () => {
    process.env.MAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_key';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendMail({ to: 'someone@example.com', subject: 'Hi', text: 'body' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('api.resend.com');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test_key');
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(['someone@example.com']);
    expect(body.subject).toBe('Hi');
    delete process.env.RESEND_API_KEY;
  });

  it('surfaces a provider rejection to the caller', async () => {
    process.env.MAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 422 })),
    );

    await expect(sendMail({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toThrow(/422/);
    delete process.env.RESEND_API_KEY;
  });
});

describe('reset link', () => {
  it('points at the sign-in route with the token as a query parameter', () => {
    const link = passwordResetLink('tok en/with+specials');
    const url = new URL(link);
    expect(url.pathname).toBe('/sign-in');
    // Round-trips through encoding rather than corrupting the token.
    expect(url.searchParams.get('reset')).toBe('tok en/with+specials');
  });
});
