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
 * READ PATH. `where()` materialises the whole container and scans it, which is
 * fine for containers that are read whole and hopeless for the ones that are
 * read a slice at a time. The `logs` container is the latter: it holds every
 * meal, water, weight, workout-session, buddy-challenge and idempotency record
 * for every user, and "one user's meals on one day" walked all of it. Hence
 * SECONDARY_INDEXES below — maintained in-process, exact-match on a composite
 * key, and always re-checked against the caller's predicate so an index that
 * ever went wrong can only ever be slow, never wrong. See whereIndexed().
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

// ----- secondary indexes -----

/**
 * Compose an index key from its parts.
 *
 * The parts are escaped before joining because an unescaped delimiter is how
 * composite keys collide: ('a|b', 'c') and ('a', 'b|c') would produce the same
 * string and one user's day would answer for another's. Nothing we index today
 * can contain a pipe (ids are UUIDs, dates are YYYY-MM-DD, types are literals),
 * but a key builder that is only correct because of what its callers happen to
 * pass is a trap for the next caller. The escape makes it injective outright.
 */
export function indexKey(...parts: string[]): string {
  return parts.map((p) => p.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')).join('|');
}

/**
 * One maintained lookup over one container.
 *
 * `key` returns undefined for a document the index does not cover — that
 * document simply is not filed, and a lookup can never return it. Every doc in
 * the `logs` container that is not a user-dated record (there are none today,
 * but nothing enforces that) falls out this way rather than being filed under
 * a half-formed key.
 */
export interface SecondaryIndexSpec {
  readonly name: string;
  readonly container: ContainerName;
  readonly key: (doc: StoredDoc) => string | undefined;
}

/** Shape the log indexes read. Everything is optional: docs are opaque here. */
interface UserDatedDoc extends StoredDoc {
  type?: unknown;
  userId?: unknown;
  localDate?: unknown;
}

/** Exact-match index: one user, one record type, one local date. */
export const LOGS_BY_USER_TYPE_DATE = 'logs.userId+type+localDate';

/**
 * Coarser index: one user, one record type, all dates.
 *
 * This exists because weightLogsInRange asks a RANGE question, and a hash
 * index on an exact composite key cannot answer one — you would have to
 * enumerate every date in the range and probe each, which is wrong the moment
 * a caller asks for an open-ended or very wide window. Scanning this bucket
 * instead is honest: it is O(that user's weight logs) rather than O(every log
 * of every user), which is the reduction that actually mattered.
 */
export const LOGS_BY_USER_TYPE = 'logs.userId+type';

function userTypeDateKey(doc: StoredDoc): string | undefined {
  const d = doc as UserDatedDoc;
  if (typeof d.userId !== 'string' || typeof d.type !== 'string') return undefined;
  if (typeof d.localDate !== 'string') return undefined;
  return indexKey(d.userId, d.type, d.localDate);
}

function userTypeKey(doc: StoredDoc): string | undefined {
  const d = doc as UserDatedDoc;
  if (typeof d.userId !== 'string' || typeof d.type !== 'string') return undefined;
  return indexKey(d.userId, d.type);
}

/**
 * Declared indexes, built by every backing at construction.
 *
 * Kept to the `logs` container deliberately. Each index costs a Map entry per
 * key plus a Set entry per document plus one extractor call per write, so they
 * are worth it only where reads are both hot and selective. Adding one for
 * another container is a one-line change here — but measure the read first.
 */
export const SECONDARY_INDEXES: readonly SecondaryIndexSpec[] = [
  { name: LOGS_BY_USER_TYPE_DATE, container: 'logs', key: userTypeDateKey },
  { name: LOGS_BY_USER_TYPE, container: 'logs', key: userTypeKey },
];

/** Runtime state of one declared index. */
interface SecondaryIndex {
  readonly spec: SecondaryIndexSpec;
  /** key -> the ids currently filed under it. */
  readonly buckets: Map<string, Set<string>>;
  /**
   * id -> the key it was last filed under.
   *
   * This is what makes an UPDATE THAT CHANGES THE KEY correct, and it is the
   * whole reason the index does not re-derive the old key from the old
   * document: by the time upsert() runs, the caller may already hold a
   * document that differs from the filed one, and re-deriving would remove the
   * wrong bucket entry and strand the old one forever. Remembering where we
   * actually put it cannot be wrong.
   */
  readonly filedAs: Map<string, string>;
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
  /** container -> index name -> index. Empty for containers with no indexes. */
  private readonly indexes = new Map<ContainerName, Map<string, SecondaryIndex>>();

  protected constructor(dataDir: string) {
    this.dataDir = dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
    for (const name of CONTAINERS) this.data.set(name, new Map());
    // Built before any hydration so every path into memory — JsonStore's
    // constructor, PostgresStore.hydrate(), and every later write — files
    // through the same maintenance code. An index that is attached after the
    // fact is an index that is already missing rows.
    for (const spec of SECONDARY_INDEXES) {
      let forContainer = this.indexes.get(spec.container);
      if (!forContainer) this.indexes.set(spec.container, (forContainer = new Map()));
      forContainer.set(spec.name, { spec, buckets: new Map(), filedAs: new Map() });
    }
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
      if (doc && typeof doc.id === 'string') {
        map.set(doc.id, doc);
        this.indexPut(name, doc);
      }
    }
  }

  /**
   * Write a document into memory and its indexes WITHOUT marking it dirty.
   *
   * For the one caller that has already durably written the change itself and
   * must only reconcile the local copy: compareAndSwapRefreshToken, which
   * updates the row in Postgres and then folds the result back in. Going
   * through here rather than `container(name).set(...)` is what stops that
   * path from silently bypassing index maintenance if `users` is ever indexed.
   */
  protected setWithoutDirty(name: ContainerName, doc: StoredDoc): void {
    this.container(name).set(doc.id, doc);
    this.indexPut(name, doc);
  }

  // ----- index maintenance -----

  /**
   * File (or re-file) one document in every index over its container.
   *
   * The re-file case is the one that matters: when the extracted key changes,
   * the id must leave its OLD bucket. Dropping that step is the classic
   * secondary-index bug — the stale entry stays behind and the old key keeps
   * answering with a document that no longer belongs to it.
   */
  private indexPut(name: ContainerName, doc: StoredDoc): void {
    const forContainer = this.indexes.get(name);
    if (!forContainer) return;
    for (const index of forContainer.values()) {
      const next = index.spec.key(doc);
      const previous = index.filedAs.get(doc.id);
      if (previous === next) continue;
      if (previous !== undefined) this.detach(index, previous, doc.id);
      if (next === undefined) {
        index.filedAs.delete(doc.id);
      } else {
        index.filedAs.set(doc.id, next);
        let bucket = index.buckets.get(next);
        if (!bucket) index.buckets.set(next, (bucket = new Set()));
        bucket.add(doc.id);
      }
    }
  }

  /** Remove one id from every index over its container. */
  private indexDrop(name: ContainerName, id: string): void {
    const forContainer = this.indexes.get(name);
    if (!forContainer) return;
    for (const index of forContainer.values()) {
      const previous = index.filedAs.get(id);
      if (previous === undefined) continue;
      this.detach(index, previous, id);
      index.filedAs.delete(id);
    }
  }

  /**
   * Drop an id from one bucket, dropping the bucket itself when it empties —
   * otherwise a long-lived process accumulates one empty Set per key it has
   * ever seen, which for a per-user-per-day key is unbounded growth.
   */
  private detach(index: SecondaryIndex, key: string, id: string): void {
    const bucket = index.buckets.get(key);
    if (!bucket) return;
    bucket.delete(id);
    if (bucket.size === 0) index.buckets.delete(key);
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

  /**
   * Indexed equivalent of `where()`: the documents filed under `key` in
   * `index` that also satisfy `pred`.
   *
   * TWO SAFETY PROPERTIES, both deliberate, because this serves health data
   * and a wrong total is worse than a slow one:
   *
   *  1. `pred` is applied to every candidate the index returns. The index
   *     narrows the search; the predicate decides the answer. So the result is
   *     always a SUBSET of what `where(name, pred)` would return — an index
   *     that somehow over-files can only cost time, never change an answer.
   *  2. An index that is not declared for this container is not an error; the
   *     call degrades to the full scan it replaced. Deleting a line from
   *     SECONDARY_INDEXES makes the app slower, not wrong.
   *
   * What neither property covers is an index that UNDER-files — a document
   * that should be in the bucket and is not. That is the only failure mode
   * left, and it is exactly what the maintenance in indexPut/indexDrop and the
   * tests in __tests__/storeIndexes.test.ts exist to rule out.
   *
   * `pred` must be the same predicate the unindexed call would have used, so
   * the two are interchangeable at the call site.
   */
  whereIndexed<T extends StoredDoc>(
    name: ContainerName,
    index: string,
    key: string,
    pred: (doc: T) => boolean,
  ): T[] {
    const found = this.indexes.get(name)?.get(index);
    if (!found) return this.where<T>(name, pred);
    const ids = found.buckets.get(key);
    if (!ids) return [];
    const container = this.container(name);
    const out: T[] = [];
    for (const id of ids) {
      const doc = container.get(id) as T | undefined;
      if (doc && pred(doc)) out.push(doc);
    }
    return out;
  }

  /** True when `index` is declared over `name`. */
  hasIndex(name: ContainerName, index: string): boolean {
    return this.indexes.get(name)?.has(index) === true;
  }

  /**
   * Raw contents of one index bucket, unfiltered by any predicate.
   *
   * Exposed so tests can assert on the index itself rather than on what
   * whereIndexed's predicate re-check happens to hide: a stale entry left by a
   * key change is invisible through whereIndexed and plainly visible here.
   */
  indexedIds(name: ContainerName, index: string, key: string): string[] {
    const bucket = this.indexes.get(name)?.get(index)?.buckets.get(key);
    return bucket ? [...bucket] : [];
  }

  upsert<T extends StoredDoc>(name: ContainerName, doc: T): T {
    this.container(name).set(doc.id, doc);
    // Before markDirty, so a persist() that reads memory can never observe a
    // document whose index entry has not caught up.
    this.indexPut(name, doc);
    this.markDirty(name, doc.id, 'write');
    return doc;
  }

  delete(name: ContainerName, id: string): boolean {
    const removed = this.container(name).delete(id);
    if (removed) {
      this.indexDrop(name, id);
      this.markDirty(name, id, 'delete');
    }
    return removed;
  }

  deleteWhere<T extends StoredDoc>(name: ContainerName, pred: (doc: T) => boolean): number {
    // Still a full scan: deleteWhere takes an arbitrary predicate that no
    // single index can answer, and it is a sweep/erasure path rather than a
    // request path. Correctness over cleverness here.
    const doomed = this.where<T>(name, pred).map((d) => d.id);
    for (const id of doomed) {
      this.container(name).delete(id);
      this.indexDrop(name, id);
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
    this.setWithoutDirty('users', updated);
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
  // DATABASE_URL_ALLOW_INSECURE_SSL opts out of TLS enforcement for hosts that
  // are not loopback but ARE trusted private networks: the canonical case is a
  // docker-compose stack whose api and db share an isolated bridge network
  // (hostname 'db', no host port published). It must never be set when
  // DATABASE_URL points off this machine.
  const allowInsecureSsl = process.env.DATABASE_URL_ALLOW_INSECURE_SSL === 'true';
  if (allowInsecureSsl) {
    console.warn(
      '[store] DATABASE_URL_ALLOW_INSECURE_SSL=true: plaintext Postgres accepted. ' +
        'Set this only on an isolated private network (e.g. a docker-compose bridge); ' +
        'never for a database reachable from the public internet.',
    );
  }
  const pg = await PostgresStore.connect(process.env.DATABASE_URL!.trim(), config.dataDir, {
    allowInsecureSsl,
  });
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
