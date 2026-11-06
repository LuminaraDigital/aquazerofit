/**
 * Real Postgres for the engage contract suite, with no server to install.
 *
 * PGlite is Postgres compiled to WebAssembly: the same parser, planner,
 * constraint checks and error codes as the managed database, in-process.
 * That is what lets the suite prove the SQL itself (partial unique indexes,
 * row locks, ON CONFLICT targets, DATE handling) on every run, rather than
 * only on machines that happen to have a database.
 *
 * Set ENGAGE_TEST_DATABASE_URL to also run against a real server (CI's
 * Postgres service does). That database's `engage` schema is dropped first,
 * so never point it at anything but a disposable test database.
 */
import { PGlite } from '@electric-sql/pglite';
import { runMigrations } from '../../platform/migrations/runner';
import { poolDatabase, type SqlDatabase, type SqlRunner } from '../../platform/sql';

export interface TestDatabase {
  name: string;
  db: SqlDatabase;
  close(): Promise<void>;
}

function pgliteRunner(client: Pick<PGlite, 'query'>): SqlRunner {
  return {
    query: async <R>(text: string, values?: unknown[]) => {
      const result = await client.query<R>(text, values as unknown[] | undefined);
      return { rows: result.rows };
    },
  };
}

/** A PGlite instance as the SqlDatabase the repository and runner expect. */
export function pgliteSql(lite: PGlite): SqlDatabase {
  return {
    ...pgliteRunner(lite),
    transaction: (fn) => lite.transaction((tx) => fn(pgliteRunner(tx))),
  };
}

export async function pgliteDatabase(): Promise<TestDatabase> {
  const lite = new PGlite();
  const db = pgliteSql(lite);
  await runMigrations(db);
  return { name: 'pglite', db, close: () => lite.close() };
}

export async function serverDatabase(url: string): Promise<TestDatabase> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 3 });
  await pool.query('DROP SCHEMA IF EXISTS engage CASCADE');
  const db = poolDatabase(pool);
  await runMigrations(db);
  return { name: 'postgres', db, close: () => pool.end() };
}
