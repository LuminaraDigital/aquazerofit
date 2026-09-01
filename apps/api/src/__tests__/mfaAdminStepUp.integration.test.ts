/**
 * MFA enrolment + admin step-up, end to end over supertest.
 *
 * Covers the properties that make this feature worth having rather than just
 * present: an unconfirmed secret never opens the gate, a code cannot be
 * replayed inside its own window, a step-up earned by one access token does not
 * carry to another, recovery codes are single use, repeated wrong codes lock
 * out, and the unenrolled-admin bypass is audited rather than silent.
 *
 * Real time throughout, no clock mocking: the confirming code burns the current
 * step, so the successful step-up deliberately uses the NEXT step, which the
 * ±1 skew window accepts and the replay guard does not consider stale.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-mfa-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { totpCodeAtStep, totpStepAt } = await import('../modules/mfa/totp');
const { resetMfaLockouts } = await import('../modules/mfa/service');

const app = createApp();
const base = '/api/v1';
const PASSWORD = 'CorrectHorse9Battery';

interface Session {
  userId: string;
  accessToken: string;
  email: string;
}

let seq = 0;

async function registerAdmin(): Promise<Session> {
  const email = `mfa-admin-${++seq}@example.com`;
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email, password: PASSWORD, displayName: 'MFA Admin' });
  expect(res.status).toBe(201);
  const store = getStore();
  const user = store.byId<{ id: string; role: string }>('users', res.body.user.id)!;
  store.upsert('users', { ...user, role: 'admin' });
  return { userId: res.body.user.id, accessToken: res.body.accessToken, email };
}

/** A second, independent access token for the same account. */
async function signInAgain(email: string): Promise<string> {
  const res = await request(app).post(`${base}/auth/login`).send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

function auditActions(userId: string): string[] {
  return getStore()
    .where<{ id: string; userId?: string; action?: string }>('audit', (d) => d.userId === userId)
    .map((d) => d.action ?? '');
}

/** The secret handed back at enrolment; used only to compute codes in tests. */
async function enrol(session: Session): Promise<string> {
  const res = await request(app)
    .post(`${base}/auth/mfa/enroll`)
    .set('Authorization', `Bearer ${session.accessToken}`)
    .send({});
  expect(res.status).toBe(201);
  return res.body.enrolment.secret as string;
}

async function confirm(session: Session, secret: string): Promise<string[]> {
  const res = await request(app)
    .post(`${base}/auth/mfa/confirm`)
    .set('Authorization', `Bearer ${session.accessToken}`)
    .send({ code: totpCodeAtStep(secret, totpStepAt(Math.floor(Date.now() / 1000))) });
  expect(res.status).toBe(200);
  return res.body.mfa.recoveryCodes as string[];
}

/** A code for the step after the current one: inside the skew window, never yet accepted. */
function nextStepCode(secret: string): string {
  return totpCodeAtStep(secret, totpStepAt(Math.floor(Date.now() / 1000)) + 1);
}

beforeEach(() => {
  resetMfaLockouts();
  delete process.env.MFA_REQUIRE_ADMIN;
});

afterAll(async () => {
  delete process.env.MFA_REQUIRE_ADMIN;
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('migration posture: admin with no second factor', () => {
  it('is let through by default but the bypass is written to the audit log', async () => {
    const session = await registerAdmin();
    const res = await request(app)
      .get(`${base}/admin/users`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(200);
    expect(auditActions(session.userId)).toContain('admin.mfa.unenforced');
  });

  it('is refused outright once MFA_REQUIRE_ADMIN is on', async () => {
    const session = await registerAdmin();
    process.env.MFA_REQUIRE_ADMIN = 'true';
    const res = await request(app)
      .get(`${base}/admin/users`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.details.reason).toBe('mfa_enrolment_required');
    expect(auditActions(session.userId)).toContain('admin.mfa.enrolment_required');
  });

  it('still refuses a non-admin regardless of enrolment', async () => {
    const res = await request(app).post(`${base}/auth/register`).send({
      email: `mfa-user-${++seq}@example.com`,
      password: PASSWORD,
    });
    const denied = await request(app)
      .get(`${base}/admin/users`)
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(denied.status).toBe(403);
    expect(denied.body.details?.reason).toBeUndefined();
  });
});

describe('enrolment', () => {
  it('never activates an unconfirmed secret', async () => {
    const session = await registerAdmin();
    await enrol(session);

    const status = await request(app)
      .get(`${base}/auth/mfa/status`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(status.body.mfa).toMatchObject({ enrolled: false, enrolmentPending: true });

    // Enforcement on: a pending secret must NOT count as a second factor, or a
    // half-finished enrolment would lock the admin out of their own system.
    process.env.MFA_REQUIRE_ADMIN = 'true';
    const res = await request(app)
      .get(`${base}/admin/users`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.body.details.reason).toBe('mfa_enrolment_required');
  });

  it('rejects a wrong confirmation code and activates on a right one', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);

    const wrong = await request(app)
      .post(`${base}/auth/mfa/confirm`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ code: '000000' });
    expect([400, 401]).toContain(wrong.status);

    const codes = await confirm(session, secret);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
  });

  it('never returns the secret again after enrolment', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    await confirm(session, secret);

    const status = await request(app)
      .get(`${base}/auth/mfa/status`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(status.status).toBe(200);
    expect(status.body.mfa).toMatchObject({ enrolled: true, recoveryCodesRemaining: 10 });
    expect(JSON.stringify(status.body)).not.toContain(secret);
  });

  it('refuses to re-enrol over an active factor without a fresh step-up', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    await confirm(session, secret);

    const res = await request(app)
      .post(`${base}/auth/mfa/enroll`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.details.reason).toBe('mfa_step_up_required');
  });
});

describe('step-up gate on /admin', () => {
  it('closes as soon as MFA is confirmed, even with enforcement off', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    await confirm(session, secret);

    const res = await request(app)
      .get(`${base}/admin/users`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.details.reason).toBe('mfa_step_up_required');
    expect(res.body.details.challengePath).toBe('/api/v1/auth/mfa/challenge');
  });

  it('opens after a successful challenge, and records success in the audit log', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    await confirm(session, secret);

    const challenge = await request(app)
      .post(`${base}/auth/mfa/challenge`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ code: nextStepCode(secret) });
    expect(challenge.status).toBe(200);
    expect(challenge.body.stepUp.method).toBe('totp');
    expect(Date.parse(challenge.body.stepUp.expiresAt)).toBeGreaterThan(Date.now());

    const res = await request(app)
      .get(`${base}/admin/users`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(auditActions(session.userId)).toContain('mfa.stepup.succeeded');
  });

  it('does not carry the step-up to a different access token for the same user', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    await confirm(session, secret);
    const ok = await request(app)
      .post(`${base}/auth/mfa/challenge`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ code: nextStepCode(secret) });
    expect(ok.status).toBe(200);

    const otherToken = await signInAgain(session.email);
    expect(otherToken).not.toBe(session.accessToken);
    const res = await request(app)
      .get(`${base}/admin/users`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
    expect(res.body.details.reason).toBe('mfa_step_up_required');
  });

  it('leaves ordinary authenticated routes untouched', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    await confirm(session, secret);
    const me = await request(app)
      .get(`${base}/me/profile`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(me.status).toBeLessThan(500);
    expect(me.status).not.toBe(403);
  });
});

describe('replay protection', () => {
  it('refuses the code that confirmed enrolment, and any older step', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    const step = totpStepAt(Math.floor(Date.now() / 1000));
    await confirm(session, secret);

    const replay = await request(app)
      .post(`${base}/auth/mfa/challenge`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ code: totpCodeAtStep(secret, step) });
    expect(replay.status).toBe(401);
    expect(replay.body.message).toMatch(/already been used/i);

    const older = await request(app)
      .post(`${base}/auth/mfa/challenge`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ code: totpCodeAtStep(secret, step - 1) });
    expect(older.status).toBe(401);

    // ...and the gate stayed shut through both attempts.
    const denied = await request(app)
      .get(`${base}/admin/users`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(denied.status).toBe(403);
    expect(auditActions(session.userId)).toContain('mfa.stepup.failed');
  });

  it('refuses a code that already earned a step-up', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    await confirm(session, secret);
    const code = nextStepCode(secret);

    const first = await request(app)
      .post(`${base}/auth/mfa/challenge`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ code });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`${base}/auth/mfa/challenge`)
      .set('Authorization', `Bearer ${await signInAgain(session.email)}`)
      .send({ code });
    expect(second.status).toBe(401);
    expect(second.body.message).toMatch(/already been used/i);
  });
});

describe('recovery codes', () => {
  it('are single use and are stored hashed, never in plaintext', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    const codes = await confirm(session, secret);
    const recoveryCode = codes[0]!;

    const first = await request(app)
      .post(`${base}/auth/mfa/challenge`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ recoveryCode });
    expect(first.status).toBe(200);
    expect(first.body.stepUp).toMatchObject({ method: 'recoveryCode', recoveryCodesRemaining: 9 });

    const admin = await request(app)
      .get(`${base}/admin/users`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(admin.status).toBe(200);

    const reuse = await request(app)
      .post(`${base}/auth/mfa/challenge`)
      .set('Authorization', `Bearer ${await signInAgain(session.email)}`)
      .send({ recoveryCode });
    expect(reuse.status).toBe(401);

    // Nothing in the stored credential document contains a recovery code.
    const stored = JSON.stringify(getStore().byId('users', `mfa-cred-${session.userId}`));
    for (const code of codes) {
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(code.replace(/-/g, ''));
    }
  });

  it('rejects a body carrying both a code and a recovery code', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    const codes = await confirm(session, secret);
    const res = await request(app)
      .post(`${base}/auth/mfa/challenge`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ code: nextStepCode(secret), recoveryCode: codes[1] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('brute-force lockout', () => {
  it('locks the account out after repeated wrong codes and reports Retry-After', async () => {
    const session = await registerAdmin();
    const secret = await enrol(session);
    await confirm(session, secret);

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post(`${base}/auth/mfa/challenge`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ code: '000000' });
      expect(res.status).toBe(401);
    }

    const locked = await request(app)
      .post(`${base}/auth/mfa/challenge`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ code: nextStepCode(secret) });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('RATE_LIMITED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);

    // A correct code does not open the gate while the lockout stands.
    const denied = await request(app)
      .get(`${base}/admin/users`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(denied.status).toBe(403);
  });
});
