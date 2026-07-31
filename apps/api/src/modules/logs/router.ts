/**
 * Logging routes: /meal-logs, /water-logs, /weight-logs (AQF-07 §3.2/3.3).
 * localDate falls back to the X-Timezone header's "today" when omitted.
 */
import { Router } from 'express';
import {
  createMealLogSchema,
  dateQuerySchema,
  rangeQuerySchema,
  updateMealLogSchema,
  waterLogSchema,
  weightLogSchema,
} from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { addDays, rangeToDays, todayFor } from '../../platform/dates';
import {
  createMealLog,
  createWaterLog,
  deleteMealLog,
  groupMeals,
  mealLogsForDate,
  totalsOf,
  updateMealLog,
  upsertWeightLog,
  waterTotalForDate,
  weightLogsInRange,
  withIdempotency,
} from './service';

export const logsRouter = Router();
logsRouter.use(requireAuth);

/** Inject localDate from the client's timezone when the body omits it. */
function withLocalDate<T extends { localDate?: unknown }>(body: T, fallback: string): T {
  if (typeof body !== 'object' || body === null) return { localDate: fallback } as T;
  return { ...body, localDate: body.localDate ?? fallback };
}

// ----- meal logs -----

logsRouter.post('/meal-logs', (req, res) => {
  const userId = userIdOf(req);
  const input = createMealLogSchema.parse(withLocalDate(req.body ?? {}, todayFor(req)));
  withIdempotency(req, res, userId, () => ({
    status: 201,
    body: { log: createMealLog(userId, input) },
  }));
});

logsRouter.get('/meal-logs', (req, res) => {
  const userId = userIdOf(req);
  const date =
    typeof req.query.date === 'string' && req.query.date.length > 0
      ? dateQuerySchema.parse({ date: req.query.date }).date
      : todayFor(req);
  const logs = mealLogsForDate(userId, date);
  res.json({
    date,
    meals: groupMeals(logs),
    totals: totalsOf(logs.flatMap((l) => l.items)),
  });
});

logsRouter.put('/meal-logs/:id', (req, res) => {
  const patch = updateMealLogSchema.parse(req.body ?? {});
  res.json({ log: updateMealLog(userIdOf(req), req.params.id, patch) });
});

logsRouter.delete('/meal-logs/:id', (req, res) => {
  deleteMealLog(userIdOf(req), req.params.id);
  res.status(204).end();
});

// ----- water logs -----

logsRouter.post('/water-logs', (req, res) => {
  const userId = userIdOf(req);
  const input = waterLogSchema.parse(withLocalDate(req.body ?? {}, todayFor(req)));
  withIdempotency(req, res, userId, () => ({
    status: 201,
    body: createWaterLog(userId, input),
  }));
});

logsRouter.get('/water-logs', (req, res) => {
  const userId = userIdOf(req);
  const date =
    typeof req.query.date === 'string' && req.query.date.length > 0
      ? dateQuerySchema.parse({ date: req.query.date }).date
      : todayFor(req);
  res.json({ date, totalMl: waterTotalForDate(userId, date) });
});

// ----- weight logs -----

logsRouter.post('/weight-logs', (req, res) => {
  const userId = userIdOf(req);
  const input = weightLogSchema.parse(withLocalDate(req.body ?? {}, todayFor(req)));
  withIdempotency(req, res, userId, () => ({
    status: 201,
    body: { log: upsertWeightLog(userId, input) },
  }));
});

logsRouter.get('/weight-logs', (req, res) => {
  const userId = userIdOf(req);
  const { range } = rangeQuerySchema.parse(req.query);
  const today = todayFor(req);
  const from = addDays(today, -(rangeToDays(range) - 1));
  const logs = weightLogsInRange(userId, from, today);
  res.json({
    range,
    points: logs.map((l) => ({ date: l.localDate, value: l.weightKg })),
    logs,
  });
});
