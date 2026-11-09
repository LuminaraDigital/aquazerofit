/**
 * The engage migration runner and the privacy coverage of every table it
 * creates (AZF-P1 §4.1).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  MIGRATIONS_DIR,
  checksumOf,
  loadMigrations,
  runMigrations,
  splitStatements,
} from '../platform/migrations/runner';
import { ENGAGE_TABLE_PRIVACY } from '../modules/fightCamp/repo/types';
import { pgliteSql as liteDatabase } from './helpers/engageDatabases';

// Each case boots PGlite, a WebAssembly Postgres: about a second on a laptop
// and five or more on a shared CI runner, past Vitest's 5 s default.
vi.setConfig({ testTimeout: 30_000 });

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

function migrationDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-migrations-'));
  scratch.push(dir);
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

describe('loadMigrations', () => {
  it('loads the shipped migrations in order, numbered from 0001', () => {
    const migrations = loadMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations.map((m) => m.version)).toEqual(migrations.map((_, i) => i + 1));
    expect(migrations[0]!.name).toBe('engage_init');
  });

  it('refuses a gap in the numbering', () => {
    const dir = migrationDir({ '0001_a.sql': 'SELECT 1;', '0003_c.sql': 'SELECT 1;' });
    expect(() => loadMigrations(dir)).toThrow(/no gaps/);
  });

  it('ignores files that are not migrations', () => {
    const dir = migrationDir({ '0001_a.sql': 'SELECT 1;', 'README.md': '#', 'runner.ts': '' });
    expect(loadMigrations(dir).map((m) => m.name)).toEqual(['a']);
  });
});

describe('splitStatements', () => {
  it('drops comment lines and empty statements', () => {
    expect(splitStatements('-- header; with a semicolon\nCREATE TABLE a (x int);\n\n;  \nSELECT 1;')).toEqual([
      'CREATE TABLE a (x int)',
      'SELECT 1',
    ]);
  });

  it('splits every shipped migration into whole statements only', () => {
    for (const migration of loadMigrations()) {
      for (const statement of splitStatements(migration.sql)) {
        expect(statement).toMatch(/^(CREATE|ALTER|DROP|INSERT|UPDATE|COMMENT)\b/);
      }
    }
  });
});

describe('runMigrations', () => {
  it('applies each migration once and is a no-op on the next boot', async () => {
    const lite = new PGlite();
    try {
      const db = liteDatabase(lite);
      const all = loadMigrations().map((m) => m.version);
      expect(await runMigrations(db)).toEqual(all);
      expect(await runMigrations(db)).toEqual([]);
      const { rows } = await db.query<{ version: number }>(
        'SELECT version FROM engage.schema_migrations ORDER BY version',
      );
      expect(rows.map((r) => r.version)).toEqual(all);
    } finally {
      await lite.close();
    }
  });

  it('rolls a failing migration back whole, recording nothing', async () => {
    const lite = new PGlite();
    try {
      const db = liteDatabase(lite);
      const broken = [
        { version: 1, name: 'ok', sql: 'CREATE TABLE engage.kept_out (x int);' },
        { version: 2, name: 'bad', sql: 'CREATE TABLE engage.also_out (x int); SELECT * FROM nowhere;' },
      ];
      await expect(runMigrations(db, broken)).rejects.toThrow();
      const { rows } = await db.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'engage'`,
      );
      expect(rows).toEqual([]);
    } finally {
      await lite.close();
    }
  });

  it('runs no DDL and takes no lock when the schema is already current', async () => {
    const lite = new PGlite();
    try {
      const db = liteDatabase(lite);
      await runMigrations(db);
      const statements: string[] = [];
      const watched = {
        query: (text: string, values?: unknown[]) => {
          statements.push(text);
          return db.query(text, values);
        },
        transaction: db.transaction,
      } as typeof db;
      expect(await runMigrations(watched)).toEqual([]);
      expect(statements.join('\n')).not.toMatch(/CREATE|advisory/i);
    } finally {
      await lite.close();
    }
  });

  it('records a checksum per migration and warns when a shipped one is edited', async () => {
    const lite = new PGlite();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const db = liteDatabase(lite);
      const original = [{ version: 1, name: 'a', sql: 'CREATE TABLE engage.a (x int);' }];
      await runMigrations(db, original);
      const { rows } = await db.query<{ checksum: string }>('SELECT checksum FROM engage.schema_migrations');
      expect(rows[0]!.checksum).toBe(checksumOf(original[0]!));
      expect(warn).not.toHaveBeenCalled();
      await runMigrations(db, [{ ...original[0]!, sql: 'CREATE TABLE engage.a (x bigint);' }]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('changed after they were applied'));
      expect(checksumOf({ sql: 'a;\r\nb;' })).toBe(checksumOf({ sql: 'a;\nb;' }));
    } finally {
      warn.mockRestore();
      await lite.close();
    }
  });

  it('keeps serving when the database is ahead of this build', async () => {
    const lite = new PGlite();
    try {
      const db = liteDatabase(lite);
      await runMigrations(db, [{ version: 1, name: 'a', sql: 'CREATE TABLE engage.a (x int);' }]);
      await db.query('INSERT INTO engage.schema_migrations (version) VALUES (2)');
      await expect(
        runMigrations(db, [{ version: 1, name: 'a', sql: 'CREATE TABLE engage.a (x int);' }]),
      ).resolves.toEqual([]);
    } finally {
      await lite.close();
    }
  });
});

describe('privacy coverage of the engage schema', () => {
  /** Every `CREATE TABLE engage.<name>` across the shipped migrations. */
  function tablesInMigrations(): string[] {
    const names = new Set<string>(['schema_migrations']);
    for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?engage\.([a-z_]+)/g)) {
        names.add(match[1]!);
      }
    }
    return [...names].sort();
  }

  it('names every table, so a new one cannot skip export and erasure', () => {
    expect(Object.keys(ENGAGE_TABLE_PRIVACY).sort()).toEqual(tablesInMigrations());
  });

  it('gives every table that holds user data an export key and an erasure rule', () => {
    for (const [table, policy] of Object.entries(ENGAGE_TABLE_PRIVACY)) {
      if (!policy.userData) continue;
      expect(policy.exportedAs, table).toBeTruthy();
      expect(policy.erasure, table).toBeTruthy();
    }
  });

  it('matches the tables a migrated database actually has', async () => {
    const lite = new PGlite();
    try {
      const db = liteDatabase(lite);
      await runMigrations(db);
      const { rows } = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'engage' ORDER BY table_name`,
      );
      expect(rows.map((r) => r.table_name)).toEqual(tablesInMigrations());
    } finally {
      await lite.close();
    }
  });
});
