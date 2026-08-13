/**
 * Document store emulating the Cosmos container model (AQF-06 §2).
 *
 * Shape: the working set lives in memory (one Map per container) and every
 * read is served synchronously from it. Writes apply to memory immediately and
 * are flushed to the backing store asynchronously through a serialized queue,
 * so a burst of writes can never interleave and corrupt the backing copy.
 *
 * Two backings share that memory layer:
 *   - JsonStore    — one JSON file per container under config.dataDir. Local
 *                    dev and the whole test suite run on this.
 *   - PostgresStore — a single `documents` table (see ./pgStore). Selected when
 *                    DATABASE_URL is present outside tests, because Replit's
 *                    published filesystem is wiped on every publish.
 *
 * The synchronous read API is the reason for the split: getStore() is called
 * from ~77 sites and converting them to async is a separate piece of work.
 * Only the persistence backing changes here.
 *
 * AZF_DATA_DIR overrides the data directory (used by integration tests).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config';
import { seedIfNeeded } from '../data/seed';

export const CONTAINERS = [
  'users',
  'profiles',
  'logs',
  'plans',
  'content',
  // Segregated nutrition containers (ODbL collective-database posture,
  // wger-integration-plan.md §2.3): OFF-derived records NEVER commingle with
  // the curated `content` container; FDC (CC0) gets its own namespace too.
  'foodsOff',
  'foodsFdc',
  'ai',
  'ledger',
  'audit',
] as const;
export type ContainerName = (typeof CONTAINERS)[number];

export interface StoredDoc {
  id: string;
}

export interface RefreshTokenRecord {
  id: string;
  type: 'refreshToken';
  /** sha256 hex of the opaque token. Only the hash is stored at rest. */
  tokenHash: string;
  userId: string;
  familyId: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Pending writes for one container, tracked per document id.
 *
 * Per-id rather than per-container because the Postgres backing must not
 * rewrite all ~995 `content` rows every time one meal log changes. JsonStore
 * ignores the id granularity and rewrites the whole file, which is what it has
 * always done.
 */
export interface ContainerDelta {
  changed: Set<string>;
  deleted: Set<string>;
}

export function newId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}-${id}` : id;
}

/**
 * In-memory working set + the write-coalescing machinery. Subclasses supply
 * only `persist()` — how a batch of dirty ids reaches durable storage.
 *
 * Deliberately declares every *instance* member the concrete stores need, so
 * that JsonStore adds none of its own. That keeps `MemoryBackedStore` and
 * `JsonStore` mutually assignable and lets call sites still annotated with
 * `JsonStore` (seed.ts, the wger/OFF importers) compile untouched.
 */
export abstract class MemoryBackedStore {
  /**
   * Local data root. JsonStore persists containers here; PostgresStore does
   * not, but the wger importer still parks its resume-state file in this
   * directory, so it is meaningful under both backings.
   */
  readonly dataDir: string;

  private readonly data = new Map<ContainerName, Map<string, StoredDoc>>();
  private dirty = new Map<ContainerName, ContainerDelta>();
  private writeQueue: Promise<void> = Promise.resolve();
  private flushScheduled = false;

  protected constructor(dataDir: string) {
    this.dataDir = dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
    for (const name of CONTAINERS) this.data.set(name, new Map());
  }

  protected container(name: ContainerName): Map<string, StoredDoc> {
    const map = this.data.get(name);
    if (!map) throw new Error(`Unknown container: ${name}`);
    return map;
  }

  /** Load documents into memory without marking them dirty (hydration only). */
  protected hydrateContainer(name: ContainerName, docs: Iterable<StoredDoc>): void {
    const map = this.container(name);
    for (const doc of docs) {
      if (doc && typeof doc.id === 'string') map.set(doc.id, doc);
    }
  }

  // ----- synchronous read/write API (unchanged contract) -----

  all<T extends StoredDoc>(name: ContainerName): T[] {
    return [...this.container(name).values()] as T[];
  }

  byId<T extends StoredDoc>(name: ContainerName, id: string): T | undefined {
    return this.container(name).get(id) as T | undefined;
  }

  where<T extends StoredDoc>(name: ContainerName, pred: (doc: T) => boolean): T[] {
    return (this.all<T>(name)).filter(pred);
  }

  findOne<T extends StoredDoc>(name: ContainerName, pred: (doc: T) => boolean): T | undefined {
    for (const doc of this.container(name).values()) {
      if (pred(doc as T)) return doc as T;
    }
    return undefined;
  }

  upsert<T extends StoredDoc>(name: ContainerName, doc: T): T {
    this.container(name).set(doc.id, doc);
    this.markDirty(name, doc.id, 'write');
    return doc;
  }

  delete(name: ContainerName, id: string): boolean {
    const removed = this.container(name).delete(id);
    if (removed) this.markDirty(name, id, 'delete');
    return removed;
  }

  deleteWhere<T extends StoredDoc>(name: ContainerName, pred: (doc: T) => boolean): number {
    const doomed = this.where<T>(name, pred).map((d) => d.id);
    for (const id of doomed) {
      this.container(name).delete(id);
      this.markDirty(name, id, 'delete');
    }
    return doomed.length;
  }

  count(name: ContainerName): number {
    return this.container(name).size;
  }

  // ----- serialized persistence -----

  protected markDirty(name: ContainerName, id: string, op: 'write' | 'delete'): void {
    let delta = this.dirty.get(name);
    if (!delta) {
      delta = { changed: new Set(), deleted: new Set() };
      this.dirty.set(name, delta);
    }
    // The two sets must stay disjoint: an id written then deleted inside one
    // batch is a delete, and a deleted id written again is a write. Otherwise
    // the flush would issue both statements for the same row in one batch and
    // the outcome would depend on statement order.
    if (op === 'write') {
      delta.deleted.delete(id);
      delta.changed.add(id);
    } else {
      delta.changed.delete(id);
      delta.deleted.add(id);
    }

    if (this.flushScheduled) return;
    this.flushScheduled = true;
    // Coalesce bursts of writes into one flush per macrotask.
    setImmediate(() => {
      this.flushScheduled = false;
      this.enqueueFlush();
    });
  }

  private enqueueFlush(): void {
    const batch = this.dirty;
    this.dirty = new Map();
    this.writeQueue = this.writeQueue
      .then(() => this.persist(batch))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[store] flush failed', err);
        // Re-mark the failed batch dirty so the next flush retries it —
        // otherwise these ids are only re-persisted if they happen to change
        // again, which under per-id backing (Postgres) loses them on restart.
        // Merge UNDER any newer dirt: changes recorded since the failure are
        // strictly newer and must win.
        for (const [container, delta] of batch) {
          const current =
            this.dirty.get(container) ??
            (() => {
              const fresh = { changed: new Set<string>(), deleted: new Set<string>() };
              this.dirty.set(container, fresh);
              return fresh;
            })();
          for (const id of delta.changed) {
            if (!current.deleted.has(id)) current.changed.add(id);
          }
          for (const id of delta.deleted) {
            if (!current.changed.has(id)) current.deleted.add(id);
          }
        }
      });
  }

  /**
   * Write one coalesced batch of dirty ids to the backing store.
   *
   * Internal hook — callers use flush(). It is public rather than protected
   * only because TypeScript compares an overridden *protected* member
   * nominally: with `protected persist()` re-declared in each subclass,
   * MemoryBackedStore would stop being assignable to JsonStore and every call
   * site still annotated `store: JsonStore` (seed.ts, the importers) would
   * fail to compile.
   */
  abstract persist(batch: ReadonlyMap<ContainerName, ContainerDelta>): Promise<void>;

  /** Await all pending writes (tests, graceful shutdown, seed script). */
  async flush(): Promise<void> {
    if (this.dirty.size > 0) this.enqueueFlush();
    await this.writeQueue;
  }

  /**
   * Atomic compare-and-swap for refresh token rotation.
   * Marks a refresh token as used (sets usedAt) only if it's still unused and not revoked.
   * Returns the updated record on success, undefined if the token was already consumed/revoked.
   */
  async compareAndSwapRefreshToken(
    tokenId: string,
    tokenHash: string,
    usedAt: string
  ): Promise<RefreshTokenRecord | undefined> {
    const rec = this.container('users').get(tokenId) as RefreshTokenRecord | undefined;
    if (!rec) return undefined;
    if (rec.tokenHash !== tokenHash) return undefined;
    if (rec.usedAt !== null || rec.revokedAt !== null) return undefined;
    const updated = { ...rec, usedAt };
    this.container('users').set(tokenId, updated);
    this.markDirty('users', tokenId, 'write');
    return updated;
  }
}

/**
 * Local JSON persistence: one file per container under dataDir. Writes go
 * through a tmp file + rename so a crash mid-write cannot truncate a
 * container. Adds no instance members of its own — see MemoryBackedStore.
 */
export class JsonStore extends MemoryBackedStore {
  constructor(dataDir: string) {
    super(dataDir);
    for (const name of CONTAINERS) {
      this.hydrateContainer(name, readContainerFile(dataDir, name));
    }
  }

  /**
   * Whole-container rewrite, ignoring the per-id granularity of the batch: a
   * JSON file has no partial-update form, and this is exactly the behaviour
   * the store has always had locally.
   */
  async persist(batch: ReadonlyMap<ContainerName, ContainerDelta>): Promise<void> {
    for (const name of batch.keys()) {
      const file = containerFilePath(this.dataDir, name);
      const tmp = `${file}.tmp`;
      const payload = JSON.stringify([...this.container(name).values()], null, config.isTest ? 0 : 1);
      await fs.promises.writeFile(tmp, payload, 'utf8');
      await fs.promises.rename(tmp, file);
    }
  }
}

// JsonStore's file helpers live at module scope rather than as private methods
// so the class contributes no members beyond MemoryBackedStore (see above).

function containerFilePath(dataDir: string, name: ContainerName): string {
  return path.join(dataDir, `${name}.json`);
}

function readContainerFile(dataDir: string, name: ContainerName): StoredDoc[] {
  const file = containerFilePath(dataDir, name);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? (parsed as StoredDoc[]) : [];
  } catch {
    // Corrupt file: keep a copy aside, start clean rather than crash the API.
    try {
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      /* ignore */
    }
    return [];
  }
}

/**
 * Container-handle facade over the singleton store. Other lanes consume the
 * store through `store.container(name)` so they never hold a stale instance
 * across an AZF_DATA_DIR change (tests).
 */
export interface ContainerHandle {
  all<T extends StoredDoc>(): T[];
  byId<T extends StoredDoc>(id: string): T | undefined;
  where<T extends StoredDoc>(pred: (doc: T) => boolean): T[];
  upsert<T extends StoredDoc>(doc: T): T;
  delete(id: string): boolean;
}

/**
 * Atomic compare-and-swap for refresh token rotation.
 * Marks a refresh token as used (sets usedAt) only if it's still unused and not revoked.
 * Returns the updated record on success, undefined if the token was already consumed/revoked.
 */
export interface RefreshTokenCAS {
  compareAndSwapRefreshToken(
    tokenId: string,
    tokenHash: string,
    usedAt: string
  ): Promise<RefreshTokenRecord | undefined>;
}

export const store = {
  container(name: string): ContainerHandle {
    const containerName = name as ContainerName;
    return {
      all: <T extends StoredDoc>() => getStore().all<T>(containerName),
      byId: <T extends StoredDoc>(id: string) => getStore().byId<T>(containerName, id),
      where: <T extends StoredDoc>(pred: (doc: T) => boolean) =>
        getStore().where<T>(containerName, pred),
      upsert: <T extends StoredDoc>(doc: T) => getStore().upsert<T>(containerName, doc),
      delete: (id: string) => getStore().delete(containerName, id),
    };
  },
};

let singleton: MemoryBackedStore | null = null;

/**
 * Postgres is used only when an operator actually provisioned a database, and
 * never under test: the suite must stay hermetic and must not need a server.
 */
function postgresEnabled(): boolean {
  return !config.isTest && Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Async store bootstrap. Postgres hydration is async but getStore() is not, so
 * index.ts awaits this before app.listen and every later getStore() call just
 * returns the hydrated singleton. Idempotent.
 */
export async function initStore(): Promise<MemoryBackedStore> {
  if (singleton) return singleton;
  if (!postgresEnabled()) return getStore();

  // Imported lazily so `pg` is never loaded — nor required to be installed —
  // in the file-backed dev/test path.
  const { PostgresStore } = await import('./pgStore');
  const pg = await PostgresStore.connect(process.env.DATABASE_URL!.trim(), config.dataDir);
  await pg.hydrate();
  singleton = pg;
  // Seed after hydration, never before: seedIfNeeded's own emptiness checks
  // are only meaningful once the existing rows are in memory.
  seedIfNeeded(pg);
  return pg;
}

/**
 * Human-readable cause for a store bootstrap failure. When DATABASE_URL points
 * at a server that is unreachable, refuses the credentials, or lacks the named
 * database, the pg driver surfaces a bare code (ECONNREFUSED, 28P01, 3D000…)
 * that tells an operator reading a crash log nothing actionable. index.ts
 * prints this instead before exiting non-zero, so the boot failure identifies
 * its own cause rather than dying on a cryptic stack trace.
 */
export function describeStoreInitFailure(err: unknown): string {
  // pg (via Node's net) may wrap connection failures in an AggregateError
  // whose own `code`/`message` are empty; the real cause is the first inner
  // error, so unwrap before mapping.
  if (err instanceof AggregateError && err.errors.length > 0) {
    return describeStoreInitFailure(err.errors[0]);
  }
  const code =
    typeof (err as { code?: unknown } | null)?.code === 'string'
      ? (err as { code: string }).code
      : '';
  const message = err instanceof Error ? err.message : String(err);
  switch (code) {
    case 'ECONNREFUSED':
      return `Postgres refused the connection (${message}). The server behind DATABASE_URL is not accepting connections — check that the database is running and the host and port are right.`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `The Postgres host in DATABASE_URL could not be resolved (${message}). Check the hostname for typos and that DNS is reachable from this process.`;
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      return `The connection to Postgres timed out or was dropped (${message}). Check network access and firewall rules between this process and the database.`;
    case '28P01':
    case '28000':
      return `Postgres rejected the credentials in DATABASE_URL (${message}). Check the username and password — authentication failed.`;
    case '3D000':
      return `The database named in DATABASE_URL does not exist (${message}). Create it, or fix the database name in the connection string.`;
    case '57P03':
      return `Postgres is starting up or shutting down and cannot accept connections yet (${message}). Retry once the database is ready.`;
    default:
      return `Store initialisation failed (${message}). DATABASE_URL is set, so Postgres hydration was attempted; fix the connection string, or unset DATABASE_URL to fall back to the file-backed store.`;
  }
}

/**
 * Synchronous store access. Under the file backing this still constructs and
 * seeds lazily on first call (unchanged). Under the Postgres backing there is
 * nothing safe to return before hydration — an empty store would look like a
 * brand new database and re-seed over live data — so it throws instead.
 */
export function getStore(): MemoryBackedStore {
  if (postgresEnabled()) {
    if (!singleton) {
      throw new Error(
        'Store not initialised: DATABASE_URL is set, so initStore() must be awaited before getStore().',
      );
    }
    return singleton;
  }

  const dir = config.dataDir;
  if (!singleton || singleton.dataDir !== dir) {
    const json = new JsonStore(dir);
    singleton = json;
    seedIfNeeded(json);
  }
  return singleton;
}

/**
 * Test-only: drop the cached singleton so the next getStore() rebinds to
 * config.dataDir. Integration suites call this after mutating AZF_DATA_DIR
 * because Vitest loads every file in a worker before any test runs, so the
 * env var seen at import time is not necessarily the one in effect later.
 */
export function resetStoreSingletonForTests(): void {
  if (!config.isTest) {
    throw new Error('resetStoreSingletonForTests is only available under test');
  }
  singleton = null;
}
