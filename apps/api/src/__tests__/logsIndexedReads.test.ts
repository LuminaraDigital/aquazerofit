/**
 * The indexed log reads, at the call site rather than at the store.
 *
 * storeIndexes.test.ts proves the index machinery is maintained correctly.
 * This file proves the three functions that now use it still answer exactly
 * what the predicate scan they replaced answered — including after the write
 * patterns that move a document from one bucket to another (editing a meal's
 * date, re-weighing on the same day) — and covers the idempotency sweep that
 * stops the `logs` container growing forever.
 *
 * The reference answer is computed with `store.where(...)` and the ORIGINAL
 * predicate, so a divergence fails here rather than in a user's food diary.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { MealLog, MealLogItem, WaterLog, WeightLog } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-logsidx-'));
process.env.AZF_DATA_DIR = dataDir;

const { getStore } = await import('../platform/store');
const {
  createMealLog,
  createWaterLog,
  deleteMealLog,
  mealLogsForDate,
  sweepIdempotencyRecords,
  updateMealLog,
  upsertWeightLog,
  waterTotalForDate,
  weightLogsInRange,
} = await import('../modules/logs/service');

const USER = 'u-indexed';
const OTHER = 'u-other';
const D1 = '2026-08-01';
const D2 = '2026-08-02';
const D3 = '2026-08-03';

const item = (kcal: number): MealLogItem => ({
  name: 'Test food',
  grams: 100,
  kcal,
  proteinG: 1,
  carbsG: 1,
  fatG: 1,
});

/** The pre-index implementations, kept verbatim as the reference answer. */
const scanMeals = (userId: string, localDate: string): MealLog[] =>
  getStore()
    .where<MealLog>(
      'logs',
      (d) => d.type === 'mealLog' && d.userId === userId && d.localDate === localDate,
    )
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

const scanWaterTotal = (userId: string, localDate: string): number =>
  getStore()
    .where<WaterLog>(
      'logs',
      (d) => d.type === 'waterLog' && d.userId === userId && d.localDate === localDate,
    )
    .reduce((s, l) => s + l.amountMl, 0);

const scanWeights = (userId: string, from: string, to: string): WeightLog[] =>
  getStore()
    .where<WeightLog>(
      'logs',
      (d) =>
        d.type === 'weightLog' &&
        d.userId === userId &&
        d.localDate >= from &&
        d.localDate <= to,
    )
    .sort((a, b) => a.localDate.localeCompare(b.localDate));

const ids = (logs: { id: string }[]): string[] => logs.map((l) => l.id).sort();

let movedMealId = '';
let deletedMealId = '';

beforeAll(() => {
  // Two users so a leak between buckets shows up as a wrong total, not just a
  // wrong count, and three days so the range query has interior and edges.
  for (const user of [USER, OTHER]) {
    for (const date of [D1, D2, D3]) {
      createMealLog(user, { mealType: 'breakfast', items: [item(300)], localDate: date });
      createMealLog(user, { mealType: 'dinner', items: [item(500)], localDate: date });
      createWaterLog(user, { amountMl: 250, localDate: date });
      createWaterLog(user, { amountMl: 500, localDate: date });
      upsertWeightLog(user, { weightKg: 80, localDate: date });
    }
  }
  // A meal that will be moved between days (the index key change), and one
  // that will be deleted.
  movedMealId = createMealLog(USER, {
    mealType: 'lunch',
    items: [item(700)],
    localDate: D1,
  }).id;
  deletedMealId = createMealLog(USER, {
    mealType: 'snack',
    items: [item(150)],
    localDate: D2,
  }).id;
});

describe('mealLogsForDate', () => {
  it('matches the predicate scan on every day and both users', () => {
    for (const user of [USER, OTHER]) {
      for (const date of [D1, D2, D3, '2026-12-25']) {
        expect(ids(mealLogsForDate(user, date))).toEqual(ids(scanMeals(user, date)));
      }
    }
    expect(mealLogsForDate(USER, D1)).toHaveLength(3);
    expect(mealLogsForDate('nobody', D1)).toEqual([]);
  });

  it('follows a meal moved to another date, leaving nothing behind on the old one', () => {
    expect(ids(mealLogsForDate(USER, D1))).toContain(movedMealId);

    updateMealLog(USER, movedMealId, { localDate: D3 });

    expect(ids(mealLogsForDate(USER, D1))).not.toContain(movedMealId);
    expect(ids(mealLogsForDate(USER, D3))).toContain(movedMealId);
    // And both days still agree with the scan.
    expect(ids(mealLogsForDate(USER, D1))).toEqual(ids(scanMeals(USER, D1)));
    expect(ids(mealLogsForDate(USER, D3))).toEqual(ids(scanMeals(USER, D3)));
  });

  it('drops a deleted meal', () => {
    deleteMealLog(USER, deletedMealId);
    expect(ids(mealLogsForDate(USER, D2))).not.toContain(deletedMealId);
    expect(ids(mealLogsForDate(USER, D2))).toEqual(ids(scanMeals(USER, D2)));
  });
});

describe('waterTotalForDate', () => {
  it('matches the predicate scan and does not mix users', () => {
    for (const user of [USER, OTHER]) {
      for (const date of [D1, D2, D3, '2026-12-25']) {
        expect(waterTotalForDate(user, date)).toBe(scanWaterTotal(user, date));
      }
    }
    expect(waterTotalForDate(USER, D1)).toBe(750);
  });

  it('picks up a new entry immediately', () => {
    const { dayTotalMl } = createWaterLog(USER, { amountMl: 300, localDate: D1 });
    expect(dayTotalMl).toBe(1050);
    expect(waterTotalForDate(USER, D1)).toBe(scanWaterTotal(USER, D1));
  });
});

describe('weightLogsInRange', () => {
  it('matches the predicate scan for interior, edge, empty and inverted windows', () => {
    for (const [from, to] of [
      [D1, D3],
      [D2, D2],
      [D1, D2],
      ['2026-07-01', '2026-07-31'],
      ['2026-09-01', '2026-09-30'],
      [D3, D1], // from > to: empty for both implementations
    ] as const) {
      expect(ids(weightLogsInRange(USER, from, to))).toEqual(ids(scanWeights(USER, from, to)));
    }
    expect(weightLogsInRange(USER, D1, D3)).toHaveLength(3);
    expect(weightLogsInRange(USER, D1, D3).map((w) => w.localDate)).toEqual([D1, D2, D3]);
  });

  it('re-weighing the same day replaces rather than duplicates', () => {
    // upsertWeightLog reuses a deterministic id, so this is an update whose
    // index key does not change — the entry must not be filed twice.
    upsertWeightLog(USER, { weightKg: 79.2, localDate: D2 });
    const range = weightLogsInRange(USER, D1, D3);
    expect(range).toHaveLength(3);
    expect(range.find((w) => w.localDate === D2)?.weightKg).toBe(79.2);
    expect(ids(range)).toEqual(ids(scanWeights(USER, D1, D3)));
  });

  it('a weight entry recorded for a new day joins the range', () => {
    upsertWeightLog(USER, { weightKg: 78, localDate: '2026-08-10' });
    expect(ids(weightLogsInRange(USER, D1, '2026-08-10'))).toEqual(
      ids(scanWeights(USER, D1, '2026-08-10')),
    );
    expect(weightLogsInRange(USER, D1, '2026-08-10')).toHaveLength(4);
  });
});

describe('sweepIdempotencyRecords', () => {
  const idem = (id: string, expiresAt: string) => ({
    id,
    type: 'idempotency' as const,
    userId: USER,
    status: 201,
    body: { ok: true },
    createdAt: new Date(0).toISOString(),
    expiresAt,
  });

  it('removes only records whose replay window has closed', () => {
    const now = new Date('2026-08-20T12:00:00.000Z');
    const store = getStore();
    store.upsert('logs', idem('idem-old-1', '2026-08-19T12:00:00.000Z'));
    store.upsert('logs', idem('idem-old-2', '2026-08-20T11:59:59.999Z'));
    store.upsert('logs', idem('idem-boundary', now.toISOString()));
    store.upsert('logs', idem('idem-live', '2026-08-21T12:00:00.000Z'));

    const removed = sweepIdempotencyRecords(now);

    // The boundary record is already unusable (withIdempotency replays only
    // while expiresAt > now), so sweeping it is correct.
    expect(removed).toBe(3);
    expect(store.byId('logs', 'idem-old-1')).toBeUndefined();
    expect(store.byId('logs', 'idem-old-2')).toBeUndefined();
    expect(store.byId('logs', 'idem-boundary')).toBeUndefined();
    expect(store.byId('logs', 'idem-live')).toBeDefined();
  });

  it('never touches a health log, whatever its dates', () => {
    const before = {
      meals: ids(mealLogsForDate(USER, D1)),
      water: waterTotalForDate(USER, D1),
      weights: ids(weightLogsInRange(USER, D1, D3)),
    };
    // Far future: everything with an expiresAt is past it, so nothing but the
    // idempotency records may be eligible.
    sweepIdempotencyRecords(new Date('2099-01-01T00:00:00.000Z'));

    expect(ids(mealLogsForDate(USER, D1))).toEqual(before.meals);
    expect(waterTotalForDate(USER, D1)).toBe(before.water);
    expect(ids(weightLogsInRange(USER, D1, D3))).toEqual(before.weights);
    // And the reads still agree with the scan after a sweep touched the index.
    expect(ids(mealLogsForDate(USER, D1))).toEqual(ids(scanMeals(USER, D1)));
  });

  it('is a no-op when there is nothing to prune', () => {
    expect(sweepIdempotencyRecords(new Date('2099-01-01T00:00:00.000Z'))).toBe(0);
  });
});
