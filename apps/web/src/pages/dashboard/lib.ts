/**
 * Nutrition/dashboard-facing helpers. Date and number formatting live in
 * `@/lib/format` (SSOT); this module keeps meal labels and defensive unwraps.
 */
import type { MealRecommendation, MealType, PublicUser, WorkoutSession } from '@aquazerofit/shared';
import { estimateSessionMinutes } from '@/lib/workoutEstimate';

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

/**
 * Meal slot for a local hour.
 *
 * Breakfast is the morning, not the small hours. 1:30am is a snack. The
 * Android client uses the same boundaries.
 */
export function mealTypeForHour(hour: number): MealType {
  if (hour < 5 || hour >= 21) return 'snack';
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 17) return 'snack';
  return 'dinner';
}

/** Best-guess meal type for the current local time. */
export function mealTypeForNow(now: Date = new Date()): MealType {
  return mealTypeForHour(now.getHours());
}

/** Someone who has logged before today should not be told to log a first meal. */
export function hasLoggingHistory(
  progress:
    | {
        consistency?: { lastActiveDate?: string | null; activeDays?: number } | null;
        workoutsCompleted?: number;
        currentWeightKg?: number | null;
      }
    | null
    | undefined,
): boolean {
  if (!progress) return false;
  if (progress.consistency?.lastActiveDate) return true;
  if ((progress.consistency?.activeDays ?? 0) > 0) return true;
  if ((progress.workoutsCompleted ?? 0) > 0) return true;
  return progress.currentWeightKg != null;
}

export function homeNextStep(showFirstMeal: boolean): { title: string; body: string } {
  if (showFirstMeal) {
    return {
      title: 'Log your first meal',
      body: 'Search a food, scan a barcode, or photograph your plate. One log unlocks the rest of today’s targets.',
    };
  }
  return {
    title: 'Nothing logged today',
    body: 'Log a meal to bring today’s targets up to date. Search a food, scan a barcode, or photograph your plate.',
  };
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

/** Session length. Home and Workouts share `estimateSessionMinutes`. */
export function estimateDurationMinutes(session: WorkoutSession): number {
  return estimateSessionMinutes(session);
}
