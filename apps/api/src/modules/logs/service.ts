/**
 * Logging service (AQF-09 food module): meal CRUD with deterministic totals,
 * water increments, weight upsert per local date (AQF-06 §4), and the
 * Idempotency-Key mechanism so a retry never duplicates a log (AQF-09 §5).
 */
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { MealLog, MealLogItem, MealType, WaterLog, WeightLog } from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { getStore, newId } from '../../platform/store';

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

export function mealLogsForDate(userId: string, localDate: string): MealLog[] {
  return getStore()
    .where<MealLog>(
      'logs',
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

export function waterTotalForDate(userId: string, localDate: string): number {
  return getStore()
    .where<WaterLog>(
      'logs',
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

export function weightLogsInRange(userId: string, fromDate: string, toDate: string): WeightLog[] {
  return getStore()
    .where<WeightLog>(
      'logs',
      (d) =>
        d.type === 'weightLog' &&
        d.userId === userId &&
        d.localDate >= fromDate &&
        d.localDate <= toDate,
    )
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
}
