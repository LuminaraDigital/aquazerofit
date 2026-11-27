/**
 * An unknown email costs the same work as a wrong password.
 *
 * login() answered both with the same message, but returned before bcrypt
 * when no account matched, so an unknown address came back in about a
 * millisecond and a known one after a full cost-12 compare (~250 ms). The
 * timing alone told anyone which addresses have accounts. Timing itself is
 * too noisy to assert in a test; the contract pinned here is the work: one
 * bcrypt compare per sign-in attempt, account or not.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-login-timing-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await getStore().flush();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('sign-in work', () => {
  it('runs one bcrypt compare for an address with no account', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    const res = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: 'nobody-here@example.com', password: 'CorrectHorse9Battery' });
    expect(res.status).toBe(401);
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('runs one bcrypt compare for a wrong password', async () => {
    await request(app)
      .post(`${base}/auth/register`)
      .send({ email: 'timing-known@example.com', password: 'CorrectHorse9Battery' });
    const compare = vi.spyOn(bcrypt, 'compare');
    const res = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: 'timing-known@example.com', password: 'WrongHorse9Battery' });
    expect(res.status).toBe(401);
    expect(compare).toHaveBeenCalledTimes(1);
  });
});
