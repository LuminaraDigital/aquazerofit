/**
 * Export module router (AQF-07 §3).
 * Exports user nutrition logs, macro totals, micronutrients, and hydration data
 * in JSON or CSV format based on format query param ('json' | 'csv').
 */
import { Router } from 'express';
import { z } from 'zod';
import type { MealLog, MealLogItem, WaterLog } from '@aquazerofit/shared';
import { exportFormatSchema, localDateSchema } from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { getStore } from '../../platform/store';

export const exportRouter = Router();
exportRouter.use(requireAuth);

const exportQuerySchema = z.object({
  format: z
    .preprocess(
      (val) => (typeof val === 'string' ? val.toLowerCase() : val),
      exportFormatSchema,
    )
    .default('json'),
  startDate: localDateSchema.optional(),
  endDate: localDateSchema.optional(),
  date: localDateSchema.optional(),
});

const round1 = (n: number): number => Math.round(n * 10) / 10;

function escapeCsv(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

exportRouter.get('/diary', (req, res) => {
  const userId = userIdOf(req);
  const { format, startDate, endDate, date } = exportQuerySchema.parse(req.query);

  const store = getStore();

  let mealLogs = store
    .where<MealLog>(
      'logs',
      (d) => d.type === 'mealLog' && d.userId === userId,
    )
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.loggedAt.localeCompare(b.loggedAt));

  let waterLogs = store
    .where<WaterLog>(
      'logs',
      (d) => d.type === 'waterLog' && d.userId === userId,
    )
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.loggedAt.localeCompare(b.loggedAt));

  if (date) {
    mealLogs = mealLogs.filter((l) => l.localDate === date);
    waterLogs = waterLogs.filter((w) => w.localDate === date);
  } else {
    if (startDate) {
      mealLogs = mealLogs.filter((l) => l.localDate >= startDate);
      waterLogs = waterLogs.filter((w) => w.localDate >= startDate);
    }
    if (endDate) {
      mealLogs = mealLogs.filter((l) => l.localDate <= endDate);
      waterLogs = waterLogs.filter((w) => w.localDate <= endDate);
    }
  }

  const allItems: MealLogItem[] = mealLogs.flatMap((l) => l.items);

  const totals = {
    totalKcal: round1(allItems.reduce((s, i) => s + (i.kcal || 0), 0)),
    totalProteinG: round1(allItems.reduce((s, i) => s + (i.proteinG || 0), 0)),
    totalCarbsG: round1(allItems.reduce((s, i) => s + (i.carbsG || 0), 0)),
    totalFatG: round1(allItems.reduce((s, i) => s + (i.fatG || 0), 0)),
    totalFiberG: round1(allItems.reduce((s, i) => s + (i.fiberG || 0), 0)),
    totalSugarG: round1(allItems.reduce((s, i) => s + (i.sugarG || 0), 0)),
    totalSodiumMg: round1(allItems.reduce((s, i) => s + (i.sodiumMg || 0), 0)),
    totalPotassiumMg: round1(allItems.reduce((s, i) => s + (i.potassiumMg || 0), 0)),
    totalCalciumMg: round1(allItems.reduce((s, i) => s + (i.calciumMg || 0), 0)),
    totalIronMg: round1(allItems.reduce((s, i) => s + (i.ironMg || 0), 0)),
    totalWaterMl: waterLogs.reduce((s, w) => s + w.amountMl, 0),
  };

  if (format === 'csv') {
    const headers = [
      'Date',
      'Entry Type',
      'Meal Type',
      'Item Name',
      'Grams',
      'Calories (kcal)',
      'Protein (g)',
      'Carbs (g)',
      'Fat (g)',
      'Fiber (g)',
      'Sugar (g)',
      'Sodium (mg)',
      'Potassium (mg)',
      'Calcium (mg)',
      'Iron (mg)',
      'Hydration (ml)',
    ].join(',');

    const rows: string[] = [headers];

    for (const log of mealLogs) {
      for (const item of log.items) {
        const row = [
          escapeCsv(log.localDate),
          escapeCsv('meal'),
          escapeCsv(log.mealType),
          escapeCsv(item.name),
          item.grams ?? 0,
          item.kcal ?? 0,
          item.proteinG ?? 0,
          item.carbsG ?? 0,
          item.fatG ?? 0,
          item.fiberG ?? 0,
          item.sugarG ?? 0,
          item.sodiumMg ?? 0,
          item.potassiumMg ?? 0,
          item.calciumMg ?? 0,
          item.ironMg ?? 0,
          0,
        ].join(',');
        rows.push(row);
      }
    }

    for (const w of waterLogs) {
      const row = [
        escapeCsv(w.localDate),
        escapeCsv('water'),
        escapeCsv(''),
        escapeCsv('Water'),
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        w.amountMl,
      ].join(',');
      rows.push(row);
    }

    const csvContent = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="diary-export.csv"');
    res.status(200).send(csvContent);
    return;
  }

  res.json({
    exportedAt: new Date().toISOString(),
    userId,
    format: 'json',
    totals,
    mealLogs,
    waterLogs,
  });
});
