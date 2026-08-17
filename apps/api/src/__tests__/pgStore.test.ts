/**
 * PostgresStore unit tests.
 *
 * No database anywhere: PostgresStore takes an injected QueryExecutor, so the
 * suite asserts on the exact SQL and bind parameters it would have sent. That
 * is deliberate — the store is only durable if the dirty tracking is per
 * document id (a per-container rewrite would push all ~995 `content` rows on
 * every meal log) and if the batched statements are shaped correctly.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  PostgresStore,
  buildDelete,
  buildUpsert,
  CREATE_TABLE_SQL,
  UPSERT_CHUNK_SIZE,
  isLoopbackConnectionString,
  isSecureConnectionString,
  type QueryExecutor,
} from '../platform/pgStore';
import type { StoredDoc } from '../platform/store';

interface Call {
  text: string;
  values: unknown[];
}

/** Records every statement; returns canned rows for the hydration SELECT. */
class FakeExecutor implements QueryExecutor {
  readonly calls: Call[] = [];
  rows: unknown[] = [];

  async query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> {
    this.calls.push({ text, values: values ?? [] });
    return { rows: text.startsWith('SELECT') ? this.rows : [] };
  }

  /** Statements that touched `documents`, minus the schema/hydration boot pair. */
  get writes(): Call[] {
    return this.calls.filter((c) => c.text.startsWith('INSERT') || c.text.startsWith('DELETE'));
  }
}

let dataDir: string;
let exec: FakeExecutor;

function newStore(): PostgresStore {
  return new PostgresStore(dataDir, exec);
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-pgstore-'));
  exec = new FakeExecutor();
});

describe('SQL builders', () => {
  it('binds the container once and two parameters per row', () => {
    const stmt = buildUpsert('logs', [{ id: 'a' }, { id: 'b' }]);
    expect(stmt.text).toContain('INSERT INTO documents (container, id, doc, updated_at)');
    expect(stmt.text).toContain('($1, $2, $3::jsonb, now()), ($1, $4, $5::jsonb, now())');
    expect(stmt.text).toContain(
      'ON CONFLICT (container, id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()',
    );
    expect(stmt.values).toEqual(['logs', 'a', '{"id":"a"}', 'b', '{"id":"b"}']);
  });

  it('serialises the whole document into the jsonb parameter', () => {
    const stmt = buildUpsert('users', [{ id: 'u1', email: 'a@b.c' } as StoredDoc]);
    expect(JSON.parse(stmt.values[2] as string)).toEqual({ id: 'u1', email: 'a@b.c' });
  });

  it('deletes a whole id set in one statement', () => {
    const stmt = buildDelete('logs', ['x', 'y', 'z']);
    expect(stmt.text).toBe('DELETE FROM documents WHERE container = $1 AND id = ANY($2::text[])');
    expect(stmt.values).toEqual(['logs', ['x', 'y', 'z']]);
  });
});

describe('hydrate', () => {
  it('creates the table idempotently and loads rows into memory', async () => {
    exec.rows = [
      { container: 'users', id: 'u1', doc: { id: 'u1', email: 'a@b.c' } },
      { container: 'logs', id: 'l1', doc: { id: 'l1', kind: 'water' } },
      { container: 'logs', id: 'l2', doc: { id: 'l2', kind: 'meal' } },
    ];
    const store = newStore();
    await store.hydrate();

    expect(exec.calls[0]!.text).toBe(CREATE_TABLE_SQL);
    expect(exec.calls[0]!.text).toContain('CREATE TABLE IF NOT EXISTS documents');
    expect(exec.calls[1]!.text).toBe('SELECT container, id, doc FROM documents');
    expect(store.count('users')).toBe(1);
    expect(store.count('logs')).toBe(2);
    expect(store.byId('users', 'u1')).toEqual({ id: 'u1', email: 'a@b.c' });
    // Hydration is not a write: nothing should be queued back to the database.
    expect(exec.writes).toHaveLength(0);
  });

  it('ignores rows in containers the app no longer knows about', async () => {
    exec.rows = [
      { container: 'users', id: 'u1', doc: { id: 'u1' } },
      { container: 'retiredContainer', id: 'r1', doc: { id: 'r1' } },
    ];
    const store = newStore();
    await expect(store.hydrate()).resolves.toBeUndefined();
    expect(store.count('users')).toBe(1);
  });

  it('is idempotent', async () => {
    const store = newStore();
    await store.hydrate();
    await store.hydrate();
    expect(exec.calls).toHaveLength(2);
  });
});

describe('dirty tracking', () => {
  it('flushes only the documents that changed, not the whole container', async () => {
    exec.rows = Array.from({ length: 50 }, (_, i) => ({
      container: 'content',
      id: `c${i}`,
      doc: { id: `c${i}` },
    }));
    const store = newStore();
    await store.hydrate();

    store.upsert('content', { id: 'c7', name: 'edited' } as StoredDoc);
    await store.flush();

    expect(exec.writes).toHaveLength(1);
    expect(exec.writes[0]!.values).toEqual(['content', 'c7', '{"id":"c7","name":"edited"}']);
    expect(store.count('content')).toBe(50);
  });

  it('coalesces repeated writes to one id into a single row', async () => {
    const store = newStore();
    await store.hydrate();

    store.upsert('logs', { id: 'l1', v: 1 } as StoredDoc);
    store.upsert('logs', { id: 'l1', v: 2 } as StoredDoc);
    store.upsert('logs', { id: 'l1', v: 3 } as StoredDoc);
    await store.flush();

    expect(exec.writes).toHaveLength(1);
    // Latest value wins: the doc is read out of memory at flush time.
    expect(exec.writes[0]!.values).toEqual(['logs', 'l1', '{"id":"l1","v":3}']);
  });

  it('batches many changed ids into one INSERT per container', async () => {
    const store = newStore();
    await store.hydrate();

    store.upsert('logs', { id: 'l1' });
    store.upsert('logs', { id: 'l2' });
    store.upsert('users', { id: 'u1' });
    await store.flush();

    expect(exec.writes).toHaveLength(2);
    const logs = exec.writes.find((c) => c.values[0] === 'logs')!;
    expect(logs.values).toEqual(['logs', 'l1', '{"id":"l1"}', 'l2', '{"id":"l2"}']);
    expect(exec.writes.find((c) => c.values[0] === 'users')!.values).toEqual([
      'users',
      'u1',
      '{"id":"u1"}',
    ]);
  });

  it('chunks oversized upserts to stay under the bind-parameter cap', async () => {
    const store = newStore();
    await store.hydrate();

    const total = UPSERT_CHUNK_SIZE + 10;
    for (let i = 0; i < total; i += 1) store.upsert('content', { id: `c${i}` });
    await store.flush();

    const inserts = exec.writes.filter((c) => c.text.startsWith('INSERT'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0]!.values).toHaveLength(UPSERT_CHUNK_SIZE * 2 + 1);
    expect(inserts[1]!.values).toHaveLength(10 * 2 + 1);
  });

  it('emits one batched DELETE for removed ids', async () => {
    exec.rows = [
      { container: 'logs', id: 'l1', doc: { id: 'l1' } },
      { container: 'logs', id: 'l2', doc: { id: 'l2' } },
      { container: 'logs', id: 'l3', doc: { id: 'l3' } },
    ];
    const store = newStore();
    await store.hydrate();

    store.delete('logs', 'l1');
    store.deleteWhere('logs', (d: StoredDoc) => d.id === 'l3');
    await store.flush();

    expect(exec.writes).toHaveLength(1);
    expect(exec.writes[0]!.text).toContain('DELETE FROM documents');
    expect(exec.writes[0]!.values[0]).toBe('logs');
    expect(exec.writes[0]!.values[1]).toEqual(['l1', 'l3']);
  });

  it('does not mark anything dirty when a delete removes nothing', async () => {
    const store = newStore();
    await store.hydrate();

    expect(store.delete('logs', 'missing')).toBe(false);
    await store.flush();
    expect(exec.writes).toHaveLength(0);
  });

  it('resolves write-then-delete of one id to a delete only', async () => {
    const store = newStore();
    await store.hydrate();

    store.upsert('logs', { id: 'l1' });
    store.delete('logs', 'l1');
    await store.flush();

    expect(exec.writes).toHaveLength(1);
    expect(exec.writes[0]!.text).toContain('DELETE FROM documents');
    expect(exec.writes[0]!.values[1]).toEqual(['l1']);
  });

  it('resolves delete-then-rewrite of one id to an upsert only', async () => {
    exec.rows = [{ container: 'logs', id: 'l1', doc: { id: 'l1', v: 1 } }];
    const store = newStore();
    await store.hydrate();

    store.delete('logs', 'l1');
    store.upsert('logs', { id: 'l1', v: 2 } as StoredDoc);
    await store.flush();

    expect(exec.writes).toHaveLength(1);
    expect(exec.writes[0]!.text).toContain('INSERT INTO documents');
    expect(exec.writes[0]!.values).toEqual(['logs', 'l1', '{"id":"l1","v":2}']);
  });

  it('clears the dirty set so a second flush is a no-op', async () => {
    const store = newStore();
    await store.hydrate();

    store.upsert('logs', { id: 'l1' });
    await store.flush();
    await store.flush();

    expect(exec.writes).toHaveLength(1);
  });

  it('flush() awaits writes queued in the same tick, before the coalescing timer', async () => {
    const store = newStore();
    await store.hydrate();

    // No setImmediate has fired yet — flush() must still drain this write,
    // which is what the SIGTERM handler in index.ts relies on.
    store.upsert('logs', { id: 'l1' });
    await store.flush();

    expect(exec.writes).toHaveLength(1);
  });
});

describe('compareAndSwapRefreshToken', () => {
  const tokenDoc = {
    id: 'rt-1',
    type: 'refreshToken',
    tokenHash: 'hash-abc',
    userId: 'u1',
    familyId: 'fam-1',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    usedAt: null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
  };

  /** Fake executor that emulates the UPDATE...WHERE row-lock semantics. */
  class CasExecutor implements QueryExecutor {
    private readonly docs = new Map<string, Record<string, unknown>>();
    readonly updates: Call[] = [];

    seed(id: string, doc: Record<string, unknown>): void {
      this.docs.set(id, { ...doc });
    }

    async query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> {
      if (text.includes('UPDATE documents')) {
        this.updates.push({ text, values: values ?? [] });
        const [, id, tokenHash] = values as [string, string, string, string];
        const usedAtJson = (values as unknown[])[3] as string;
        const row = this.docs.get(id);
        // Mirror the WHERE clause: no row matched when the hash differs or
        // the token is already consumed/revoked — that is the loser branch
        // a second concurrent UPDATE takes once the row lock is released.
        if (
          !row ||
          row['tokenHash'] !== tokenHash ||
          row['usedAt'] != null ||
          row['revokedAt'] != null
        ) {
          return { rows: [] };
        }
        row['usedAt'] = JSON.parse(usedAtJson);
        return { rows: [{ doc: { ...row } }] };
      }
      return { rows: [] };
    }
  }

  function casStore(): { store: PostgresStore; exec: CasExecutor } {
    const casExec = new CasExecutor();
    casExec.seed(tokenDoc.id, tokenDoc);
    return { store: new PostgresStore(dataDir, casExec), exec: casExec };
  }

  it('emits one atomic UPDATE guarded by id, hash, usedAt and revokedAt', async () => {
    const { store, exec: casExec } = casStore();
    const marked = await store.compareAndSwapRefreshToken(tokenDoc.id, 'hash-abc', '2026-08-17T00:00:00.000Z');

    expect(exec.writes).toHaveLength(0);
    const stmt = casExec.updates[0]!;
    expect(stmt.text).toContain('UPDATE documents');
    expect(stmt.text).toContain("doc->>'tokenHash' = $3");
    expect(stmt.text).toContain("(doc->>'usedAt') IS NULL");
    expect(stmt.text).toContain("(doc->>'revokedAt') IS NULL");
    expect(stmt.text).toContain('RETURNING doc');
    expect(stmt.values).toEqual(['users', tokenDoc.id, 'hash-abc', '"2026-08-17T00:00:00.000Z"']);
    expect(marked?.usedAt).toBe('2026-08-17T00:00:00.000Z');
    // The returned row is hydrated into memory so the next read sees usedAt.
    expect(store.byId('users', tokenDoc.id)).toMatchObject({ usedAt: '2026-08-17T00:00:00.000Z' });
  });

  it('rejects a wrong tokenHash even when the id matches', async () => {
    const { store } = casStore();
    await expect(
      store.compareAndSwapRefreshToken(tokenDoc.id, 'hash-WRONG', '2026-08-17T00:00:00.000Z'),
    ).resolves.toBeUndefined();
  });

  it('two concurrent rotations on one token: exactly one succeeds, loser gets undefined', async () => {
    const { store } = casStore();
    // Concurrent calls — the fake serializes on the emulated row lock, same
    // as Postgres serializes the second UPDATE behind the first's lock.
    const [first, second] = await Promise.all([
      store.compareAndSwapRefreshToken(tokenDoc.id, 'hash-abc', '2026-08-17T00:00:00.000Z'),
      store.compareAndSwapRefreshToken(tokenDoc.id, 'hash-abc', '2026-08-17T00:00:01.000Z'),
    ]);
    const outcomes = [first, second];
    expect(outcomes.filter((r) => r !== undefined)).toHaveLength(1);
    expect(outcomes.filter((r) => r === undefined)).toHaveLength(1);
  });

  it('a revoked token can never be consumed', async () => {
    const { store, exec: casExec } = casStore();
    const row = (casExec as unknown as { docs: Map<string, Record<string, unknown>> }).docs;
    row.get(tokenDoc.id)!['revokedAt'] = '2026-08-16T00:00:00.000Z';
    await expect(
      store.compareAndSwapRefreshToken(tokenDoc.id, 'hash-abc', '2026-08-17T00:00:00.000Z'),
    ).resolves.toBeUndefined();
  });
});

describe('connection string safety', () => {
  it('accepts loopback URLs without sslmode', () => {
    expect(isLoopbackConnectionString('postgres://u:p@localhost:5432/azf')).toBe(true);
    expect(isSecureConnectionString('postgres://u:p@127.0.0.1/azf')).toBe(true);
    expect(isSecureConnectionString('postgres://u:p@[::1]/azf')).toBe(true);
  });

  it('accepts off-host URLs that negotiate TLS', () => {
    expect(isSecureConnectionString('postgres://u:p@db.example.com/azf?sslmode=verify-full')).toBe(true);
    expect(isSecureConnectionString('postgres://u:p@db.example.com/azf?sslmode=require')).toBe(true);
    expect(isSecureConnectionString('postgres://u:p@db.example.com/azf?ssl=true')).toBe(true);
  });

  it('rejects off-host URLs that allow plaintext', () => {
    expect(isSecureConnectionString('postgres://u:p@db.example.com/azf')).toBe(false);
    expect(isSecureConnectionString('postgres://u:p@db.example.com/azf?sslmode=disable')).toBe(false);
    expect(isSecureConnectionString('postgres://u:p@db.example.com/azf?sslmode=prefer')).toBe(false);
    expect(isSecureConnectionString('postgres://u:p@db.example.com:5432/azf?sslmode=allow')).toBe(false);
  });

  it('rejects malformed URLs as insecure', () => {
    expect(isSecureConnectionString('not-a-url')).toBe(false);
  });

  it('connect() refuses an insecure off-host URL before touching the network', async () => {
    await expect(
      PostgresStore.connect('postgres://u:p@db.example.com/azf', dataDir),
    ).rejects.toThrow(/must use TLS/i);
  });
});
