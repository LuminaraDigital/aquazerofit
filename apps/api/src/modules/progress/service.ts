/**
 * ProgressService + AchievementEngine (AQF-09 §1 progress module).
 * Streak = consecutive local dates with any activity (meal/water/weight log
 * or completed workout) ending today or yesterday. Achievements are evaluated
 * deterministically against the seeded definitions.
 */
import type {
  AchievementDefinition,
  MealLog,
  ProgressSummary,
  WaterLog,
  WeightLog,
  WorkoutSession,
} from '@aquazerofit/shared';
import { getStore } from '../../platform/store';
import { addDays } from '../../platform/dates';
import { getProfile } from '../me/service';

interface UserActivity {
  meals: MealLog[];
  waters: WaterLog[];
  weights: WeightLog[];
  completedSessions: WorkoutSession[];
}

function loadActivity(userId: string): UserActivity {
  const store = getStore();
  return {
    meals: store
      .where<MealLog>('logs', (d) => d.type === 'mealLog' && d.userId === userId)
      .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
    waters: store.where<WaterLog>('logs', (d) => d.type === 'waterLog' && d.userId === userId),
    weights: store
      .where<WeightLog>('logs', (d) => d.type === 'weightLog' && d.userId === userId)
      .sort((a, b) => a.localDate.localeCompare(b.localDate)),
    completedSessions: store
      .where<WorkoutSession>(
        'plans',
        (d) => d.type === 'workoutSession' && d.userId === userId && d.status === 'completed',
      )
      .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '')),
  };
}

export function computeStreak(activity: UserActivity, today: string): number {
  const activeDates = new Set<string>();
  for (const l of activity.meals) activeDates.add(l.localDate);
  for (const l of activity.waters) activeDates.add(l.localDate);
  for (const l of activity.weights) activeDates.add(l.localDate);
  for (const s of activity.completedSessions) activeDates.add(s.localDate);

  // Streak survives an incomplete "today": start counting from today when
  // active, otherwise from yesterday.
  let cursor = activeDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function evaluateAchievement(
  def: AchievementDefinition,
  activity: UserActivity,
  streakDays: number,
  hasProfile: boolean,
  profileUpdatedAt: string | undefined,
  today: string,
): string | null {
  const rule = def.rule;
  switch (rule.kind) {
    case 'firstAction': {
      if (rule.action === 'mealLog') return activity.meals[0]?.loggedAt ?? null;
      if (rule.action === 'weightLog') return activity.weights[0]?.loggedAt ?? null;
      if (rule.action === 'workout')
        return activity.completedSessions[0]?.completedAt ?? null;
      return hasProfile ? (profileUpdatedAt ?? new Date().toISOString()) : null;
    }
    case 'mealsLogged': {
      const nth = activity.meals[rule.count - 1];
      return nth ? nth.loggedAt : null;
    }
    case 'workoutsCompleted': {
      const nth = activity.completedSessions[rule.count - 1];
      return nth ? (nth.completedAt ?? null) : null;
    }
    case 'streak': {
      // Current streak only — historical streaks are not tracked separately.
      return streakDays >= rule.days ? `${today}T00:00:00.000Z` : null;
    }
    case 'weightLoss': {
      const first = activity.weights[0];
      if (!first) return null;
      // Earned on the first weigh-in at or below (start - kg).
      const hit = activity.weights.find((w) => first.weightKg - w.weightKg >= rule.kg);
      return hit ? hit.loggedAt : null;
    }
    default:
      return null;
  }
}

export function getProgressSummary(userId: string, today: string): ProgressSummary {
  const store = getStore();
  const activity = loadActivity(userId);
  const profile = getProfile(userId);
  const streakDays = computeStreak(activity, today);

  const definitions = store
    .where<AchievementDefinition>('content', (d) => d.type === 'achievementDefinition')
    .sort((a, b) => a.id.localeCompare(b.id));

  const first = activity.weights[0];
  const latest = activity.weights[activity.weights.length - 1];

  return {
    currentWeightKg: latest?.weightKg ?? profile?.weightKg ?? null,
    startWeightKg: first?.weightKg ?? profile?.weightKg ?? null,
    targetWeightKg: profile?.targetWeightKg ?? null,
    weightSeries: activity.weights.map((w) => ({ date: w.localDate, value: w.weightKg })),
    streakDays,
    workoutsCompleted: activity.completedSessions.length,
    totalKcalBurned: Math.round(
      activity.completedSessions.reduce((s, w) => s + (w.kcalBurned ?? 0), 0),
    ),
    achievements: definitions.map((definition) => ({
      definition,
      earnedAt: evaluateAchievement(
        definition,
        activity,
        streakDays,
        profile !== undefined,
        profile?.updatedAt,
        today,
      ),
    })),
  };
}
