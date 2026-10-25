/**
 * REGRESSION GUARD — a write that lands after a suite's teardown never
 * reaches the deleted data directory.
 *
 * getStore() starts seeding without awaiting it, and seeding writes the demo
 * credentials only once a bcrypt hash in a worker comes back. In a short suite
 * that is after afterAll has flushed and removed the directory, so the
 * coalesced flush failed with ENOENT and logged `[store] flush failed`. When
 * that log reached Vitest while the worker was closing its RPC channel it
 * became an EnvironmentTeardownError, and `vitest run` exited 1 with every
 * test passing. Teardown now closes the store, which persists what is pending
 * and then persists nothing more.
 */
import fs from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { JsonStore, getStore } from '../platform/store';
import {
  bindIsolatedDataDir,
  createIsolatedDataDir,
  teardownIsolatedDataDir,
} from './helpers/integrationIsolation';

const nextMacrotask = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.restoreAllMocks();
});

it('drops a seed write that lands after teardown instead of persisting it', async () => {
  const savedAzfDataDir = process.env.AZF_DATA_DIR;
  const dataDir = createIsolatedDataDir('azf-store-teardown-');
  bindIsolatedDataDir(dataDir); // seeding starts; the password hash is in flight
  const store = getStore();
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

  await teardownIsolatedDataDir(dataDir, savedAzfDataDir);

  // Demo history is the last thing seeding writes, after the hash comes back.
  await vi.waitFor(() => expect(store.count('logs')).toBeGreaterThan(0), { timeout: 10_000 });
  await nextMacrotask(); // the coalesced flush that write scheduled
  await store.flush();

  expect(errors).not.toHaveBeenCalled();
  expect(fs.existsSync(dataDir)).toBe(false);
});

it('persists what was written before close() and nothing after it', async () => {
  const dataDir = createIsolatedDataDir('azf-store-close-');
  const store = new JsonStore(dataDir);
  store.upsert('users', { id: 'before' }); // still waiting on the coalescing timer

  await store.close();
  store.upsert('users', { id: 'after' });
  await nextMacrotask();
  await store.flush();

  expect(store.byId('users', 'after')).toBeDefined();
  expect(new JsonStore(dataDir).all('users').map((doc) => doc.id)).toEqual(['before']);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
