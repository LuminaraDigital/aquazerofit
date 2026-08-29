/**
 * ProgressService + AchievementEngine (AQF-09 §1 progress module).
 * Streak = consecutive local dates with any activity (meal/water/weight log
 * or completed workout) ending today or yesterday. Achievements are evaluated
 * deterministically against the seeded definitions.
 *
 * `streakDays` is kept because achievement thresholds are calibrated against
 * it, but it is no longer what the UI shows: a punishing counter that a single
 * missed day resets to zero contradicts AQF-11 §6. `computeConsistency` is the
 * user-facing model.
 */
import {
  CONSISTENCY_GRACE_DAYS,
  CONSISTENCY_STEADY_DAYS,
  CONSISTENCY_WINDOW_DAYS,
  type AchievementDefinition,
  type ConsistencyState,
  type ConsistencyStatus,
  type MealLog,
  type ProgressSummary,
  type WaterLog,
  type WeightLog,
  type WorkoutSession,
} from '@aquazerofit/shared';
import { getStore, indexKey, LOGS_BY_USER_TYPE } from '../../platform/store';
import { addDays } from '../../platform/dates';
import { getProfile } from '../me/service';

export interface UserActivity {
  meals: MealLog[];
  waters: WaterLog[];
  weights: WeightLog[];
  completedSessions: WorkoutSession[];
}

export function loadActivity(userId: string): UserActivity {
  const store = getStore();
  return {
    // Indexed rather than scanned. `logs` holds every meal, water, weight and
    // idempotency record for EVERY user, so each bare `where` here walked the
    // whole corpus — and this function runs on the dashboard, the coach roster
    // and the progress summary, three times over before the plans scan below.
    // whereIndexed re-applies the same predicate and falls back to a full scan
    // when the index is absent, so this is a speed change and cannot be a
    // correctness one.
    meals: store
      .whereIndexed<MealLog>(
        'logs',
        LOGS_BY_USER_TYPE,
        indexKey(userId, 'mealLog'),
        (d) => d.type === 'mealLog' && d.userId === userId,
      )
      .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
    waters: store.whereIndexed<WaterLog>(
      'logs',
      LOGS_BY_USER_TYPE,
      indexKey(userId, 'waterLog'),
      (d) => d.type === 'waterLog' && d.userId === userId,
    ),
    weights: store
      .whereIndexed<WeightLog>(
        'logs',
        LOGS_BY_USER_TYPE,
        indexKey(userId, 'weightLog'),
        (d) => d.type === 'weightLog' && d.userId === userId,
      )
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

/**
 * Deliberately duplicated from `computeStreak` rather than factored out of it:
 * `computeStreak` feeds the `streak` achievement rules and the chat tool, so
 * touching it would silently move earned thresholds for existing users.
 */
function activeDatesOf(activity: UserActivity): Set<string> {
  const activeDates = new Set<string>();
  for (const l of activity.meals) activeDates.add(l.localDate);
  for (const l of activity.waters) activeDates.add(l.localDate);
  for (const l of activity.weights) activeDates.add(l.localDate);
  for (const s of activity.completedSessions) activeDates.add(s.localDate);
  return activeDates;
}

/**
 * Missed days between two active dates, or null when the gap is wider than
 * `limit`. Stepping with `addDays` keeps the arithmetic on ISO strings; the
 * limit caps the walk so a year-long gap costs the same as a one-day one.
 */
function missedDaysBetween(earlier: string, later: string, limit: number): number | null {
  let cursor = earlier;
  for (let missed = 0; missed <= limit; missed += 1) {
    cursor = addDays(cursor, 1);
    if (cursor === later) return missed;
  }
  return null;
}

interface Run {
  days: number;
  graceUsed: number;
  /** Oldest active date in the run, or null when no run reaches `from`. */
  startDate: string | null;
}

/**
 * Walks backwards from `from`, absorbing up to CONSISTENCY_GRACE_DAYS missed
 * days across the whole run.
 *
 * Grace is only *charged* once it has bridged to another active day: the
 * trailing misses that end the walk fall outside the run, so a user with no
 * recent activity is not billed for grace they never used.
 */
function runEndingAt(activeDates: ReadonlySet<string>, from: string): Run {
  let cursor = from;
  let days = 0;
  let graceUsed = 0;
  let pendingGrace = 0;
  let startDate: string | null = null;

  for (;;) {
    if (activeDates.has(cursor)) {
      days += 1;
      graceUsed += pendingGrace;
      pendingGrace = 0;
      startDate = cursor;
    } else {
      if (graceUsed + pendingGrace + 1 > CONSISTENCY_GRACE_DAYS) break;
      pendingGrace += 1;
    }
    cursor = addDays(cursor, -1);
  }

  return { days, graceUsed, startDate };
}

/**
 * Longest grace-tolerant run anywhere in history. A run is any span of active
 * dates whose internal gaps total at most CONSISTENCY_GRACE_DAYS, so the
 * high-water mark is the widest such window — found by sliding one over the
 * sorted dates rather than re-walking from every endpoint.
 */
function longestRun(sortedDates: readonly string[]): number {
  const gapBefore: number[] = new Array<number>(sortedDates.length).fill(0);
  let start = 0;
  let gapSum = 0;
  let best = 0;

  for (let i = 0; i < sortedDates.length; i += 1) {
    if (i > 0) {
      const gap = missedDaysBetween(sortedDates[i - 1]!, sortedDates[i]!, CONSISTENCY_GRACE_DAYS);
      if (gap === null) {
        // Unbridgeable break: the next run starts here.
        start = i;
        gapSum = 0;
      } else {
        gapBefore[i] = gap;
        gapSum += gap;
        while (gapSum > CONSISTENCY_GRACE_DAYS) {
          start += 1;
          gapSum -= gapBefore[start]!;
        }
      }
    }
    best = Math.max(best, i - start + 1);
  }

  return best;
}

/**
 * The consistency figure the UI renders (AQF-11 §6). Unlike `computeStreak`,
 * nothing here can be reset to zero by a single missed day: grace absorbs it,
 * the window metric only ever counts effort, and `bestDays` is a high-water
 * mark. Pure over `activity` so it is cheap to test and cannot drift from the
 * store.
 */
export function computeConsistency(activity: UserActivity, today: string): ConsistencyStatus {
  const activeDates = activeDatesOf(activity);
  const sorted = [...activeDates].sort();
  const lastActiveDate = sorted[sorted.length - 1] ?? null;

  // Same concession as `computeStreak`: an incomplete today does not punish.
  const run = runEndingAt(activeDates, activeDates.has(today) ? today : addDays(today, -1));

  const windowStart = addDays(today, -(CONSISTENCY_WINDOW_DAYS - 1));
  const inWindow = sorted.filter((d) => d >= windowStart && d <= today);

  // The run has genuinely ended once the last active date sits further back
  // than grace can reach.
  const restingBefore = addDays(today, -(CONSISTENCY_GRACE_DAYS + 1));
  const resting = lastActiveDate === null || lastActiveDate < restingBefore;

  // They came back: activity inside the window that predates the current run.
  const runStart = run.startDate;
  const returned = runStart !== null && inWindow.some((d) => d < runStart);

  let state: ConsistencyState;
  if (resting) state = 'resting';
  else if (run.days >= CONSISTENCY_STEADY_DAYS) state = 'steady';
  else if (returned) state = 'recovering';
  else state = 'building';

  return {
    currentDays: run.days,
    // `longestRun` covers the current run too; the max is belt-and-braces for
    // the contract's "never decreases" promise.
    bestDays: Math.max(longestRun(sorted), run.days),
    activeDays: inWindow.length,
    windowDays: CONSISTENCY_WINDOW_DAYS,
    graceRemaining: Math.max(0, CONSISTENCY_GRACE_DAYS - run.graceUsed),
    state,
    lastActiveDate,
  };
}

function evaluateAchievement(
  def: AchievementDefinition,
  activity: UserActivity,
  consistency: ConsistencyStatus,
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
      // Evaluated against the never-decreasing high-water mark, not the current
      // run. Against the current run this returned null again the moment a user
      // missed a day, which *revokes an already-earned badge* — a harsher
      // signal than the reset counter this feature exists to remove. Earned
      // once, kept.
      //
      // The timestamp remains "today" rather than the date the run actually
      // reached the threshold: historical runs are not stored, so that date is
      // not recoverable. Awarding late is honest; revoking is not.
      return consistency.bestDays >= rule.days ? `${today}T00:00:00.000Z` : null;
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
  const consistency = computeConsistency(activity, today);

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
    consistency,
    workoutsCompleted: activity.completedSessions.length,
    totalKcalBurned: Math.round(
      activity.completedSessions.reduce((s, w) => s + (w.kcalBurned ?? 0), 0),
    ),
    achievements: definitions.map((definition) => ({
      definition,
      earnedAt: evaluateAchievement(
        definition,
        activity,
        consistency,
        profile !== undefined,
        profile?.updatedAt,
        today,
      ),
    })),
  };
}
