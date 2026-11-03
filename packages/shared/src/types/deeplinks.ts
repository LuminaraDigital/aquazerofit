/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

import type { MealType } from './enums';

// ---------- deep links & export ----------

export type DeepLinkAction =
  | 'log_meal'
  | 'view_date'
  | 'join_challenge'
  | 'coach_ask'
  | 'export_data';

export type ExportFormat = 'json' | 'csv';

export interface DeepLinkPayload {
  action: DeepLinkAction;
  mealType?: MealType;
  date?: string;
  challengeCode?: string;
  prompt?: string;
  format?: ExportFormat;
  params?: Record<string, string | number | boolean | null>;
}

export interface DiaryExportPayload {
  userId?: string;
  startDate?: string;
  endDate?: string;
  format: ExportFormat;
  includeMeals?: boolean;
  includeWater?: boolean;
  includeWorkouts?: boolean;
  includeWeight?: boolean;
  exportedAt?: string;
}
