/**
 * The challenge reads that were full scans.
 *
 * GET /challenges/peek/:code is unauthenticated (30/min per IP) and looked a
 * code up by scanning every document in `logs`, every user's meals and water
 * included. A logging_streak challenge's progress scanned all of `plans` and
 * all of `logs` once per day per member, so a 90-day challenge cost about 180
 * full scans per member on every read. These pin that each read is filed in
 * an index; whereIndexed re-checks the predicate, so the indexes can only
 * make these reads slower if wrong, never different.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  JsonStore,
  LOGS_BY_CHALLENGE_CODE,
  PLANS_BY_USER_TYPE_DATE,
  indexKey,
} from '../platform/store';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-challenge-idx-'));
const store = new JsonStore(dir);

afterAll(async () => {
  await store.flush();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('challenge indexes', () => {
  it('files a buddy challenge under its code, and nothing else there', () => {
    store.upsert('logs', { id: 'bc-1', type: 'buddyChallenge', code: 'AZF-ABC234', userId: 'u1' });
    store.upsert('logs', { id: 'ml-1', type: 'mealLog', userId: 'u1', localDate: '2026-11-12' });
    expect(store.indexedIds('logs', LOGS_BY_CHALLENGE_CODE, indexKey('AZF-ABC234'))).toEqual(['bc-1']);
    expect(store.indexedIds('logs', LOGS_BY_CHALLENGE_CODE, indexKey('AZF-ZZZ999'))).toEqual([]);
  });

  it("files a workout session under its user's day", () => {
    store.upsert('plans', {
      id: 'ws-1',
      type: 'workoutSession',
      userId: 'u1',
      localDate: '2026-11-12',
      status: 'completed',
    });
    expect(
      store.indexedIds('plans', PLANS_BY_USER_TYPE_DATE, indexKey('u1', 'workoutSession', '2026-11-12')),
    ).toEqual(['ws-1']);
  });
});
