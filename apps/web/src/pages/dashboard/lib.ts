/**
 * Small date/format/normalise helpers local to the nutrition-facing pages.
 * Kept here (dashboard-owned) so Dashboard + nutrition pages share one copy.
 */
import type { MealRecommendation, MealType, PublicUser, WorkoutSession } from '@aquazerofit/shared';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const MEAL_ICON: Record<MealType, string> = {
  breakfast: 'bakery_dining',
  lunch: 'lunch_dining',
  dinner: 'dinner_dining',
  snack: 'cookie',
};

/** Today's date in the user's local timezone as YYYY-MM-DD. */
export function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Shift a YYYY-MM-DD local date by a number of days. */
export function shiftLocalDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** "Tuesday, 29 July" style label for a YYYY-MM-DD local date. */
export function formatLocalDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Short "Tue 29" label. */
export function formatShortDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Best-guess meal type for the current time of day. */
export function mealTypeForNow(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

/** Idempotency key for one-tap log mutations. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Integer with thousands separator for kcal-style displays. */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function clampPct(consumed: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((consumed / target) * 100)));
}

// ---------- defensive response normalisers (envelope shape may vary) ----------

export function asUser(raw: unknown): PublicUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.displayName === 'string') return raw as PublicUser;
  if (o.user && typeof o.user === 'object') return o.user as PublicUser;
  return null;
}

export function asWorkoutSession(raw: unknown): WorkoutSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if ('session' in o) return (o.session as WorkoutSession | null) ?? null;
  if ('exercises' in o && 'focus' in o) return raw as WorkoutSession;
  return null;
}

export type RecommendationWithRecipe = MealRecommendation & { recipeId?: string | null };

export function asRecommendation(raw: unknown): RecommendationWithRecipe | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name === 'string' && typeof o.kcal === 'number')
    return raw as RecommendationWithRecipe;
  if (o.recommendation && typeof o.recommendation === 'object')
    return o.recommendation as RecommendationWithRecipe;
  return null;
}

/** Rough duration estimate (minutes) when a session has no explicit duration. */
export function estimateDurationMinutes(session: WorkoutSession): number {
  if (session.durationMinutes) return session.durationMinutes;
  const totalSets = session.exercises.reduce((acc, e) => acc + e.setsPlanned, 0);
  return Math.max(15, Math.round(totalSets * 2.5));
}
