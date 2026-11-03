/**
 * Secondary index correctness for MemoryBackedStore.
 *
 * These tests exist because a maintained index has exactly one dangerous
 * failure mode — under-filing — and it is silent. `whereIndexed` re-checks the
 * caller's predicate, so an index that files too much can only cost time; an
 * index that files too little returns a SHORT answer, and a short answer here
 * is a missing meal in someone's food diary. Every case below is a way an
 * index goes stale:
 *
 *   - a create that never gets filed
 *   - an UPDATE THAT CHANGES THE KEY, leaving the id in its old bucket (the
 *     classic one)
 *   - a delete that leaves the id behind
 *   - a deleteWhere sweep that leaves ids behind
 *   - a document loaded by hydration rather than by a write
 *
 * The store is constructed directly (`new JsonStore(tmpdir)`) rather than
 * through getStore(), so there is no singleton, no seed data and no
 * AZF_DATA_DIR coordination with the rest of the suite.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  JsonStore,
  LOGS_BY_USER_TYPE,
  LOGS_BY_USER_TYPE_DATE,
  indexKey,
  type StoredDoc,
} from '../platform/store';

interface LogDoc extends StoredDoc {
  type: string;
  userId: string;
  localDate: string;
  amountMl?: number;
}

const dirs: string[] = [];
const opened: JsonStore[] = [];

function storeIn(dir: string): JsonStore {
  const store = new JsonStore(dir);
  opened.push(store);
  return store;
}

function newDir(prefix = 'azf-idx-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function newStore(): JsonStore {
  return storeIn(newDir());
}

const log = (over: Partial<LogDoc> & Pick<LogDoc, 'id'>): LogDoc => ({
  type: 'mealLog',
  userId: 'u1',
  localDate: '2026-08-01',
  ...over,
});

/** The predicate form these lookups replaced — the reference answer. */
const exactPred =
  (userId: string, type: string, localDate: string) =>
  (d: LogDoc): boolean =>
    d.type === type && d.userId === userId && d.localDate === localDate;

let store: JsonStore;

beforeEach(() => {
  store = newStore();
});

afterEach(async () => {
  // Drain first. Writes flush on a coalescing macrotask, so removing the
  // directory straight away races the flush and fills the run with ENOENT
  // noise from a store nobody is testing any more.
  for (const s of opened.splice(0)) await s.flush();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('index declaration', () => {
  it('declares both log indexes and nothing on an unindexed container', () => {
    expect(store.hasIndex('logs', LOGS_BY_USER_TYPE_DATE)).toBe(true);
    expect(store.hasIndex('logs', LOGS_BY_USER_TYPE)).toBe(true);
    expect(store.hasIndex('users', LOGS_BY_USER_TYPE_DATE)).toBe(false);
  });

  it('falls back to a full scan when the index is not declared', () => {
    // Correctness first: an undeclared index degrades to the behaviour it
    // replaced rather than returning nothing or throwing.
    store.upsert<LogDoc>('logs', log({ id: 'm1' }));
    const scanned = store.whereIndexed<LogDoc>(
      'users',
      'no-such-index',
      indexKey('u1', 'mealLog', '2026-08-01'),
      () => true,
    );
    expect(scanned).toEqual([]); // users container is empty, but it did not throw

    const onLogs = store.whereIndexed<LogDoc>(
      'logs',
      'no-such-index-either',
      'irrelevant',
      exactPred('u1', 'mealLog', '2026-08-01'),
    );
    expect(onLogs.map((d) => d.id)).toEqual(['m1']);
  });
});

describe('exact-match lookup', () => {
  it('returns exactly what the equivalent where() predicate returns', () => {
    // A corpus with every kind of near-miss: same user different day, same day
    // different user, same user and day but a different record type, and the
    // idempotency records that share this container.
    const docs: LogDoc[] = [
      log({ id: 'm1', userId: 'u1', localDate: '2026-08-01' }),
      log({ id: 'm2', userId: 'u1', localDate: '2026-08-01' }),
      log({ id: 'm3', userId: 'u1', localDate: '2026-08-02' }),
      log({ id: 'm4', userId: 'u2', localDate: '2026-08-01' }),
      log({ id: 'w1', userId: 'u1', localDate: '2026-08-01', type: 'waterLog', amountMl: 250 }),
      log({ id: 'w2', userId: 'u1', localDate: '2026-08-01', type: 'waterLog', amountMl: 500 }),
      log({ id: 'g1', userId: 'u1', localDate: '2026-08-01', type: 'weightLog' }),
      log({ id: 'i1', userId: 'u1', localDate: '2026-08-01', type: 'idempotency' }),
    ];
    for (const d of docs) store.upsert('logs', d);

    for (const [userId, type, date] of [
      ['u1', 'mealLog', '2026-08-01'],
      ['u1', 'mealLog', '2026-08-02'],
      ['u2', 'mealLog', '2026-08-01'],
      ['u1', 'waterLog', '2026-08-01'],
      ['u1', 'weightLog', '2026-08-01'],
      ['u9', 'mealLog', '2026-08-01'], // no such user
      ['u1', 'mealLog', '2030-01-01'], // no such day
    ] as const) {
      const pred = exactPred(userId, type, date);
      const indexed = store.whereIndexed<LogDoc>(
        'logs',
        LOGS_BY_USER_TYPE_DATE,
        indexKey(userId, type, date),
        pred,
      );
      const scanned = store.where<LogDoc>('logs', pred);
      expect(new Set(indexed.map((d) => d.id))).toEqual(new Set(scanned.map((d) => d.id)));
      expect(indexed).toHaveLength(scanned.length);
    }
  });

  it('does not let one composite key impersonate another', () => {
    // Unescaped, ('a|b', 'mealLog', 'd') and ('a', 'b|mealLog', 'd') would join
    // to the same string and one user would read another's day.
    store.upsert<LogDoc>('logs', log({ id: 'x1', userId: 'a|b', localDate: 'd' }));
    store.upsert<LogDoc>('logs', {
      id: 'x2',
      userId: 'a',
      type: 'b|mealLog',
      localDate: 'd',
    });
    expect(indexKey('a|b', 'mealLog', 'd')).not.toBe(indexKey('a', 'b|mealLog', 'd'));
    expect(store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, indexKey('a|b', 'mealLog', 'd'))).toEqual(
      ['x1'],
    );
    expect(
      store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, indexKey('a', 'b|mealLog', 'd')),
    ).toEqual(['x2']);
  });
});

describe('index invalidation', () => {
  it('an update that CHANGES the key leaves no stale entry behind', () => {
    const oldKey = indexKey('u1', 'mealLog', '2026-08-01');
    const newKey = indexKey('u1', 'mealLog', '2026-08-09');
    store.upsert<LogDoc>('logs', log({ id: 'm1', localDate: '2026-08-01' }));
    expect(store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, oldKey)).toEqual(['m1']);

    // The move: same id, different localDate.
    store.upsert<LogDoc>('logs', log({ id: 'm1', localDate: '2026-08-09' }));

    // Raw bucket, not whereIndexed — the predicate re-check would hide a stale
    // entry, and a stale entry is precisely what this test is about.
    expect(store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, oldKey)).toEqual([]);
    expect(store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, newKey)).toEqual(['m1']);

    expect(
      store.whereIndexed<LogDoc>(
        'logs',
        LOGS_BY_USER_TYPE_DATE,
        oldKey,
        exactPred('u1', 'mealLog', '2026-08-01'),
      ),
    ).toEqual([]);
    expect(
      store
        .whereIndexed<LogDoc>(
          'logs',
          LOGS_BY_USER_TYPE_DATE,
          newKey,
          exactPred('u1', 'mealLog', '2026-08-09'),
        )
        .map((d) => d.id),
    ).toEqual(['m1']);
  });

  it('handles a key change on every indexed field, including the user', () => {
    store.upsert<LogDoc>('logs', log({ id: 'm1', userId: 'u1', type: 'mealLog' }));
    store.upsert<LogDoc>('logs', log({ id: 'm1', userId: 'u2', type: 'waterLog' }));

    expect(store.indexedIds('logs', LOGS_BY_USER_TYPE, indexKey('u1', 'mealLog'))).toEqual([]);
    expect(store.indexedIds('logs', LOGS_BY_USER_TYPE, indexKey('u2', 'waterLog'))).toEqual(['m1']);
    expect(
      store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, indexKey('u1', 'mealLog', '2026-08-01')),
    ).toEqual([]);
  });

  it('drops a document that stops being indexable at all', () => {
    store.upsert<LogDoc>('logs', log({ id: 'm1' }));
    // localDate gone: the extractor returns undefined and the doc must leave
    // the index rather than stay filed under its previous key.
    store.upsert<StoredDoc>('logs', { id: 'm1', type: 'mealLog', userId: 'u1' } as StoredDoc);
    expect(
      store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, indexKey('u1', 'mealLog', '2026-08-01')),
    ).toEqual([]);
    // The coarser index still covers it — userId and type are both present.
    expect(store.indexedIds('logs', LOGS_BY_USER_TYPE, indexKey('u1', 'mealLog'))).toEqual(['m1']);
  });

  it('delete removes the entry from every index', () => {
    store.upsert<LogDoc>('logs', log({ id: 'm1' }));
    store.upsert<LogDoc>('logs', log({ id: 'm2' }));
    expect(store.delete('logs', 'm1')).toBe(true);

    expect(
      store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, indexKey('u1', 'mealLog', '2026-08-01')),
    ).toEqual(['m2']);
    expect(store.indexedIds('logs', LOGS_BY_USER_TYPE, indexKey('u1', 'mealLog'))).toEqual(['m2']);

    store.delete('logs', 'm2');
    expect(
      store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, indexKey('u1', 'mealLog', '2026-08-01')),
    ).toEqual([]);
  });

  it('deleteWhere removes every entry it deleted', () => {
    store.upsert<LogDoc>('logs', log({ id: 'm1' }));
    store.upsert<LogDoc>('logs', log({ id: 'm2' }));
    store.upsert<LogDoc>('logs', log({ id: 'm3', localDate: '2026-08-02' }));

    const removed = store.deleteWhere<LogDoc>('logs', (d) => d.localDate === '2026-08-01');
    expect(removed).toBe(2);
    expect(
      store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, indexKey('u1', 'mealLog', '2026-08-01')),
    ).toEqual([]);
    expect(store.indexedIds('logs', LOGS_BY_USER_TYPE, indexKey('u1', 'mealLog'))).toEqual(['m3']);
  });

  it('re-upserting an unchanged document does not duplicate or drop it', () => {
    const doc = log({ id: 'm1' });
    store.upsert('logs', doc);
    store.upsert('logs', { ...doc });
    store.upsert('logs', { ...doc });
    expect(
      store.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, indexKey('u1', 'mealLog', '2026-08-01')),
    ).toEqual(['m1']);
  });
});

describe('hydration', () => {
  it('files documents loaded from the backing store, not only ones written this process', async () => {
    // The bug this catches: indexes attached after hydration are already
    // missing every row that existed before the process started — which, on a
    // restarted server, is all of them.
    const dir = newDir('azf-idx-hydrate-');
    const first = storeIn(dir);
    first.upsert<LogDoc>('logs', log({ id: 'm1' }));
    first.upsert<LogDoc>('logs', log({ id: 'm2', localDate: '2026-08-02' }));
    await first.flush();

    const second = storeIn(dir);
    expect(second.count('logs')).toBe(2);
    expect(
      second.indexedIds('logs', LOGS_BY_USER_TYPE_DATE, indexKey('u1', 'mealLog', '2026-08-01')),
    ).toEqual(['m1']);
    expect(
      second
        .whereIndexed<LogDoc>(
          'logs',
          LOGS_BY_USER_TYPE_DATE,
          indexKey('u1', 'mealLog', '2026-08-02'),
          exactPred('u1', 'mealLog', '2026-08-02'),
        )
        .map((d) => d.id),
    ).toEqual(['m2']);
  });
});

describe('range lookup over the coarse index', () => {
  const inRange =
    (userId: string, from: string, to: string) =>
    (d: LogDoc): boolean =>
      d.type === 'weightLog' && d.userId === userId && d.localDate >= from && d.localDate <= to;

  beforeEach(() => {
    const dates = ['2026-07-28', '2026-07-31', '2026-08-01', '2026-08-05', '2026-08-14'];
    for (const date of dates) {
      store.upsert<LogDoc>('logs', log({ id: `wl-u1-${date}`, type: 'weightLog', localDate: date }));
      // Another user's entries on the same dates, and this user's meals: both
      // must stay out of the answer.
      store.upsert<LogDoc>('logs', log({ id: `wl-u2-${date}`, type: 'weightLog', userId: 'u2', localDate: date }));
      store.upsert<LogDoc>('logs', log({ id: `ml-u1-${date}`, localDate: date }));
    }
  });

  it('returns the same set as the predicate scan, for every window shape', () => {
    for (const [from, to] of [
      ['2026-07-31', '2026-08-05'], // interior
      ['2026-07-28', '2026-08-14'], // everything
      ['2026-08-01', '2026-08-01'], // single day that exists
      ['2026-08-02', '2026-08-04'], // window containing nothing
      ['2026-01-01', '2026-07-27'], // entirely before
      ['2026-09-01', '2026-12-31'], // entirely after
    ] as const) {
      const pred = inRange('u1', from, to);
      const indexed = store.whereIndexed<LogDoc>(
        'logs',
        LOGS_BY_USER_TYPE,
        indexKey('u1', 'weightLog'),
        pred,
      );
      const scanned = store.where<LogDoc>('logs', pred);
      expect(new Set(indexed.map((d) => d.id))).toEqual(new Set(scanned.map((d) => d.id)));
      expect(indexed).toHaveLength(scanned.length);
    }
  });

  it('the bucket it scans is the user\'s own entries, not the whole container', () => {
    expect(store.count('logs')).toBe(15);
    expect(store.indexedIds('logs', LOGS_BY_USER_TYPE, indexKey('u1', 'weightLog'))).toHaveLength(5);
  });
});
