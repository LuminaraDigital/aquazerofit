/**
 * GET /admin/audit/verify (EN-4.2): the operator's window onto the audit hash
 * chain. Gating is inherited from adminRouter (requireAuth, requireAdmin,
 * requireFreshMfa); these tests pin that it stays inherited.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

process.env.AZF_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-audit-verify-'));

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');

const app = createApp();
const base = '/api/v1';
const PASSWORD = 'CorrectHorse9Battery';

async function register(email: string, role?: 'admin') {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email, password: PASSWORD, displayName: 'Audit Verify' });
  expect(res.status).toBe(201);
  if (role) {
    const store = getStore();
    const user = store.byId<{ id: string }>('users', res.body.user.id)!;
    store.upsert('users', { ...user, role });
  }
  return res.body.accessToken as string;
}

describe('GET /admin/audit/verify', () => {
  it('rejects anonymous callers', async () => {
    const res = await request(app).get(`${base}/admin/audit/verify`);
    expect(res.status).toBe(401);
  });

  it('rejects a signed-in non-admin', async () => {
    const token = await register('audit-verify-user@example.com');
    const res = await request(app)
      .get(`${base}/admin/audit/verify`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('reports a valid chain to an admin', async () => {
    const token = await register('audit-verify-admin@example.com', 'admin');
    const res = await request(app)
      .get(`${base}/admin/audit/verify`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.verification.valid).toBe(true);
    expect(res.body.verification.count).toBeGreaterThan(0);
  });
});
