/**
 * The Google Play reviewer account: provisioned from secrets, never from the
 * source, and comped to premium only through the server-side allowlist.
 *
 * The reviewer instructions used to point Play at the demo account, whose
 * password was hard-coded in data/seed.ts in a public repository, and whose
 * seeding production disables anyway. These tests pin the replacement:
 * nothing happens without both secrets, weak or known-public passwords are
 * refused, the grant cannot be steered onto an existing account, re-running
 * is a no-op, and rotating the secret rotates the password and its sessions.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@aquazerofit/shared';
import {
  COMPED_PREMIUM_ACCOUNTS,
  PLAY_REVIEWER_USER_ID,
  provisionPlayReviewer,
  resetSeededDirs,
  seedIfNeeded,
} from '../data/seed';
import { JsonStore } from '../platform/store';
import { effectiveTier } from '../modules/billing/entitlements';

const dirs: string[] = [];
const opened: JsonStore[] = [];

function freshStore(): JsonStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-play-reviewer-'));
  dirs.push(dir);
  const store = new JsonStore(dir);
  opened.push(store);
  return store;
}

const EMAIL = 'play-review@example.com';
const PASSWORD = 'correct-horse-battery-staple-42';

const reviewerOf = (store: JsonStore) => store.byId<User>('users', PLAY_REVIEWER_USER_ID);
const credOf = (store: JsonStore) =>
  store.byId<{ id: string; passwordHash: string }>('users', `cred-${PLAY_REVIEWER_USER_ID}`);
const reviewerAudit = (store: JsonStore) =>
  store.where<{ id: string; action: string; userId: string; detail?: Record<string, unknown> }>(
    'audit',
    (d) => (d as { userId?: string }).userId === PLAY_REVIEWER_USER_ID,
  );

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetSeededDirs();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  warn.mockRestore();
});

afterAll(async () => {
  for (const s of opened.splice(0)) await s.flush();
  for (const dir of dirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup on Windows */
    }
  }
});

describe('provisionPlayReviewer', () => {
  it('does nothing at all when neither secret is set', async () => {
    const store = freshStore();
    expect(await provisionPlayReviewer(store, {})).toEqual({ status: 'skipped' });
    expect(reviewerOf(store)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    [{ PLAY_REVIEWER_EMAIL: EMAIL }, /must both be set/],
    [{ PLAY_REVIEWER_PASSWORD: PASSWORD }, /must both be set/],
    [{ PLAY_REVIEWER_EMAIL: 'not-an-address', PLAY_REVIEWER_PASSWORD: PASSWORD }, /not an email/],
    [{ PLAY_REVIEWER_EMAIL: 'review@aquazero.fit', PLAY_REVIEWER_PASSWORD: PASSWORD }, /nobody has registered/],
    [{ PLAY_REVIEWER_EMAIL: EMAIL, PLAY_REVIEWER_PASSWORD: 'short-pass' }, /shorter than 16/],
    [{ PLAY_REVIEWER_EMAIL: EMAIL, PLAY_REVIEWER_PASSWORD: 'replace-with-a-real-secret' }, /placeholder/],
    // The demo password that was committed to this repository.
    [{ PLAY_REVIEWER_EMAIL: EMAIL, PLAY_REVIEWER_PASSWORD: ['AquaZero', 'Demo!', '2026'].join('') }, /known to be public/],
  ])('refuses %o and creates nothing', async (env, reason) => {
    const store = freshStore();
    const outcome = await provisionPlayReviewer(store, env);
    expect(outcome.status).toBe('refused');
    expect(outcome.status === 'refused' && outcome.reason).toMatch(reason);
    expect(reviewerOf(store)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(reason));
    // The password never reaches the log.
    for (const call of warn.mock.calls) expect(String(call[0])).not.toContain(PASSWORD);
  });

  it('creates a premium, populated, ordinary-role account and audits it', async () => {
    const store = freshStore();
    const outcome = await provisionPlayReviewer(store, {
      PLAY_REVIEWER_EMAIL: ' Play-Review@Example.com ',
      PLAY_REVIEWER_PASSWORD: PASSWORD,
    });

    expect(outcome).toEqual({ status: 'created' });
    const user = reviewerOf(store)!;
    expect(user).toMatchObject({ email: EMAIL, role: 'user', tier: 'premium', emailVerified: true });
    expect(effectiveTier(user)).toBe('premium');
    expect(await bcrypt.compare(PASSWORD, credOf(store)!.passwordHash)).toBe(true);
    // Populated, so every tab shows real data rather than the setup prompt.
    expect(store.byId('profiles', `profile-${PLAY_REVIEWER_USER_ID}`)).toBeTruthy();
    expect(
      store.where('logs', (d) => (d as { userId?: string }).userId === PLAY_REVIEWER_USER_ID).length,
    ).toBeGreaterThan(14);
    // A production account: analytics consent is not switched on for it.
    expect(store.byId('users', `consent-${PLAY_REVIEWER_USER_ID}`)).toMatchObject({
      anonymisedAnalytics: false,
    });

    const actions = reviewerAudit(store).map((e) => e.action).sort();
    expect(actions).toEqual(['play_reviewer.premium_comped', 'play_reviewer.provisioned']);
    const comp = reviewerAudit(store).find((e) => e.action === 'play_reviewer.premium_comped')!;
    expect(comp.detail?.reason).toBe(COMPED_PREMIUM_ACCOUNTS.get(PLAY_REVIEWER_USER_ID));
    expect(JSON.stringify(reviewerAudit(store))).not.toContain(EMAIL);
    expect(JSON.stringify(reviewerAudit(store))).not.toContain(PASSWORD);
  });

  it('is idempotent: a second boot with the same secrets changes nothing', async () => {
    const store = freshStore();
    const env = { PLAY_REVIEWER_EMAIL: EMAIL, PLAY_REVIEWER_PASSWORD: PASSWORD };
    await provisionPlayReviewer(store, env);
    const hash = credOf(store)!.passwordHash;
    const logs = store.count('logs');
    const audits = reviewerAudit(store).length;

    expect(await provisionPlayReviewer(store, env)).toEqual({ status: 'unchanged' });
    expect(credOf(store)!.passwordHash).toBe(hash);
    expect(store.count('logs')).toBe(logs);
    expect(reviewerAudit(store)).toHaveLength(audits);
  });

  it('rotates the password and revokes live sessions when the secret changes', async () => {
    const store = freshStore();
    await provisionPlayReviewer(store, { PLAY_REVIEWER_EMAIL: EMAIL, PLAY_REVIEWER_PASSWORD: PASSWORD });
    store.upsert('users', {
      id: 'rt-reviewer-1',
      type: 'refreshToken',
      userId: PLAY_REVIEWER_USER_ID,
      familyId: 'fam-1',
      tokenHash: 'x',
      revokedAt: null,
    });

    const next = 'a-new-rotated-secret-value-99';
    expect(
      await provisionPlayReviewer(store, { PLAY_REVIEWER_EMAIL: EMAIL, PLAY_REVIEWER_PASSWORD: next }),
    ).toEqual({ status: 'rotated' });
    const hash = credOf(store)!.passwordHash;
    expect(await bcrypt.compare(next, hash)).toBe(true);
    expect(await bcrypt.compare(PASSWORD, hash)).toBe(false);
    expect(store.byId<{ id: string; revokedAt: string | null }>('users', 'rt-reviewer-1')?.revokedAt).toBeTruthy();
    expect(reviewerAudit(store).map((e) => e.action)).toContain('play_reviewer.password_rotated');
  });

  it('cannot be pointed at an existing account to upgrade it', async () => {
    const store = freshStore();
    const someone: User = {
      id: 'usr-someone',
      email: EMAIL,
      emailVerified: true,
      role: 'user',
      tier: 'free',
      displayName: 'Someone',
      createdAt: new Date().toISOString(),
      deletionRequestedAt: null,
    };
    store.upsert('users', someone);

    const outcome = await provisionPlayReviewer(store, {
      PLAY_REVIEWER_EMAIL: EMAIL,
      PLAY_REVIEWER_PASSWORD: PASSWORD,
    });

    expect(outcome.status).toBe('refused');
    expect(store.byId<User>('users', 'usr-someone')?.tier).toBe('free');
    expect(reviewerOf(store)).toBeUndefined();
  });

  it('leaves a re-addressed reviewer account alone rather than taking over another address', async () => {
    const store = freshStore();
    await provisionPlayReviewer(store, { PLAY_REVIEWER_EMAIL: EMAIL, PLAY_REVIEWER_PASSWORD: PASSWORD });
    const outcome = await provisionPlayReviewer(store, {
      PLAY_REVIEWER_EMAIL: 'other-review@example.com',
      PLAY_REVIEWER_PASSWORD: PASSWORD,
    });
    expect(outcome.status).toBe('refused');
    expect(reviewerOf(store)?.email).toBe(EMAIL);
  });

  it('refuses to attach a password when the reviewer id exists at another address with no credentials', async () => {
    const store = freshStore();
    store.upsert('users', {
      id: PLAY_REVIEWER_USER_ID,
      email: 'other@example.com',
      emailVerified: true,
      role: 'user',
      tier: 'free',
      displayName: 'Someone',
      createdAt: new Date().toISOString(),
      deletionRequestedAt: null,
    });

    const outcome = await provisionPlayReviewer(store, {
      PLAY_REVIEWER_EMAIL: EMAIL,
      PLAY_REVIEWER_PASSWORD: PASSWORD,
    });

    expect(outcome.status).toBe('refused');
    expect(reviewerOf(store)).toMatchObject({ email: 'other@example.com', tier: 'free' });
    expect(credOf(store)).toBeUndefined();
  });

  it('reports repaired, not unchanged, when it restores premium on the reviewer account', async () => {
    const store = freshStore();
    const env = { PLAY_REVIEWER_EMAIL: EMAIL, PLAY_REVIEWER_PASSWORD: PASSWORD };
    await provisionPlayReviewer(store, env);
    const hash = credOf(store)!.passwordHash;
    store.upsert('users', { ...reviewerOf(store)!, tier: 'free' });

    expect(await provisionPlayReviewer(store, env)).toEqual({ status: 'repaired' });
    expect(reviewerOf(store)?.tier).toBe('premium');
    expect(effectiveTier(reviewerOf(store)!)).toBe('premium');
    expect(credOf(store)!.passwordHash).toBe(hash);
    expect(reviewerAudit(store).map((e) => e.action)).toContain('play_reviewer.premium_comped');
  });

  it('fills sample history when the account exists without it', async () => {
    const store = freshStore();
    const env = { PLAY_REVIEWER_EMAIL: EMAIL, PLAY_REVIEWER_PASSWORD: PASSWORD };
    await provisionPlayReviewer(store, env);
    for (const doc of store.where<{ id: string; userId?: string }>('logs', (d) => {
      return (d as { userId?: string }).userId === PLAY_REVIEWER_USER_ID;
    })) {
      store.delete('logs', doc.id);
    }
    store.delete('profiles', `profile-${PLAY_REVIEWER_USER_ID}`);

    expect(await provisionPlayReviewer(store, env)).toEqual({ status: 'repaired' });
    expect(store.byId('profiles', `profile-${PLAY_REVIEWER_USER_ID}`)).toBeTruthy();
    expect(
      store.where('logs', (d) => (d as { userId?: string }).userId === PLAY_REVIEWER_USER_ID).length,
    ).toBeGreaterThan(14);
  });
});

describe('seeding in production', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_PASSWORD', '');
  });

  it('provisions the reviewer from the secrets, and never the demo account', async () => {
    vi.stubEnv('PLAY_REVIEWER_EMAIL', EMAIL);
    vi.stubEnv('PLAY_REVIEWER_PASSWORD', PASSWORD);
    const store = freshStore();
    await seedIfNeeded(store);

    expect(reviewerOf(store)).toMatchObject({ email: EMAIL, tier: 'premium' });
    expect(store.byId('users', 'usr-demo')).toBeUndefined();
  });

  it('is a no-op for accounts when the secrets are unset', async () => {
    vi.stubEnv('PLAY_REVIEWER_EMAIL', '');
    vi.stubEnv('PLAY_REVIEWER_PASSWORD', '');
    const store = freshStore();
    await seedIfNeeded(store);

    expect(reviewerOf(store)).toBeUndefined();
    expect(store.byId('users', 'usr-demo')).toBeUndefined();
  });
});

describe('the development demo account', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('AZF_SEED_DEMO', 'true');
    vi.stubEnv('PLAY_REVIEWER_EMAIL', '');
    vi.stubEnv('PLAY_REVIEWER_PASSWORD', '');
  });

  it('takes its password from AZF_DEMO_PASSWORD', async () => {
    vi.stubEnv('AZF_DEMO_PASSWORD', 'local-demo-password-for-tests');
    const store = freshStore();
    await seedIfNeeded(store);
    const cred = store.byId<{ id: string; passwordHash: string }>('users', 'cred-usr-demo')!;
    expect(await bcrypt.compare('local-demo-password-for-tests', cred.passwordHash)).toBe(true);
  });

  it('is seeded under a random password when AZF_DEMO_PASSWORD is unset, never the old literal', async () => {
    vi.stubEnv('AZF_DEMO_PASSWORD', '');
    const store = freshStore();
    await seedIfNeeded(store);
    const cred = store.byId<{ id: string; passwordHash: string }>('users', 'cred-usr-demo')!;
    expect(cred).toBeTruthy();
    expect(await bcrypt.compare(['AquaZero', 'Demo!', '2026'].join(''), cred.passwordHash)).toBe(false);
    // History still seeds, under the ids it always had.
    expect(store.byId('plans', 'plan-demo')).toBeTruthy();
  });

  it('will not leave the public demo password in place even when AZF_DEMO_PASSWORD is set to it', async () => {
    const publicPassword = ['AquaZero', 'Demo!', '2026'].join('');
    vi.stubEnv('AZF_DEMO_PASSWORD', publicPassword);
    const store = freshStore();
    await seedIfNeeded(store);
    const cred = store.byId<{ id: string; passwordHash: string }>('users', 'cred-usr-demo')!;
    expect(await bcrypt.compare(publicPassword, cred.passwordHash)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('retired the public demo password'));
    expect(JSON.stringify(store.where('audit', () => true))).not.toContain(publicPassword);
  });
});

describe('a demo account left over from the public password', () => {
  const publicPassword = ['AquaZero', 'Demo!', '2026'].join('');

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_PASSWORD', '');
    vi.stubEnv('PLAY_REVIEWER_EMAIL', '');
    vi.stubEnv('PLAY_REVIEWER_PASSWORD', '');
  });

  it('replaces that password and revokes live sessions, once', async () => {
    const store = freshStore();
    store.upsert('users', {
      id: 'usr-demo',
      email: 'demo@aquazero.fit',
      emailVerified: true,
      role: 'user',
      tier: 'premium',
      displayName: 'Alex Waters',
      createdAt: new Date().toISOString(),
      deletionRequestedAt: null,
    });
    store.upsert('users', {
      id: 'cred-usr-demo',
      type: 'credentials',
      userId: 'usr-demo',
      passwordHash: await bcrypt.hash(publicPassword, 4),
    });
    store.upsert('users', {
      id: 'rt-demo-1',
      type: 'refreshToken',
      userId: 'usr-demo',
      revokedAt: null,
    });

    await seedIfNeeded(store);

    const cred = store.byId<{ id: string; passwordHash: string }>('users', 'cred-usr-demo')!;
    expect(await bcrypt.compare(publicPassword, cred.passwordHash)).toBe(false);
    expect(store.byId<User>('users', 'usr-demo')?.tier).toBe('premium');
    expect(store.byId<{ id: string; revokedAt: string | null }>('users', 'rt-demo-1')?.revokedAt).toBeTruthy();
    const retired = store.where<{ id: string; action?: string }>('audit', (d) => {
      return (d as { action?: string }).action === 'demo.compromised_password_retired';
    });
    expect(retired).toHaveLength(1);
    expect(JSON.stringify(retired)).not.toContain(publicPassword);

    resetSeededDirs();
    await seedIfNeeded(store);
    expect(
      store.where('audit', (d) => (d as { action?: string }).action === 'demo.compromised_password_retired'),
    ).toHaveLength(1);
  });

  it('leaves a demo account that already has its own password alone', async () => {
    const store = freshStore();
    const own = 'a-private-demo-password-99';
    store.upsert('users', {
      id: 'usr-demo',
      email: 'demo@aquazero.fit',
      emailVerified: true,
      role: 'user',
      tier: 'premium',
      displayName: 'Alex Waters',
      createdAt: new Date().toISOString(),
      deletionRequestedAt: null,
    });
    store.upsert('users', {
      id: 'cred-usr-demo',
      type: 'credentials',
      userId: 'usr-demo',
      passwordHash: await bcrypt.hash(own, 4),
    });

    await seedIfNeeded(store);

    const cred = store.byId<{ id: string; passwordHash: string }>('users', 'cred-usr-demo')!;
    expect(await bcrypt.compare(own, cred.passwordHash)).toBe(true);
    expect(
      store.where('audit', (d) => (d as { action?: string }).action === 'demo.compromised_password_retired'),
    ).toHaveLength(0);
  });
});
