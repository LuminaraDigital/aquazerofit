/**
 * A malformed request is the caller's mistake, not a server fault.
 *
 * body-parser and multer reject bad input by throwing errors that carry a
 * 4xx status (or, for multer, a MulterError), and the error handler only
 * recognised AppError and ZodError. Everything else became a 500 and an
 * error-level log line, so anyone could fill the error log, and trip any
 * alert on 5xx, by sending `{` to a public route.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-malformed-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

afterAll(async () => {
  await getStore().flush();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('malformed requests', () => {
  it('answers broken JSON with 400', async () => {
    const res = await request(app)
      .post(`${base}/auth/login`)
      .set('content-type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('answers an oversized body with 413', async () => {
    const res = await request(app)
      .post(`${base}/auth/login`)
      .set('content-type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(1_100_000) }));
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('answers an upload multer refuses with 400', async () => {
    const reg = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: 'malformed@example.com', password: 'CorrectHorse9Battery' });
    const res = await request(app)
      .post(`${base}/meal-photos`)
      .set('authorization', `Bearer ${reg.body.accessToken}`)
      .attach('not-the-photo-field', Buffer.from('x'), 'x.jpg');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
