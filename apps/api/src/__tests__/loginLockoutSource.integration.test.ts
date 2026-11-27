/**
 * Who a sign-in lockout locks.
 *
 * The lockout was keyed on the email alone, and it is checked before the
 * password, so five wrong guesses from anywhere refused the right password
 * from everywhere for fifteen minutes. One request every three minutes kept
 * any account, an admin's included, locked indefinitely.
 *
 * Now the five-strike lock is per email AND source address. A much higher
 * per-email ceiling still stops guessing spread across many addresses, and it
 * never applies to an address that has signed in to that account before.
 *
 * Behind the Worker every request reaches Cloud Run from a shared Cloudflare
 * egress, so the source must be CF-Connecting-IP (trusted only with the
 * origin secret), not req.ip, or "per source" would mean "per edge".
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-lockout-'));
process.env.AZF_DATA_DIR = dataDir;
const SECRET = 'lockout-test-origin-secret-0123456789abcdef';
process.env.ORIGIN_SHARED_SECRET = SECRET;

const { createApp } = await import('../app');
const { resetLoginFailures, MAX_FAILURES_PER_EMAIL } = await import('../modules/auth/service');
const app = createApp();
const base = '/api/v1';
const PASSWORD = 'CorrectHorse9Battery';

afterAll(() => {
  delete process.env.ORIGIN_SHARED_SECRET;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => resetLoginFailures());

function login(email: string, password: string, ip: string) {
  return request(app)
    .post(`${base}/auth/login`)
    .set('x-origin-shared-secret', SECRET)
    .set('cf-connecting-ip', ip)
    .send({ email, password });
}

async function register(email: string): Promise<void> {
  const res = await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });
  expect(res.status).toBe(201);
}

describe('sign-in lockout source', () => {
  it("does not let someone else's wrong guesses lock the owner out", async () => {
    await register('owner-a@example.com');
    for (let i = 0; i < 6; i += 1) await login('owner-a@example.com', 'WrongHorse9Battery', '203.0.113.7');
    expect((await login('owner-a@example.com', 'WrongHorse9Battery', '203.0.113.7')).status).toBe(429);
    expect((await login('owner-a@example.com', PASSWORD, '198.51.100.20')).status).toBe(200);
  });

  it('still locks the guessing address', async () => {
    await register('owner-b@example.com');
    for (let i = 0; i < 5; i += 1) await login('owner-b@example.com', 'WrongHorse9Battery', '203.0.113.8');
    expect((await login('owner-b@example.com', PASSWORD, '203.0.113.8')).status).toBe(429);
  });

  it('stops guessing spread across many addresses, except from a known one', async () => {
    await register('owner-c@example.com');
    expect((await login('owner-c@example.com', PASSWORD, '198.51.100.30')).status).toBe(200);
    for (let i = 0; i < MAX_FAILURES_PER_EMAIL; i += 1) {
      await login('owner-c@example.com', 'WrongHorse9Battery', `203.0.113.${100 + (i % 100)}`);
    }
    expect((await login('owner-c@example.com', PASSWORD, '192.0.2.44')).status).toBe(429);
    expect((await login('owner-c@example.com', PASSWORD, '198.51.100.30')).status).toBe(200);
  });
});
