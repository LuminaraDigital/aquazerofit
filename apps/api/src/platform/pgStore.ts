/**
 * PostgresStore: durable backing for the in-memory document store.
 *
 * WHY THIS EXISTS. The managed host gives a deployed app no persistent
 * filesystem. It resets on every deploy. JsonStore's per-container
 * files therefore vanish on every deploy, taking users, health logs, chat and
 * AI memory with them. The host injects DATABASE_URL for its managed Postgres,
 * so the same working set is mirrored into a single `documents` table instead.
 *
 * WHAT THIS DOES NOT ACHIEVE. Read before scaling the deployment:
 *
 *   This gives durable persistence for a SINGLE instance. It does NOT make the
 *   app multi-instance / Autoscale safe. Every instance hydrates its own
 *   in-memory copy at boot and never re-reads; a write on instance A is
 *   invisible to instance B until B restarts, and last-writer-wins at the row
 *   level will silently drop the other instance's version of a document. Run
 *   this on a single Reserved VM (or max-instances=1), or finish the async
 *   getStore() refactor and read through to Postgres before scaling out.
 *   The one exception is refresh-token rotation: compareAndSwapRefreshToken
 *   executes a genuine atomic UPDATE against the database itself (not the
 *   local copy), so two instances rotating the same token concurrently still
 *   produce exactly one success. The loser sees zero rows and revokes the
 *   family. Session anti-theft is multi-instance safe; app data reads are not.
 *
 * Driver: the plain `pg` package, not @neondatabase/serverless. The host
 * migrated its managed database off Neon, so the serverless HTTP driver is the
 * wrong client for it now. The pool is deliberately small (max 5): a single
 * app instance flushes writes through one serialized queue and never needs
 * more, and the managed database has a modest connection cap.
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
 * One Stars purchase per Telegram charge id.
 *
 * The primary key is (container, id), and purchase ids are random, so two
 * webhook deliveries that both passed the in-memory check could insert two
 * rows and credit the coach twice. This partial unique index makes the second
 * insert fail. NULL charge ids (invoices, credit transactions, refunds) are
 * excluded, and Postgres treats those NULLs as distinct anyway.
 *
 * Created at hydrate, same as the table: there is no separate migration
 * runner. IF NOT EXISTS keeps a restart a no-op once the index exists.
 *
 * If historical duplicates are already stored, creating this index fails and
 * would stop the API from booting. hydrate() counts those groups first
 * (STARS_CHARGE_DUPLICATE_COUNT_SQL) and, when the count is above zero, skips
 * the index and logs only that count. The in-app idempotency guard still
 * refuses a second credit for a charge id this process has loaded.
 */
export const STARS_CHARGE_UNIQUE_INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS documents_stars_charge_uidx
  ON documents ((doc->>'telegramPaymentChargeId'))
  WHERE container = 'ledger'
    AND doc->>'type' = 'starsPurchase'
    AND COALESCE(doc->>'telegramPaymentChargeId', '') <> '';`;

/**
 * One Stars subscription charge per Telegram charge id.
 *
 * A separate partial index, not an edit of documents_stars_charge_uidx.
 * CREATE INDEX IF NOT EXISTS will not change an index that already exists,
 * and rebuilding the purchase index to cover a second type would fail boot
 * if historical purchase duplicates are already stored. This type has no
 * historical rows, so the index is created on every boot.
 */
export const STARS_SUBSCRIPTION_CHARGE_UNIQUE_INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS documents_stars_subscription_charge_uidx
  ON documents ((doc->>'telegramPaymentChargeId'))
  WHERE container = 'ledger'
    AND doc->>'type' = 'starsSubscriptionPayment'
    AND COALESCE(doc->>'telegramPaymentChargeId', '') <> '';`;

/**
 * How many Stars charge ids are stored more than once.
 *
 * The inner query groups inside Postgres and projects a constant, so the only
 * value that comes back to the process is the group count. Charge ids and
 * document bodies stay in the table.
 */
export const STARS_CHARGE_DUPLICATE_COUNT_SQL = `SELECT COUNT(*)::int AS duplicate_groups
FROM (
  SELECT 1
  FROM documents
  WHERE container = 'ledger'
    AND doc->>'type' = 'starsPurchase'
    AND COALESCE(doc->>'telegramPaymentChargeId', '') <> ''
  GROUP BY doc->>'telegramPaymentChargeId'
  HAVING COUNT(*) > 1
) duplicates`;

/** Reads the count query. A missing or non-numeric value counts as zero. */
export function starsChargeDuplicateCount(rows: readonly unknown[]): number {
  const first = rows[0];
  if (!first || typeof first !== 'object') return 0;
  const raw = (first as { duplicate_groups?: unknown }).duplicate_groups;
  const count = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

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

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Cloud SQL connector socket directory. Project, region, and instance are the
 * connection-name segments Google mounts at `/cloudsql/PROJECT:REGION:INSTANCE`.
 * Dots are excluded so `..` and arbitrary socket paths cannot match.
 */
const CLOUD_SQL_SOCKET =
  /^\/cloudsql\/[a-z][a-z0-9-]*:[a-z0-9-]+:[a-z][a-z0-9-]*$/;

/** True when the URL's host is this machine, where plaintext is acceptable. */
export function isLoopbackConnectionString(connectionString: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(connectionString).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * `host` query value, decoded once. Parsed from the query string alone because
 * `new URL` throws ERR_INVALID_URL on the official Cloud Run form
 * `postgres://user:pass@/db?host=/cloudsql/...` (empty host).
 */
function connectionQueryParam(connectionString: string, name: string): string | null {
  const queryStart = connectionString.indexOf('?');
  if (queryStart < 0) return null;
  const query = connectionString.slice(queryStart + 1).split('#')[0];
  return new URLSearchParams(query).get(name);
}

/** Cloud SQL unix-socket directory, or null when `host` is not that socket. */
export function cloudSqlSocketDirectory(connectionString: string): string | null {
  const host = connectionQueryParam(connectionString, 'host');
  if (!host || host.includes('..') || host.includes('\\') || host.includes('\0')) return null;
  return CLOUD_SQL_SOCKET.test(host) ? host : null;
}

/**
 * True when bytes never leave the machine: loopback TCP, or the Cloud SQL
 * connector socket. Both are local transports. A public IP is not.
 */
export function usesLocalDatabaseTransport(connectionString: string): boolean {
  return (
    isLoopbackConnectionString(connectionString) ||
    cloudSqlSocketDirectory(connectionString) !== null
  );
}

/**
 * `ssl` flag passed to `pg.Pool`. Undefined means the driver speaks plaintext,
 * which is correct for loopback and for a Cloud SQL unix socket (forcing TLS
 * on that socket fails the handshake). Remote hosts get `ssl: true` unless
 * the caller already opted out.
 */
export function databaseSslOption(
  connectionString: string,
  options: { ssl?: boolean; allowInsecureSsl?: boolean } = {},
): boolean | undefined {
  if (options.ssl !== undefined) return options.ssl;
  if (options.allowInsecureSsl || usesLocalDatabaseTransport(connectionString)) return undefined;
  return true;
}

/**
 * True when the URL targets a local transport or negotiates TLS with the
 * server. Remote URLs must carry an sslmode that is not `disable` /
 * `allow` / `prefer` (those all permit plaintext fallback), or `ssl=true`,
 * which managed offerings use when their certificates are not publicly
 * anchored and `verify-full` would fail validation.
 */
export function isSecureConnectionString(connectionString: string): boolean {
  if (usesLocalDatabaseTransport(connectionString)) return true;
  try {
    const params = new URL(connectionString).searchParams;
    const sslmode = params.get('sslmode')?.toLowerCase();
    if (sslmode) return !['disable', 'allow', 'prefer'].includes(sslmode);
    const ssl = params.get('ssl')?.toLowerCase();
    return ssl === 'true' || ssl === '1';
  } catch {
    return false;
  }
}

interface DocumentRow {
  container: string;
  id: string;
  doc: StoredDoc;
}

export class PostgresStore extends MemoryBackedStore {
  private readonly exec: QueryExecutor;
  /**
   * Public so platform/sql can run the Fight Camp `engage` schema over this
   * same pool rather than opening a second one against the connection cap.
   */
  readonly pool: Pool | null;
  private hydrated = false;

  /**
   * `executor` is whatever runs the SQL: a real pool in production, a fake in
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
   * database. The file-backed dev/test path never reaches this module.
   *
   * Pool shape is deliberately conservative: max 5 connections (one instance
   * flushes through a single serialized queue and never needs more, and
   * the managed database has a modest cap), idle clients reaped after 30s, and a
   * 15s statement timeout so a wedged query fails a request instead of
   * pinning a pooled connection forever.
   *
   * TLS is enforced at the connection-string level: a plain `postgres://` URL
   * to a remote host is accepted only when it carries an sslmode that
   * verifies (`verify-ca` / `verify-full`), or `ssl=true` for managed
   * offerings whose certs are not publicly anchored. A remote URL with no SSL
   * is rejected outright. Credentials and refresh tokens must never cross the
   * network in cleartext.
   *
   * The Cloud Run Cloud SQL connector is a unix socket
   * (`host=/cloudsql/PROJECT:REGION:INSTANCE`), including the empty-host form
   * `postgres://user:pass@/db?host=/cloudsql/...` that `new URL` cannot parse.
   * That socket is a local transport: plaintext on the socket is correct, and
   * `ssl: true` would break the handshake. A public IP is still remote.
   */
  static async connect(
    connectionString: string,
    dataDir: string,
    options: { ssl?: boolean; allowInsecureSsl?: boolean } = {},
  ): Promise<PostgresStore> {
    const secure = isSecureConnectionString(connectionString);
    if (!secure && !options.allowInsecureSsl) {
      throw new Error(
        'DATABASE_URL must use TLS for a remote host: use a postgres:// URL with ' +
          'sslmode=verify-full (or ssl=true for managed databases that require it). ' +
          'Plaintext is allowed only for localhost or a Cloud SQL unix socket ' +
          '(host=/cloudsql/PROJECT:REGION:INSTANCE).',
      );
    }
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      // `ssl: true` alone would skip certificate verification; the secure-url
      // check above is what makes a remote URL safe. Local transports
      // (loopback, Cloud SQL socket) leave `ssl` unset so the driver does not
      // attempt a TLS handshake on a socket that does not speak it.
      ssl: databaseSslOption(connectionString, options),
    });
    // Probe the pool now: pg connects lazily, so without this a bad URL or
    // unreachable server would surface only inside hydrate() as a bare driver
    // code, not as the actionable boot failure index.ts prints.
    const client = await pool.connect();
    client.release();
    return new PostgresStore(dataDir, pool, pool);
  }

  /**
   * Create the table if absent and load the whole corpus into memory. Must be
   * awaited before the first getStore(). See initStore() in ./store.
   */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    await this.exec.query(CREATE_TABLE_SQL);
    const counted = await this.exec.query(STARS_CHARGE_DUPLICATE_COUNT_SQL);
    const duplicateGroups = starsChargeDuplicateCount(counted.rows);
    if (duplicateGroups > 0) {
      // A unique index cannot be built over existing duplicates, and failing
      // the statement here would stop the process from starting. Skip it.
      // The in-memory guard still rejects a second purchase for a charge id
      // this process has loaded. The log carries the group count only.
      // eslint-disable-next-line no-console
      console.log(
        `[store] skipped documents_stars_charge_uidx: ${duplicateGroups} duplicate charge-id ${
          duplicateGroups === 1 ? 'group' : 'groups'
        } already stored. In-app idempotency still applies.`,
      );
    } else {
      await this.exec.query(STARS_CHARGE_UNIQUE_INDEX_SQL);
    }
    // Always. Skipping this when purchase duplicates exist would leave
    // subscription charges without a unique constraint. The index predicate
    // is the new type only, so those historical purchase rows do not block it.
    await this.exec.query(STARS_SUBSCRIPTION_CHARGE_UNIQUE_INDEX_SQL);
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
      // is simply gone from memory. Its delete rides the next batch.
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
   * Round-trip health check for GET /ready: proves the pool still answers,
   * not merely that hydration succeeded at boot. Under the file backing
   * this method does not exist and the probe degrades to store presence.
   */
  async ping(): Promise<void> {
    await this.exec.query('SELECT 1');
  }

  /**
   * Atomic compare-and-swap for refresh token rotation (PostgreSQL implementation).
   * Uses UPDATE ... WHERE usedAt IS NULL AND revokedAt IS NULL with RETURNING
   * to atomically mark the token as used only if still valid.
   *
   * The tokenHash is part of the WHERE clause as defense in depth: the caller
   * resolves the id from the hash in memory first, but the database re-checks
   * it so a race between hydration and rotation can never mark the wrong row.
   * The row lock taken by UPDATE serializes concurrent rotations of the same
   * token: the loser sees usedAt already set and matches zero rows, which is
   * what triggers family revocation in rotateRefresh().
   */
  async compareAndSwapRefreshToken(
    tokenId: string,
    tokenHash: string,
    usedAt: string
  ): Promise<RefreshTokenRecord | undefined> {
    const stmt = {
      text: `
        UPDATE documents
        SET doc = jsonb_set(doc, '{usedAt}', $4::jsonb, true), updated_at = now()
        WHERE container = $1 AND id = $2
          AND doc->>'tokenHash' = $3
          AND (doc->>'usedAt') IS NULL
          AND (doc->>'revokedAt') IS NULL
        RETURNING doc
      `,
      values: ['users', tokenId, tokenHash, JSON.stringify(usedAt)],
    };
    const result = await this.exec.query(stmt.text, stmt.values);
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0] as { doc: RefreshTokenRecord };
    // Fold the durably-updated row back into the local copy. Not markDirty:
    // the database already has it, and re-flushing would overwrite a newer
    // version another instance may have written. setWithoutDirty rather than a
    // bare container().set so index maintenance is not bypassed here (see
    // MemoryBackedStore.setWithoutDirty).
    const updated = { ...row.doc, id: tokenId };
    this.setWithoutDirty('users', updated);
    return updated;
  }
}
