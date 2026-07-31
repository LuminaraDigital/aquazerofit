/**
 * /analytics/nutrition — daily ring DTO and trend series (AQF-07 §3.3).
 * Pure aggregation over the logs container; all arithmetic is deterministic.
 */
import { Router } from 'express';
import {
  dateQuerySchema,
  rangeQuerySchema,
  type DailyNutrition,
  type TrendPoint,
  type WorkoutSession,
} from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { getStore } from '../../platform/store';
import { lastNDates, rangeToDays, todayFor } from '../../platform/dates';
import { getTargets } from '../me/service';
import {
  groupMeals,
  mealLogsForDate,
  waterTotalForDate,
  weightLogsInRange,
} from '../logs/service';

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function kcalBurnedForDate(userId: string, localDate: string): number {
  return getStore()
    .where<WorkoutSession>(
      'plans',
      (d) =>
        d.type === 'workoutSession' &&
        d.userId === userId &&
        d.localDate === localDate &&
        d.status === 'completed',
    )
    .reduce((s, w) => s + (w.kcalBurned ?? 0), 0);
}

export function dailyNutrition(userId: string, date: string): DailyNutrition {
  const targets = getTargets(userId);
  const logs = mealLogsForDate(userId, date);
  const kcalConsumed = round1(logs.reduce((s, l) => s + l.totalKcal, 0));
  const kcalBurned = round1(kcalBurnedForDate(userId, date));
  const kcalNet = round1(kcalConsumed - kcalBurned);
  return {
    date,
    kcalTarget: targets.kcalTarget,
    kcalConsumed,
    kcalBurned,
    kcalNet,
    kcalRemaining: round1(targets.kcalTarget - kcalNet),
    proteinG: {
      consumed: round1(logs.reduce((s, l) => s + l.totalProteinG, 0)),
      target: targets.proteinG,
    },
    carbsG: {
      consumed: round1(logs.reduce((s, l) => s + l.totalCarbsG, 0)),
      target: targets.carbsG,
    },
    fatG: {
      consumed: round1(logs.reduce((s, l) => s + l.totalFatG, 0)),
      target: targets.fatG,
    },
    waterMl: {
      consumed: waterTotalForDate(userId, date),
      target: targets.waterMl,
    },
    meals: groupMeals(logs),
  };
}

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

analyticsRouter.get('/nutrition/daily', (req, res) => {
  const userId = userIdOf(req);
  const date =
    typeof req.query.date === 'string' && req.query.date.length > 0
      ? dateQuerySchema.parse({ date: req.query.date }).date
      : todayFor(req);
  res.json(dailyNutrition(userId, date));
});

analyticsRouter.get('/nutrition/trends', (req, res) => {
  const userId = userIdOf(req);
  const { range } = rangeQuerySchema.parse(req.query);
  const today = todayFor(req);
  const dates = lastNDates(today, rangeToDays(range));

  const kcal: TrendPoint[] = [];
  const proteinG: TrendPoint[] = [];
  const carbsG: TrendPoint[] = [];
  const fatG: TrendPoint[] = [];
  for (const date of dates) {
    const logs = mealLogsForDate(userId, date);
    kcal.push({ date, value: round1(logs.reduce((s, l) => s + l.totalKcal, 0)) });
    proteinG.push({ date, value: round1(logs.reduce((s, l) => s + l.totalProteinG, 0)) });
    carbsG.push({ date, value: round1(logs.reduce((s, l) => s + l.totalCarbsG, 0)) });
    fatG.push({ date, value: round1(logs.reduce((s, l) => s + l.totalFatG, 0)) });
  }

  const weight: TrendPoint[] = weightLogsInRange(userId, dates[0]!, today).map((l) => ({
    date: l.localDate,
    value: l.weightKg,
  }));

  res.json({ range, kcal, weight, macros: { proteinG, carbsG, fatG } });
});
