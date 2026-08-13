/**
 * PostgresStore: durable backing for the in-memory document store.
 *
 * WHY THIS EXISTS. Replit's published apps do not have a persistent
 * filesystem — it "resets every time you publish". JsonStore's per-container
 * files therefore vanish on every deploy, taking users, health logs, chat and
 * AI memory with them. Replit injects DATABASE_URL for its managed Postgres,
 * so the same working set is mirrored into a single `documents` table instead.
 *
 * WHAT THIS DOES NOT ACHIEVE — read before scaling the deployment:
 *
 *   This gives durable persistence for a SINGLE instance. It does NOT make the
 *   app multi-instance / Autoscale safe. Every instance hydrates its own
 *   in-memory copy at boot and never re-reads; a write on instance A is
 *   invisible to instance B until B restarts, and last-writer-wins at the row
 *   level will silently drop the other instance's version of a document. Run
 *   this on a single Reserved VM (or max-instances=1), or finish the async
 *   getStore() refactor and read through to Postgres before scaling out.
 *
 * Driver: the plain `pg` package, not @neondatabase/serverless — Replit
 * migrated its managed database off Neon, so the serverless HTTP driver is the
 * wrong client for it now. The pool is deliberately small (max 5): a single
 * app instance flushes writes through one serialized queue and never needs
 * more, and Replit's database has a modest connection cap.
 */
import type { Pool } from 'pg';
import {
  CONTAINERS,
  MemoryBackedStore,
  type ContainerDelta,
  type ContainerName,
  type StoredDoc,
} from './store';
import type { RefreshTokenRecord } from './auth';

/**
 * Minimal slice of `pg.Pool` the store actually uses. Narrowing it here is
 * what lets the tests exercise dirty tracking and SQL building against a fake
 * executor, with no database anywhere near the suite.
 */
export interface QueryExecutor {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface SqlStatement {
  text: string;
  values: unknown[];
}

/**
 * One table for every container: the store's contract is "opaque JSON document
 * addressed by (container, id)", and modelling that as one relational table per
 * document type would be a schema migration project for no read-path benefit,
 * since all querying happens in memory.
 */
export const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS documents (
  container   TEXT NOT NULL,
  id          TEXT NOT NULL,
  doc         JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (container, id)
);`;

/**
 * Rows per INSERT. Postgres caps a statement at 65535 bind parameters and we
 * bind two per row, so the ceiling is ~32k; 500 keeps individual statements
 * small enough that one oversized document cannot blow up a whole batch.
 */
export const UPSERT_CHUNK_SIZE = 500;

/**
 * Multi-row upsert. The container is bound once ($1) and each row contributes
 * (id, doc), so a chunk of N rows uses 2N+1 parameters.
 */
export function buildUpsert(container: ContainerName, docs: readonly StoredDoc[]): SqlStatement {
  const values: unknown[] = [container];
  const tuples = docs.map((doc) => {
    values.push(doc.id, JSON.stringify(doc));
    return `($1, $${values.length - 1}, $${values.length}::jsonb, now())`;
  });
  return {
    text:
      `INSERT INTO documents (container, id, doc, updated_at) VALUES ${tuples.join(', ')} ` +
      `ON CONFLICT (container, id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
    values,
  };
}

/** Batched delete: one statement per container, ids passed as a text[]. */
export function buildDelete(container: ContainerName, ids: readonly string[]): SqlStatement {
  return {
    text: 'DELETE FROM documents WHERE container = $1 AND id = ANY($2::text[])',
    values: [container, [...ids]],
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const KNOWN_CONTAINERS = new Set<string>(CONTAINERS);

interface DocumentRow {
  container: string;
  id: string;
  doc: StoredDoc;
}

export class PostgresStore extends MemoryBackedStore {
  private readonly exec: QueryExecutor;
  private readonly pool: Pool | null;
  private hydrated = false;

  /**
   * `executor` is whatever runs the SQL — a real pool in production, a fake in
   * the tests. `pool` is passed only when this instance owns it and must close
   * it on shutdown.
   */
  constructor(dataDir: string, executor: QueryExecutor, pool: Pool | null = null) {
    super(dataDir);
    this.exec = executor;
    this.pool = pool;
  }

  /**
   * Open a pool against `connectionString`. `pg` is imported here rather than
   * at module scope so the driver is only ever loaded by a process that has a
   * database — the file-backed dev/test path never reaches this module.
   */
  static async connect(connectionString: string, dataDir: string): Promise<PostgresStore> {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString, max: 5 });
    return new PostgresStore(dataDir, pool, pool);
  }

  /**
   * Create the table if absent and load the whole corpus into memory. Must be
   * awaited before the first getStore() — see initStore() in ./store.
   */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    await this.exec.query(CREATE_TABLE_SQL);
    const { rows } = await this.exec.query('SELECT container, id, doc FROM documents');

    const byContainer = new Map<ContainerName, StoredDoc[]>();
    let skipped = 0;
    for (const raw of rows as DocumentRow[]) {
      // Containers are retired by deleting the constant, not the rows: keep the
      // data, ignore it, rather than crash the boot on an unknown name.
      if (!KNOWN_CONTAINERS.has(raw.container)) {
        skipped += 1;
        continue;
      }
      const name = raw.container as ContainerName;
      let bucket = byContainer.get(name);
      if (!bucket) byContainer.set(name, (bucket = []));
      // The primary key is authoritative if a doc was ever written without one.
      bucket.push(raw.doc?.id ? raw.doc : { ...raw.doc, id: raw.id });
    }
    for (const [name, docs] of byContainer) this.hydrateContainer(name, docs);

    this.hydrated = true;
    // eslint-disable-next-line no-console
    console.log(
      `[store] hydrated ${rows.length - skipped} document(s) from Postgres` +
        (skipped > 0 ? ` (${skipped} in unknown containers ignored)` : ''),
    );
  }

  async persist(batch: ReadonlyMap<ContainerName, ContainerDelta>): Promise<void> {
    for (const [name, delta] of batch) {
      if (delta.deleted.size > 0) {
        const stmt = buildDelete(name, [...delta.deleted]);
        await this.exec.query(stmt.text, stmt.values);
      }
      if (delta.changed.size === 0) continue;

      // Read the document out of memory at flush time, not at write time: many
      // writes to the same id inside one macrotask collapse into a single row.
      // An id that was written and then removed after the batch was snapshotted
      // is simply gone from memory — its delete rides the next batch.
      const docs = [...delta.changed]
        .map((id) => this.byId<StoredDoc>(name, id))
        .filter((doc): doc is StoredDoc => doc !== undefined);

      for (const part of chunk(docs, UPSERT_CHUNK_SIZE)) {
        const stmt = buildUpsert(name, part);
        await this.exec.query(stmt.text, stmt.values);
      }
    }
  }

  /** Drain pending writes and release the pool (graceful shutdown). */
  async close(): Promise<void> {
    await this.flush();
    await this.pool?.end();
  }

  /**
   * Atomic compare-and-swap for refresh token rotation (PostgreSQL implementation).
   * Uses UPDATE ... WHERE usedAt IS NULL AND revokedAt IS NULL with RETURNING
   * to atomically mark the token as used only if still valid.
   */
  async compareAndSwapRefreshToken(
    tokenId: string,
    tokenHash: string,
    usedAt: string
  ): Promise<RefreshTokenRecord | undefined> {
    const stmt = {
      text: `
        UPDATE documents
        SET doc = jsonb_set(doc, '{usedAt}', $3::jsonb, true), updated_at = now()
        WHERE container = $1 AND id = $2
          AND (doc->>'usedAt') IS NULL
          AND (doc->>'revokedAt') IS NULL
        RETURNING doc
      `,
      values: ['users', tokenId, JSON.stringify(usedAt)],
    };
    const result = await this.exec.query(stmt.text, stmt.values);
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0] as { doc: RefreshTokenRecord };
    // Hydrate the updated document into memory
    const updated = row.doc;
    this.container('users').set(tokenId, updated);
    return updated;
  }
}
