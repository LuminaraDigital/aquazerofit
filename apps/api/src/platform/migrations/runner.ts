/**
 * Forward-only migrations for the `engage` schema (AZF-P1 §4.1).
 *
 * Files in this directory named `NNNN_name.sql` are applied in order at boot,
 * once each, recorded in engage.schema_migrations. Everything pending runs in
 * ONE transaction under a transaction-scoped advisory lock:
 *
 *  - the lock serialises two processes booting at once (a rolling deploy), and
 *    because it is transaction-scoped it is released by COMMIT or ROLLBACK on
 *    the same connection, with nothing to leak if the process dies;
 *  - Postgres DDL is transactional, so a migration that fails part-way leaves
 *    the schema exactly as it was rather than half-built.
 *
 * There was no runner before this: the document store creates its one table
 * with IF NOT EXISTS at hydrate. This one keeps that "at boot" shape but
 * records versions, because relational tables change over time and a table
 * definition cannot be re-run as if it were new.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqlDatabase } from '../sql';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS_DIR = path.dirname(fileURLToPath(import.meta.url));

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/**
 * Every migration on disk, ascending. Refuses a gap or a duplicate number:
 * either means two branches each added "the next" migration, and applying
 * them in whatever order the filesystem lists them would be a guess.
 */
export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const migrations = fs
    .readdirSync(dir)
    .map((file) => ({ file, match: FILE_PATTERN.exec(file) }))
    .filter((entry): entry is { file: string; match: RegExpExecArray } => entry.match !== null)
    .map(({ file, match }) => ({
      version: Number(match[1]),
      name: match[2]!,
      sql: fs.readFileSync(path.join(dir, file), 'utf8'),
    }))
    .sort((a, b) => a.version - b.version);
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `engage migrations must be numbered 0001 upwards with no gaps; found ${String(
          migration.version,
        ).padStart(4, '0')} at position ${index + 1}`,
      );
    }
  });
  return migrations;
}

/** Arbitrary but fixed: every process must contend for the same lock. */
const LOCK_KEY = 'aquazerofit.engage.migrations';

/**
 * Apply every pending migration. Returns the versions applied by this call,
 * empty when the schema was already current (the normal boot).
 */
export async function runMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[] = loadMigrations(),
): Promise<number[]> {
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_KEY]);
    await tx.query('CREATE SCHEMA IF NOT EXISTS engage');
    await tx.query(
      `CREATE TABLE IF NOT EXISTS engage.schema_migrations (
        version     INTEGER PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    );
    const { rows } = await tx.query<{ version: number }>(
      'SELECT version FROM engage.schema_migrations',
    );
    const applied = new Set(rows.map((row) => Number(row.version)));
    const known = new Set(migrations.map((m) => m.version));
    const unknown = [...applied].filter((version) => !known.has(version));
    if (unknown.length > 0) {
      // A database ahead of this code: a rollback to an older image. Its
      // tables are a superset of what this code expects, so keep serving.
      // eslint-disable-next-line no-console
      console.warn(
        `[engage] database has migration(s) ${unknown.join(', ')} this build does not know; ` +
          'continuing with the schema as it is.',
      );
    }

    const done: number[] = [];
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      for (const statement of splitStatements(migration.sql)) await tx.query(statement);
      await tx.query('INSERT INTO engage.schema_migrations (version) VALUES ($1)', [
        migration.version,
      ]);
      done.push(migration.version);
    }
    if (done.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[engage] applied migration(s) ${done.join(', ')}`);
    }
    return done;
  });
}

/**
 * Split a migration file into statements so each runs as one parameterless
 * query on the transaction's connection. Comment lines are dropped first.
 * Migrations are plain DDL written in this repository, never user input, and
 * must not use semicolons inside literals or dollar-quoted bodies; the
 * migration test fails if a file would split into anything that is not a
 * statement.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
