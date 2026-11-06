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
 *
 * An up-to-date schema costs one read and no DDL, so an ordinary boot needs
 * no CREATE privilege on the database: a least-privilege runtime role can
 * serve once a deploy with the owner role has migrated.
 *
 * Rules for writing one (expand, then contract):
 *  - Never edit a migration that has shipped. Each file's checksum is
 *    recorded, and a boot that finds a different file says so.
 *  - Additive changes only while old code may still run against the new
 *    schema (a rollback, a rolling deploy): new tables, nullable columns or
 *    columns with defaults, new indexes. Drops, renames and NOT NULL without
 *    a default wait for a later release in which no running code reads or
 *    writes the old shape.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqlDatabase, SqlRunner } from '../sql';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Line endings normalised, so a Windows checkout records the same sum. */
export function checksumOf(migration: Pick<Migration, 'sql'>): string {
  return createHash('sha256').update(migration.sql.replace(/\r\n/g, '\n')).digest('hex');
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

type Applied = Map<number, string | null>;

/** Recorded versions and checksums, or null before the first migration. */
async function appliedMigrations(db: SqlRunner): Promise<Applied | null> {
  const { rows } = await db.query<{ present: string | null }>(
    `SELECT to_regclass('engage.schema_migrations')::text AS present`,
  );
  if (!rows[0]?.present) return null;
  const recorded = await db.query<{ version: number; checksum: string | null }>(
    'SELECT version, checksum FROM engage.schema_migrations',
  );
  return new Map(recorded.rows.map((row) => [Number(row.version), row.checksum]));
}

/**
 * Say, without stopping, when the database and this build disagree about
 * what has been applied. Neither is a reason to refuse traffic: a database
 * ahead of the code is a rollback (safe under the expand rule above), and an
 * edited migration has already run in its original form.
 */
function reportDrift(applied: Applied, migrations: readonly Migration[]): void {
  const known = new Map(migrations.map((m) => [m.version, checksumOf(m)]));
  const unknown = [...applied.keys()].filter((version) => !known.has(version));
  if (unknown.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[engage] database has migration(s) ${unknown.join(', ')} this build does not know; ` +
        'continuing with the schema as it is.',
    );
  }
  const edited = [...applied].filter(
    ([version, checksum]) => checksum !== null && known.has(version) && known.get(version) !== checksum,
  );
  if (edited.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[engage] migration(s) ${edited.map(([v]) => v).join(', ')} changed after they were applied; ` +
        'add a new migration instead of editing a shipped one.',
    );
  }
}

/**
 * Apply every pending migration. Returns the versions applied by this call,
 * empty when the schema was already current (the normal boot).
 */
export async function runMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[] = loadMigrations(),
): Promise<number[]> {
  const current = await appliedMigrations(db);
  if (current && migrations.every((m) => current.has(m.version))) {
    reportDrift(current, migrations);
    return [];
  }

  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_KEY]);
    await tx.query('CREATE SCHEMA IF NOT EXISTS engage');
    await tx.query(
      `CREATE TABLE IF NOT EXISTS engage.schema_migrations (
        version     INTEGER PRIMARY KEY,
        checksum    TEXT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    );
    // Re-read under the lock: another process may have migrated meanwhile.
    const applied = (await appliedMigrations(tx)) ?? new Map();
    reportDrift(applied, migrations);

    const done: number[] = [];
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      for (const statement of splitStatements(migration.sql)) await tx.query(statement);
      await tx.query('INSERT INTO engage.schema_migrations (version, checksum) VALUES ($1, $2)', [
        migration.version,
        checksumOf(migration),
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
