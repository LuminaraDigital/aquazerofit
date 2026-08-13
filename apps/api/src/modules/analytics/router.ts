/**
 * /analytics/nutrition - daily ring DTO and trend series (AQF-07 §3.3).
 * Pure aggregation over the logs container; all arithmetic is deterministic.
 * Also hosts growth telemetry (share / invite / challenge events).
 */
import { Router } from 'express';
import {
  GROWTH_EVENT_RETENTION_DAYS,
  dateQuerySchema,
  growthEventSchema,
  rangeQuerySchema,
  type DailyNutrition,
  type GrowthEvent,
  type TrendPoint,
  type WorkoutSession,
} from '@aquazerofit/shared';
import { requireAuth, userIdOf, verifyAccess } from '../../platform/auth';
import { getStore, newId } from '../../platform/store';
import {
  ANON_IP_EVENT_BUDGET_PER_HOUR,
  EVENT_BUDGET_PER_HOUR,
  consumeEventBudget,
} from './eventBudget';
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

/**
 * Growth events may fire before auth (invite capture on landing) or after.
 * Auth is optional: attach userId when a Bearer token is present.
 */
analyticsRouter.post('/events', (req, res, next) => {
  try {
    const input = growthEventSchema.parse(req.body);
    let userId: string | null = null;
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      try {
        userId = verifyAccess(header.slice(7)).id;
      } catch {
        userId = null;
      }
    }
    // Hourly storage budget (eventBudget.ts). Over-budget events are
    // acknowledged but never persisted: the 202 is shaped identically to a
    // stored write so the budget cannot be probed from outside, and the web
    // client fires these without reading the body back.
    const budgetKey = userId ? `user:${userId}` : `ip:${req.ip ?? 'unknown'}`;
    const budgetLimit = userId ? EVENT_BUDGET_PER_HOUR : ANON_IP_EVENT_BUDGET_PER_HOUR;
    if (!consumeEventBudget(budgetKey, budgetLimit)) {
      res.status(202).json({ ok: true, id: newId('gev') });
      return;
    }

    const event: GrowthEvent = {
      type: 'growthEvent',
      id: newId('gev'),
      userId,
      name: input.name,
      props: input.props,
      attribution: {
        ref: input.attribution.ref ?? null,
        utmSource: input.attribution.utmSource ?? null,
        utmMedium: input.attribution.utmMedium ?? null,
        utmCampaign: input.attribution.utmCampaign ?? null,
        challengeCode: input.attribution.challengeCode ?? null,
      },
      createdAt: new Date().toISOString(),
    };
    getStore().upsert('audit', event);
    res.status(202).json({ ok: true, id: event.id });
  } catch (err) {
    next(err);
  }
});

/**
 * Growth-event retention sweep. This is the only unauthenticated write in the
 * API, so its records need an expiry or the audit container grows for as long
 * as the deployment lives. Scheduled on boot and every 6 hours from index.ts.
 * Returns the number of events removed.
 */
export function sweepGrowthEvents(now = new Date()): number {
  const cutoff = new Date(
    now.getTime() - GROWTH_EVENT_RETENTION_DAYS * 24 * 3600 * 1000,
  ).toISOString();
  return getStore().deleteWhere<GrowthEvent>(
    'audit',
    (d) => d.type === 'growthEvent' && d.createdAt < cutoff,
  );
}

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
