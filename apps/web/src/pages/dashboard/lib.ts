/**
 * Nutrition/dashboard-facing helpers. Date and number formatting live in
 * `@/lib/format` (SSOT); this module keeps meal labels and defensive unwraps.
 */
import type { MealRecommendation, MealType, PublicUser, WorkoutSession } from '@aquazerofit/shared';

export {
  todayLocalDate,
  shiftLocalDate,
  addDays,
  formatLocalDate,
  formatShortDate,
  round1,
  fmtInt,
} from '@/lib/format';

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
