/**
 * Relational access for the `engage` schema (AZF-P1 §4.1).
 *
 * The document store keeps a whole working set in memory and is safe for one
 * instance only. Fight Camp data is cross-user and needs real unique
 * constraints (one cheer a day, one squad a season, one charge id), so it is
 * read and written straight through to Postgres instead, over the pool the
 * document store already opened. There is deliberately no second pool: the
 * managed database has a modest connection cap and max 5 is already sized for
 * this process.
 *
 * Without DATABASE_URL (tests, keyless local dev) there is no pool and
 * `sqlDatabase()` answers null; the Fight Camp repository then uses its
 * in-memory adapter, which keeps the "no keys needed" rule in AGENTS.md.
 */
import type { Pool, PoolClient } from 'pg';
import { getStore } from './store';

export interface SqlRunner {
  /** One parameterised statement. Never interpolate values into `text`. */
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

export interface SqlDatabase extends SqlRunner {
  /**
   * Run `fn` inside one transaction on one connection. Commits when `fn`
   * resolves, rolls back when it throws, and always returns the connection.
   */
  transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

function runnerOf(client: Pool | PoolClient): SqlRunner {
  return {
    query: async <R>(text: string, values?: unknown[]) => {
      const result = await client.query(text, values);
      return { rows: result.rows as R[] };
    },
  };
}

export function poolDatabase(pool: Pool): SqlDatabase {
  return {
    ...runnerOf(pool),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(runnerOf(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/**
 * The shared pool as a SqlDatabase, or null when the store is not Postgres.
 * Read structurally rather than with `instanceof PostgresStore`: importing
 * pgStore here closes an import cycle (store -> seed -> me/service -> Fight
 * Camp -> here) in which the store's base class is not yet defined.
 */
export function sqlDatabase(): SqlDatabase | null {
  const pool = (getStore() as { pool?: Pool | null }).pool;
  return pool ? poolDatabase(pool) : null;
}

/** Postgres SQLSTATE for a unique-constraint violation. */
export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === UNIQUE_VIOLATION;
}

/** A timestamp column as an ISO instant, whichever form the driver returned. */
export function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}
