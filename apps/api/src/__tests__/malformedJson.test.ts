/**
 * A body that is not JSON is the caller's mistake. express.json reports it as
 * a SyntaxError, and the error handler used to turn that into a 500.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';

describe('malformed JSON bodies', () => {
  const app = createApp();

  it('returns 400 with a clear error for a truncated JSON body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Request body is not valid JSON.',
    });
  });

  it('returns 400 for a body that is not JSON at all', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('this is not json');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.message).toBe('Request body is not valid JSON.');
  });

  it('still accepts a well-formed JSON object', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'not-an-account@example.com', password: 'whatever-password' });

    expect(res.status).not.toBe(500);
    expect(res.body.message).not.toBe('Request body is not valid JSON.');
  });
});
