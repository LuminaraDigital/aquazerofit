/**
 * REGRESSION GUARD — the production admin is never seeded on a domain we do
 * not own.
 *
 * The seeder created admin@aquazero.fit whenever ADMIN_PASSWORD was set, and
 * aquazero.fit is not a domain this project owns. An admin's address has to be
 * one whose mail the operator actually receives, so production now seeds the
 * admin only at an operator-supplied ADMIN_EMAIL, and never at an address on
 * that domain. Local development keeps its default.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@aquazerofit/shared';
import { resetSeededDirs, seedIfNeeded } from '../data/seed';
import { getStore, JsonStore, resetStoreSingletonForTests } from '../platform/store';

const dirs: string[] = [];
const opened: JsonStore[] = [];

function freshStore(): JsonStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-admin-seed-'));
  dirs.push(dir);
  const store = new JsonStore(dir);
  opened.push(store);
  return store;
}

const adminOf = (store: JsonStore) => store.byId<User>('users', 'usr-admin');

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetSeededDirs();
  vi.stubEnv('ADMIN_PASSWORD', 'Adm1n-Seed-Test-Pass');
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

describe('admin seeding in production', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  it('does not create the admin without ADMIN_EMAIL, and says why', async () => {
    vi.stubEnv('ADMIN_EMAIL', '');
    const store = freshStore();
    await seedIfNeeded(store);

    expect(adminOf(store)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ADMIN_EMAIL'));
  });

  it('creates the admin at ADMIN_EMAIL', async () => {
    vi.stubEnv('ADMIN_EMAIL', ' Ops@Example.com ');
    const store = freshStore();
    await seedIfNeeded(store);

    expect(adminOf(store)).toMatchObject({ email: 'ops@example.com', role: 'admin' });
    expect(store.byId('users', 'cred-usr-admin')).toBeTruthy();
  });

  it.each(['admin@aquazero.fit', 'Admin@AquaZero.Fit', 'ops@mail.aquazero.fit'])(
    'refuses %s, on a domain this project does not own',
    async (email) => {
      vi.stubEnv('ADMIN_EMAIL', email);
      const store = freshStore();
      await seedIfNeeded(store);

      expect(adminOf(store)).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('aquazero.fit'));
    },
  );

  it('warns that ADMIN_EMAIL does not rewrite an admin seeded earlier', async () => {
    // seedAccount never touches an existing account, so a production store
    // that already holds the old admin keeps its address. Setting ADMIN_EMAIL
    // must not look like it fixed that.
    vi.stubEnv('ADMIN_EMAIL', 'ops@example.com');
    const store = freshStore();
    store.upsert('users', {
      id: 'usr-admin',
      email: 'admin@aquazero.fit',
      emailVerified: true,
      role: 'admin',
      tier: 'premium',
      displayName: 'AquaZero Admin',
      createdAt: new Date().toISOString(),
      deletionRequestedAt: null,
    } satisfies User);
    store.upsert('users', { id: 'cred-usr-admin', type: 'credentials', userId: 'usr-admin' });
    await seedIfNeeded(store);

    expect(adminOf(store)?.email).toBe('admin@aquazero.fit');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('usr-admin'));
  });
});

describe('admin seeding in development', () => {
  it('keeps the local default when ADMIN_EMAIL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_EMAIL', '');
    const store = freshStore();
    await seedIfNeeded(store);

    expect(adminOf(store)).toMatchObject({ email: 'admin@aquazero.fit', role: 'admin' });
    expect(store.byId<User>('users', 'usr-demo')).toBeTruthy();
  });

  it('awaits in-flight background seeding on getStore().flush() before teardown', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-admin-seed-'));
    dirs.push(dir);
    vi.stubEnv('AZF_DATA_DIR', dir);
    resetStoreSingletonForTests();

    const store = getStore();
    await store.flush();

    expect(store.byId('users', 'cred-usr-demo')).toBeTruthy();
    expect(store.byId('users', 'cred-usr-admin')).toBeTruthy();
  });
});
