/**
 * Logging service (AQF-09 food module): meal CRUD with deterministic totals,
 * water increments, weight upsert per local date (AQF-06 §4), and the
 * Idempotency-Key mechanism so a retry never duplicates a log (AQF-09 §5).
 */
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { MealLog, MealLogItem, MealType, WaterLog, WeightLog } from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import {
  LOGS_BY_USER_TYPE,
  LOGS_BY_USER_TYPE_DATE,
  getStore,
  indexKey,
  newId,
} from '../../platform/store';
import { addDays } from '../../platform/dates';

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function totalsOf(items: MealLogItem[]): {
  totalKcal: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
} {
  return {
    totalKcal: round1(items.reduce((s, i) => s + i.kcal, 0)),
    totalProteinG: round1(items.reduce((s, i) => s + i.proteinG, 0)),
    totalCarbsG: round1(items.reduce((s, i) => s + i.carbsG, 0)),
    totalFatG: round1(items.reduce((s, i) => s + i.fatG, 0)),
  };
}

// ----- idempotency (24h replay window, AQF-07 §1) -----

interface IdempotencyDoc {
  id: string;
  type: 'idempotency';
  userId: string;
  status: number;
  body: unknown;
  createdAt: string;
  expiresAt: string;
}

const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;

function idempotencyId(userId: string, req: Request, key: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${userId}:${req.method}:${req.path}:${key}`)
    .digest('hex')
    .slice(0, 32);
  return `idem-${digest}`;
}

/**
 * Wraps a creation handler: when the client supplies an Idempotency-Key that
 * was already used for this route, the original response is replayed.
 */
export function withIdempotency(
  req: Request,
  res: Response,
  userId: string,
  create: () => { status: number; body: unknown },
): void {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length === 0) {
    const out = create();
    res.status(out.status).json(out.body);
    return;
  }
  const store = getStore();
  const id = idempotencyId(userId, req, key);
  const existing = store.byId<IdempotencyDoc>('logs', id);
  if (existing && new Date(existing.expiresAt).getTime() > Date.now()) {
    res.status(existing.status).setHeader('Idempotency-Replayed', 'true').json(existing.body);
    return;
  }
  const out = create();
  const now = Date.now();
  store.upsert<IdempotencyDoc>('logs', {
    id,
    type: 'idempotency',
    userId,
    status: out.status,
    body: out.body,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + IDEMPOTENCY_TTL_MS).toISOString(),
  });
  res.status(out.status).json(out.body);
}

/**
 * Delete replay records whose 24h window has closed.
 *
 * These are written on every idempotent create and nothing removed them, so
 * they accumulated forever in the `logs` container — permanently, since the
 * store never forgets a document it has hydrated. Two costs, both real: the
 * container grows without bound in memory and in Postgres, and (before the
 * secondary indexes) every meal, water and weight query scanned all of them.
 *
 * `expiresAt` is always an ISO-8601 UTC string produced by toISOString(), so
 * every value has the same length, offset and field order and a lexicographic
 * comparison is a chronological one. The boundary matches the read path in
 * withIdempotency, which replays only while `expiresAt > now`: a record at
 * exactly `now` is already unusable, so sweeping it deletes nothing live.
 *
 * Returns the number removed.
 */
export function sweepIdempotencyRecords(now = new Date()): number {
  const cutoff = now.toISOString();
  return getStore().deleteWhere<IdempotencyDoc>(
    'logs',
    (d) => d.type === 'idempotency' && d.expiresAt <= cutoff,
  );
}

// ----- meal logs -----

export function createMealLog(
  userId: string,
  input: {
    mealType: MealType;
    items: MealLogItem[];
    loggedAt?: string;
    localDate: string;
  },
  source: MealLog['source'] = 'manual',
): MealLog {
  const log: MealLog = {
    id: newId('ml'),
    userId,
    type: 'mealLog',
    mealType: input.mealType,
    items: input.items,
    ...totalsOf(input.items),
    source,
    loggedAt: input.loggedAt ?? new Date().toISOString(),
    localDate: input.localDate,
  };
  getStore().upsert('logs', log);
  return log;
}

export function getMealLog(userId: string, id: string): MealLog {
  const log = getStore().byId<MealLog>('logs', id);
  if (!log || log.type !== 'mealLog' || log.userId !== userId) {
    throw new AppError('NOT_FOUND', 'Meal log not found');
  }
  return log;
}

export function updateMealLog(
  userId: string,
  id: string,
  patch: { mealType?: MealType; items?: MealLogItem[]; loggedAt?: string; localDate?: string },
): MealLog {
  const existing = getMealLog(userId, id);
  const items = patch.items ?? existing.items;
  const updated: MealLog = {
    ...existing,
    mealType: patch.mealType ?? existing.mealType,
    items,
    ...totalsOf(items),
    loggedAt: patch.loggedAt ?? existing.loggedAt,
    localDate: patch.localDate ?? existing.localDate,
  };
  getStore().upsert('logs', updated);
  return updated;
}

export function deleteMealLog(userId: string, id: string): void {
  getMealLog(userId, id); // ownership check
  getStore().delete('logs', id);
}

/**
 * One user's meals on one local date.
 *
 * Indexed rather than scanned. The `logs` container holds every meal, water,
 * weight, workout-session, buddy-challenge and idempotency record for EVERY
 * user, so the predicate form of this walked the lot to find one person's
 * breakfast. The predicate is still passed and still decides the answer — see
 * MemoryBackedStore.whereIndexed — so this cannot return anything the scan
 * would not have.
 *
 * The sort key is unchanged. Only the tie-break between two logs written in
 * the same millisecond can differ from the scan's, because the candidates
 * arrive in index-bucket order rather than container-insertion order; both are
 * arbitrary and neither is part of the contract.
 */
export function mealLogsForDate(userId: string, localDate: string): MealLog[] {
  return getStore()
    .whereIndexed<MealLog>(
      'logs',
      LOGS_BY_USER_TYPE_DATE,
      indexKey(userId, 'mealLog', localDate),
      (d) => d.type === 'mealLog' && d.userId === userId && d.localDate === localDate,
    )
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}

export function groupMeals(logs: MealLog[]): Record<MealType, MealLog[]> {
  const grouped: Record<MealType, MealLog[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const log of logs) grouped[log.mealType].push(log);
  return grouped;
}

// ----- water logs -----

export function createWaterLog(
  userId: string,
  input: { amountMl: number; localDate: string },
): { log: WaterLog; dayTotalMl: number } {
  const log: WaterLog = {
    id: newId('wtr'),
    userId,
    type: 'waterLog',
    amountMl: input.amountMl,
    loggedAt: new Date().toISOString(),
    localDate: input.localDate,
  };
  getStore().upsert('logs', log);
  return { log, dayTotalMl: waterTotalForDate(userId, input.localDate) };
}

/** Same exact-match index as mealLogsForDate, different record type. */
export function waterTotalForDate(userId: string, localDate: string): number {
  return getStore()
    .whereIndexed<WaterLog>(
      'logs',
      LOGS_BY_USER_TYPE_DATE,
      indexKey(userId, 'waterLog', localDate),
      (d) => d.type === 'waterLog' && d.userId === userId && d.localDate === localDate,
    )
    .reduce((s, l) => s + l.amountMl, 0);
}

// ----- weight logs (one canonical entry per user per local date) -----

export const weightLogId = (userId: string, localDate: string): string =>
  `wl-${userId}-${localDate}`;

export function upsertWeightLog(
  userId: string,
  input: { weightKg: number; note?: string; localDate: string },
): WeightLog {
  const store = getStore();
  const id = weightLogId(userId, input.localDate);
  const existing = store.byId<WeightLog>('logs', id);
  const log: WeightLog = {
    id,
    userId,
    type: 'weightLog',
    weightKg: input.weightKg,
    note: input.note ?? existing?.note,
    loggedAt: new Date().toISOString(),
    localDate: input.localDate,
  };
  store.upsert('logs', log);
  return log;
}

/**
 * One user's weight entries between two local dates, inclusive.
 *
 * This is a RANGE query, and the exact-match composite index cannot serve it:
 * probing it would mean enumerating every date between the bounds, which is
 * wrong for a wide window and impossible for an open-ended one. So it uses the
 * coarser userId+type index and scans that bucket — one entry per day the user
 * has ever weighed in, rather than every log row in the deployment. The date
 * comparison stays exactly where it was, in the predicate.
 */
export function weightLogsInRange(userId: string, fromDate: string, toDate: string): WeightLog[] {
  return getStore()
    .whereIndexed<WeightLog>(
      'logs',
      LOGS_BY_USER_TYPE,
      indexKey(userId, 'weightLog'),
      (d) =>
        d.type === 'weightLog' &&
        d.userId === userId &&
        d.localDate >= fromDate &&
        d.localDate <= toDate,
    )
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export function copyPreviousDayMealLogs(
  userId: string,
  targetDate: string,
): { copiedCount: number; date: string; sourceDate: string; logs: MealLog[] } {
  const sourceDate = addDays(targetDate, -1);
  const previousLogs = mealLogsForDate(userId, sourceDate);
  const copiedLogs: MealLog[] = [];

  for (const log of previousLogs) {
    const newLog = createMealLog(
      userId,
      {
        mealType: log.mealType,
        items: log.items.map((i) => ({ ...i })),
        localDate: targetDate,
      },
      'manual',
    );
    copiedLogs.push(newLog);
  }

  return {
    copiedCount: copiedLogs.length,
    date: targetDate,
    sourceDate,
    logs: copiedLogs,
  };
}

