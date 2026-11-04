/**
 * Which EngageRepo this process uses, decided once at boot (see ./types).
 *
 * Postgres when the document store is on Postgres (same pool), memory
 * otherwise. Under Postgres the schema must be migrated before the first
 * request, so index.ts awaits initEngage() right after initStore(); reaching
 * for the repository before that throws, for the same reason getStore()
 * does: an empty in-memory stand-in would look like a fresh database.
 */
import { config } from '../../../platform/config';
import { runMigrations } from '../../../platform/migrations/runner';
import { sqlDatabase } from '../../../platform/sql';
import { MemoryEngageRepo } from './memory';
import { PgEngageRepo } from './pg';
import type { EngageRepo } from './types';

let repo: EngageRepo | null = null;

export async function initEngage(): Promise<'postgres' | 'memory'> {
  const db = sqlDatabase();
  if (db) {
    await runMigrations(db);
    repo = new PgEngageRepo(db);
    return 'postgres';
  }
  repo = new MemoryEngageRepo();
  return 'memory';
}

export function engageRepo(): EngageRepo {
  if (repo) return repo;
  if (sqlDatabase()) {
    throw new Error('Fight Camp repository not initialised: await initEngage() after initStore().');
  }
  repo = new MemoryEngageRepo();
  return repo;
}

/** Test-only: swap in a specific adapter, or null to start from a fresh one. */
export function setEngageRepoForTests(next: EngageRepo | null): void {
  if (!config.isTest) throw new Error('setEngageRepoForTests is only available under test');
  repo = next;
}

export type * from './types';
export type * from './gifts';
