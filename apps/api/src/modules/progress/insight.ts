/**
 * Progress insight — the deterministic core behind GET /progress/insight (P-08).
 *
 * The project invariant applies here more literally than anywhere else in the
 * app: models identify, interpret and explain; CODE calculates, filters and
 * enforces. Every number a user reads on their progress card is folded out of
 * the store by this module. The model in the `insightBatch` lane receives those
 * finished statistics and is asked only to narrate them, so there is no path by
 * which an invented figure can reach a user — the worst a bad completion can do
 * is get replaced by `deterministicNarrative`.
 *
 * Two averages here are computed over *logged* days rather than over every day
 * in the period. A day with no meal log is missing data, not a zero: averaging
 * the blanks in would report a fiction ("you ate 40% of target") and would
 * quietly moralise about days the user simply did not log, which AQF-11 §6
 * forbids. Counts (workouts, weigh-ins) are genuine zeros and are treated as
 * such.
 */
import type {
  MealLog,
  ProgressInsightChange,
  ProgressInsightStats,
  WaterLog,
  WeightLog,
  WorkoutSession,
} from '@aquazerofit/shared';
import { getStore } from '../../platform/store';
import { addDays, lastNDates } from '../../platform/dates';
import { readTargets, round1 } from '../ai/util';
import { computeStreak } from './service';

/** Sentence P-08 specifies for a user who has not logged enough to read yet. */
export const NOT_ENOUGH_DATA_NARRATIVE =
  'Keep logging — insights appear once there is enough data.';

/** Movement below this is reported as "steady" rather than as a direction. */
const WEIGHT_EPSILON_KG = 0.05;
/** Percentage-point movement below this is reported as "steady". */
const PCT_EPSILON = 0.5;

interface PeriodActivity {
  meals: MealLog[];
  waters: WaterLog[];
  weights: WeightLog[];
  completedSessions: WorkoutSession[];
}

/** Every log the user owns, ordered — the streak reaches outside the period. */
function loadAllActivity(userId: string): PeriodActivity {
  const store = getStore();
  return {
    meals: store.where<MealLog>('logs', (d) => d.type === 'mealLog' && d.userId === userId),
    waters: store.where<WaterLog>('logs', (d) => d.type === 'waterLog' && d.userId === userId),
    weights: store
      .where<WeightLog>('logs', (d) => d.type === 'weightLog' && d.userId === userId)
      .sort((a, b) => a.localDate.localeCompare(b.localDate)),
    completedSessions: store.where<WorkoutSession>(
      'plans',
      (d) => d.type === 'workoutSession' && d.userId === userId && d.status === 'completed',
    ),
  };
}

/**
 * Last day of the period immediately preceding the one ending at `today`.
 * The comparison window is defined here so the router cannot drift from it.
 */
export function previousPeriodEnd(today: string, periodDays: number): string {
  return addDays(today, -periodDays);
}

/** Mean of a non-empty list; null for an empty one (missing data, not zero). */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sum a log series into per-local-date totals, keyed by date. */
function dailyTotals<T extends { localDate: string }>(
  logs: T[],
  amountOf: (log: T) => number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const log of logs) {
    totals.set(log.localDate, (totals.get(log.localDate) ?? 0) + amountOf(log));
  }
  return totals;
}

/**
 * Local dates the user was active on inside the period. Same definition of
 * "active" the streak uses (any meal, water or weight log, or a completed
 * workout), so the admission check and the streak agree with each other.
 */
export function countActiveDays(userId: string, today: string, periodDays: number): number {
  const window = new Set(lastNDates(today, periodDays));
  const activity = loadAllActivity(userId);
  const active = new Set<string>();
  for (const l of activity.meals) if (window.has(l.localDate)) active.add(l.localDate);
  for (const l of activity.waters) if (window.has(l.localDate)) active.add(l.localDate);
  for (const l of activity.weights) if (window.has(l.localDate)) active.add(l.localDate);
  for (const s of activity.completedSessions) if (window.has(s.localDate)) active.add(s.localDate);
  return active.size;
}

/**
 * The exact input contract P-08 is written against, folded out of the store.
 *
 * `today` is the last day of the period (inclusive), so the window is the
 * `periodDays` local dates ending today. `streakDays` is deliberately NOT
 * clipped to the window — a streak is a fact about the run ending today, and
 * truncating it at the period boundary would under-report a user's consistency
 * for no reason.
 */
export async function computeInsightStats(
  userId: string,
  today: string,
  periodDays: number,
): Promise<ProgressInsightStats> {
  const window = new Set(lastNDates(today, periodDays));
  const activity = loadAllActivity(userId);
  const targets = await readTargets(userId);

  const weights = activity.weights.filter((w) => window.has(w.localDate));
  const first = weights[0];
  const last = weights[weights.length - 1];
  // Two weigh-ins are the minimum that describes a movement; one is a position.
  const deltaKg = first && last && weights.length >= 2 ? round1(last.weightKg - first.weightKg) : null;

  const kcalByDay = dailyTotals(
    activity.meals.filter((m) => window.has(m.localDate)),
    (m) => m.totalKcal ?? 0,
  );
  const avgKcal = mean([...kcalByDay.values()]);
  const avgKcalVsTarget =
    avgKcal !== null && targets.kcalTarget > 0
      ? Math.round((avgKcal / targets.kcalTarget) * 100) / 100
      : null;

  const waterByDay = dailyTotals(
    activity.waters.filter((w) => window.has(w.localDate)),
    (w) => w.amountMl ?? 0,
  );
  const avgWaterMl = mean([...waterByDay.values()]);
  const waterAdherencePct =
    avgWaterMl !== null && targets.waterMl > 0
      ? Math.round((avgWaterMl / targets.waterMl) * 100)
      : null;

  return {
    deltaKg,
    weighInsCount: weights.length,
    streakDays: computeStreak(activity, today),
    workoutsCompleted: activity.completedSessions.filter((s) => window.has(s.localDate)).length,
    avgKcalVsTarget,
    waterAdherencePct,
    periodDays,
  };
}

// ---------------------------------------------------------------------------
// Changes — "what changed and why", computed, never authored
// ---------------------------------------------------------------------------

function directionOf(delta: number, epsilon: number): ProgressInsightChange['direction'] {
  if (delta > epsilon) return 'up';
  if (delta < -epsilon) return 'down';
  return 'steady';
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "3 more" / "2 fewer" / "the same" against the previous period. */
function countComparison(delta: number, days: number): string {
  if (delta === 0) return `the same as the previous ${days} days`;
  return `${Math.abs(delta)} ${delta > 0 ? 'more' : 'fewer'} than the previous ${days} days`;
}

/** "4 points higher" / "2 points lower" against the previous period. */
function pointComparison(delta: number, days: number): string {
  const rounded = Math.round(Math.abs(delta) * 10) / 10;
  if (rounded < PCT_EPSILON) return `level with the previous ${days} days`;
  return `${rounded} ${plural(rounded, 'point', 'points')} ${delta > 0 ? 'higher' : 'lower'} than the previous ${days} days`;
}

/**
 * Compare this period against the immediately preceding one of the same length.
 *
 * Labels describe movement and never grade it (AQF-11 §6): "Weight is down
 * 0.4 kg" is a fact the user asked for; "great week!" and "you slipped" are
 * both the app deciding how someone should feel about their own body.
 *
 * Weight is the one metric whose change is measured *inside* the period rather
 * than between the two summary figures — `deltaKg` already spans first weigh-in
 * to last, and the start of this window is where the previous window ended, so
 * differencing the two deltas would report a change in the rate of change,
 * which is not a sentence anyone wants on a dashboard.
 */
export function computeChanges(
  current: ProgressInsightStats,
  previous: ProgressInsightStats,
  comparable = true,
): ProgressInsightChange[] {
  const days = current.periodDays;
  const changes: ProgressInsightChange[] = [];

  /**
   * A count comparison across two windows only means anything when the user was
   * present in both. Someone returning after a break logs one day against last
   * week's seven, so *every* count difference comes out negative — "4 fewer
   * workouts", "6 fewer weigh-ins" — and each one is measuring attendance
   * rather than effort. That is wrong before it is discouraging, and the two
   * compound: the returning user, the one this product most needs not to
   * flinch, is the one who gets the wall of downward arrows.
   *
   * When the windows are not comparable the current value is still reported —
   * nothing is hidden — but the invented comparison clause is dropped and the
   * delta is null. The rule is symmetric: a sparse window suppresses the
   * comparison whichever direction it would have pointed, so this cannot become
   * a way of only ever showing good news.
   */
  const countLabel = (value: string, delta: number): string =>
    comparable ? `${value}, ${countComparison(delta, days)}.` : `${value}.`;

  if (current.deltaKg !== null) {
    const delta = current.deltaKg;
    const magnitude = round1(Math.abs(delta));
    const direction = directionOf(delta, WEIGHT_EPSILON_KG);
    changes.push({
      metric: 'weight',
      direction,
      delta,
      label:
        direction === 'steady'
          ? `Weight is holding steady over the last ${days} days.`
          : `Weight is ${direction === 'down' ? 'down' : 'up'} ${magnitude} kg over the last ${days} days.`,
    });
  }

  const workoutDelta = current.workoutsCompleted - previous.workoutsCompleted;
  changes.push({
    metric: 'workouts',
    direction: comparable ? directionOf(workoutDelta, 0) : 'steady',
    delta: comparable ? workoutDelta : null,
    label: countLabel(
      `${current.workoutsCompleted} ${plural(current.workoutsCompleted, 'workout', 'workouts')} completed`,
      workoutDelta,
    ),
  });

  if (current.avgKcalVsTarget !== null) {
    const currentPct = Math.round(current.avgKcalVsTarget * 100);
    if (previous.avgKcalVsTarget !== null) {
      const deltaPoints = currentPct - Math.round(previous.avgKcalVsTarget * 100);
      changes.push({
        metric: 'intake',
        direction: directionOf(deltaPoints, PCT_EPSILON),
        delta: deltaPoints,
        label: `Intake averaged ${currentPct}% of target, ${pointComparison(deltaPoints, days)}.`,
      });
    } else {
      changes.push({
        metric: 'intake',
        direction: 'steady',
        delta: null,
        label: `Intake averaged ${currentPct}% of target; the previous ${days} days have nothing to compare against.`,
      });
    }
  }

  if (current.waterAdherencePct !== null) {
    if (previous.waterAdherencePct !== null) {
      const deltaPoints = current.waterAdherencePct - previous.waterAdherencePct;
      changes.push({
        metric: 'hydration',
        direction: directionOf(deltaPoints, PCT_EPSILON),
        delta: deltaPoints,
        label: `Hydration averaged ${current.waterAdherencePct}% of your water target, ${pointComparison(deltaPoints, days)}.`,
      });
    } else {
      changes.push({
        metric: 'hydration',
        direction: 'steady',
        delta: null,
        label: `Hydration averaged ${current.waterAdherencePct}% of your water target; the previous ${days} days have nothing to compare against.`,
      });
    }
  }

  // `logging` reports weigh-ins: it is the only per-period logging count the
  // stats contract carries (streakDays is a run ending today, not a window).
  const weighInDelta = current.weighInsCount - previous.weighInsCount;
  changes.push({
    metric: 'logging',
    direction: comparable ? directionOf(weighInDelta, 0) : 'steady',
    delta: comparable ? weighInDelta : null,
    label: countLabel(
      `${current.weighInsCount} ${plural(current.weighInsCount, 'weigh-in', 'weigh-ins')} logged`,
      weighInDelta,
    ),
  });

  return changes;
}

// ---------------------------------------------------------------------------
// Deterministic narrative
// ---------------------------------------------------------------------------

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The narration free-tier, consent-off, guardrail-blocked and AI-unavailable
 * users receive. It is the majority path, not a stub: it is built from the same
 * statistics the model would have been handed, so the only thing those users
 * lose is the phrasing. Two to three sentences, weight-neutral, no prediction
 * and no number that is not in `stats`.
 */
export function deterministicNarrative(
  stats: ProgressInsightStats,
  changes: ProgressInsightChange[],
): string {
  const days = stats.periodDays;
  const body: string[] = [];

  if (stats.deltaKg !== null) {
    const magnitude = round1(Math.abs(stats.deltaKg));
    body.push(
      magnitude < WEIGHT_EPSILON_KG
        ? `Over the last ${days} days your weight has held steady across ${stats.weighInsCount} weigh-ins.`
        : `Over the last ${days} days your weight is ${stats.deltaKg < 0 ? 'down' : 'up'} ${magnitude} kg across ${stats.weighInsCount} weigh-ins.`,
    );
  } else if (stats.weighInsCount === 1) {
    body.push(
      `You logged one weigh-in in the last ${days} days — a second one gives the trend something to sit against.`,
    );
  }

  const consistency: string[] = [];
  if (stats.streakDays > 0) {
    consistency.push(`a ${stats.streakDays}-day logging streak`);
  }
  if (stats.workoutsCompleted > 0) {
    consistency.push(
      `${stats.workoutsCompleted} ${plural(stats.workoutsCompleted, 'workout', 'workouts')} completed`,
    );
  }
  if (consistency.length > 0) {
    body.push(
      `${body.length > 0 ? 'Alongside that' : 'Over the same period'}: ${joinClauses(consistency)}.`,
    );
  }

  const adherence: string[] = [];
  if (stats.avgKcalVsTarget !== null) {
    adherence.push(`intake averaged ${Math.round(stats.avgKcalVsTarget * 100)}% of target`);
  }
  if (stats.waterAdherencePct !== null) {
    adherence.push(`hydration averaged ${stats.waterAdherencePct}% of your water target`);
  }
  if (adherence.length > 0) {
    body.push(`On the days you logged, ${joinClauses(adherence)}.`);
  }

  if (body.length === 0) {
    // Nothing measurable happened; `changes` will be equally thin. P-08 owns
    // this exact sentence so the offline and model paths say the same thing.
    return changes.length === 0
      ? NOT_ENOUGH_DATA_NARRATIVE
      : `${NOT_ENOUGH_DATA_NARRATIVE} ${changes[0]!.label}`;
  }

  return [
    ...body.slice(0, 2),
    'These are your own logged numbers — weekly averages read more honestly than any single day.',
  ].join(' ');
}
