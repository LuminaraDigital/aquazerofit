/**
 * Adaptive readiness — Protect / Maintain / Progress (AQF-09 §2.4 extension).
 *
 * Why this module is pure code with no model in it: readiness decides the
 * working volume the user is then asked to actually perform. The project
 * invariant is that models identify, interpret and explain, while code
 * calculates, filters and enforces (AQF-06 §3.4). A prescribed dose is a
 * calculation, so it is derived here from the ledger and is reproducible for
 * any (user, day) pair.
 *
 * Why `protect` is not a demotion: a hard week is the ordinary case, not a
 * failure state. Holding someone to a plan built for a week they did not get
 * is how a plan gets abandoned — generic, unyielding programmes are a leading
 * cause of health-app churn. Protect quietly takes load off on the user's
 * behalf, and every string in this file is written to read that way. Nothing
 * here may frame a quiet week as a shortfall.
 */
import {
  READINESS_MAINTAIN_MAX_SCORE,
  READINESS_PROTECT_MAX_SCORE,
  READINESS_VOLUME_MULTIPLIER,
  type MealLog,
  type ReadinessAssessment,
  type ReadinessMode,
  type ReadinessSignal,
  type TrainingPlan,
  type WaterLog,
  type WeightLog,
  type WorkoutSession,
} from '@aquazerofit/shared';
import { getStore } from '../../platform/store';
import { addDays, lastNDates } from '../../platform/dates';
import { targetsId, type TargetsDoc } from '../me/service';

/**
 * Weighting, stated explicitly because an unexplained formula that changes how
 * hard someone trains is worse than a plain one. The four weights sum to 100
 * when every signal is measurable; when one is not (no plan, no intake target)
 * it is dropped and the remainder is renormalised, so a user is never scored
 * down for data the app never had.
 *
 *  completion 45 — did the prescribed training actually happen? The only
 *                  signal that measures the thing readiness modulates, so it
 *                  carries the most weight.
 *  logging     25 — did the user show up in the app at all? A broad, low-effort
 *                  proxy for the week going to plan; deliberately weaker than
 *                  completion because opening the app is not training.
 *  recency     20 — is the run still going? Weighted separately from `logging`
 *                  precisely so that four quiet days in a row read worse than
 *                  four quiet days scattered through the week: the first is a
 *                  run that has stopped, the second is a normal week.
 *  intake      10 — is fuelling stable? Smallest weight on purpose. It is the
 *                  noisiest signal and the one most easily turned into food
 *                  moralising, so it may nudge the band but never decide it.
 */
const WEIGHTS = {
  completion: 45,
  logging: 25,
  recency: 20,
  intake: 10,
} as const;

/**
 * Below this many days of observed history we do not score at all. Greeting a
 * brand-new user with `protect` would tell them they are struggling before
 * they have done anything, which is the exact opposite of the intent.
 */
const MIN_HISTORY_DAYS = 3;

/** A trailing gap this long zeroes the recency component (linear below it). */
const RECENCY_ZERO_AT_GAP_DAYS = 4;

/**
 * Intake deviation, as a fraction of target, at which the intake component
 * reaches zero. Applied to the absolute deviation: eating well under target
 * costs exactly as much as eating well over it. Under-eating is never scored
 * as virtue — that is the disordered-eating pattern this product must not
 * reward.
 */
const INTAKE_ZERO_AT_DEVIATION = 0.3;
/** Deviation under which intake reads as "close to target" in the signal copy. */
const INTAKE_CLOSE_ENOUGH = 0.1;
/** One logged day is not a mean; below this the intake signal is unmeasurable. */
const INTAKE_MIN_LOGGED_DAYS = 2;

const HEADLINES: Record<ReadinessMode, string> = {
  protect:
    'Lighter week ahead — we have eased the volume so you can get back into rhythm.',
  maintain: 'Steady week — your plan carries on exactly as it is.',
  progress: 'Strong rhythm — we have nudged this week up a notch.',
};

const COLD_START_HEADLINE =
  'Fresh start — your plan stays as built while we get to know your week.';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Whole days from `from` to `to`, both YYYY-MM-DD (UTC-safe, like addDays). */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

export function modeForScore(score: number): ReadinessMode {
  if (score <= READINESS_PROTECT_MAX_SCORE) return 'protect';
  if (score <= READINESS_MAINTAIN_MAX_SCORE) return 'maintain';
  return 'progress';
}

/**
 * Active plan lookup, duplicated from ./service rather than imported so the
 * dependency stays one-way (service → readiness). A cycle between the two
 * would work under ESM but would make the plan engine's import order load
 * bearing, which is not a property worth having.
 */
function activePlanFor(userId: string): TrainingPlan | undefined {
  return getStore()
    .where<TrainingPlan>(
      'plans',
      (d) => d.type === 'trainingPlan' && d.userId === userId && d.endDate === null,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

interface WindowData {
  dates: string[];
  /** Dates in the window with any check-in: meal, water, weight or workout. */
  activeDates: Set<string>;
  /** Dates in the window with a completed workout session. */
  completedDates: Set<string>;
  /** Total logged kcal per date, for dates that have meal logs. */
  kcalByDate: Map<string, number>;
  /** Earliest date the app has ever seen this user, plan start included. */
  firstSeen: string | undefined;
  plan: TrainingPlan | undefined;
}

function loadWindow(userId: string, today: string, periodDays: number): WindowData {
  const store = getStore();
  const dates = lastNDates(today, periodDays);
  const inWindow = new Set(dates);

  const activeDates = new Set<string>();
  const completedDates = new Set<string>();
  const kcalByDate = new Map<string, number>();
  let firstSeen: string | undefined;

  // Every record is inspected (not just the window's) because `firstSeen`
  // decides cold start, and cold start must not be confused with a dropout:
  // both look like an empty window.
  const note = (localDate: string): boolean => {
    if (firstSeen === undefined || localDate < firstSeen) firstSeen = localDate;
    if (!inWindow.has(localDate)) return false;
    activeDates.add(localDate);
    return true;
  };

  for (const meal of store.where<MealLog>(
    'logs',
    (d) => d.type === 'mealLog' && d.userId === userId,
  )) {
    if (note(meal.localDate)) {
      kcalByDate.set(meal.localDate, (kcalByDate.get(meal.localDate) ?? 0) + meal.totalKcal);
    }
  }
  for (const water of store.where<WaterLog>(
    'logs',
    (d) => d.type === 'waterLog' && d.userId === userId,
  )) {
    note(water.localDate);
  }
  for (const weight of store.where<WeightLog>(
    'logs',
    (d) => d.type === 'weightLog' && d.userId === userId,
  )) {
    note(weight.localDate);
  }
  for (const session of store.where<WorkoutSession>(
    'plans',
    (d) => d.type === 'workoutSession' && d.userId === userId && d.status === 'completed',
  )) {
    if (note(session.localDate)) completedDates.add(session.localDate);
  }

  const plan = activePlanFor(userId);
  if (plan && (firstSeen === undefined || plan.startDate < firstSeen)) firstSeen = plan.startDate;

  return { dates, activeDates, completedDates, kcalByDate, firstSeen, plan };
}

/**
 * Sessions the current plan actually asked for inside the window. The plan is
 * a 7-day cycle repeated from startDate, so calendar order is derived rather
 * than assuming the window aligns with the plan week.
 */
function prescribedSessions(plan: TrainingPlan | undefined, dates: string[]): number {
  if (!plan) return 0;
  let count = 0;
  for (const date of dates) {
    if (date < plan.startDate) continue;
    if (plan.endDate !== null && date > plan.endDate) continue;
    const order = (daysBetween(plan.startDate, date) % 7) + 1;
    const day = plan.days.find((d) => d.order === order);
    if (day && !day.isRest) count += 1;
  }
  return count;
}

/** Days since the most recent check-in; 0 when the user checked in today. */
function daysSinceLastCheckIn(activeDates: Set<string>, today: string, periodDays: number): number {
  let cursor = today;
  for (let i = 0; i <= periodDays; i += 1) {
    if (activeDates.has(cursor)) return i;
    cursor = addDays(cursor, -1);
  }
  return periodDays + 1;
}

interface Component {
  weight: number;
  /** 0–1 contribution of this component. */
  fraction: number;
  signal: ReadinessSignal;
}

function completionComponent(data: WindowData, periodDays: number): Component | null {
  const prescribed = prescribedSessions(data.plan, data.dates);
  // No plan, or a plan that prescribed nothing inside the window: there is
  // nothing to be measured against, so the component is dropped rather than
  // scored as a zero.
  if (prescribed === 0) return null;
  const completed = Math.min(data.completedDates.size, prescribed);
  return {
    weight: WEIGHTS.completion,
    fraction: completed / prescribed,
    signal: {
      label: 'Training',
      detail: `${completed} of ${prescribed} planned session${prescribed === 1 ? '' : 's'} logged in the last ${periodDays} days.`,
    },
  };
}

function loggingComponent(data: WindowData, periodDays: number): Component {
  const active = data.activeDates.size;
  return {
    weight: WEIGHTS.logging,
    fraction: clamp(active / periodDays, 0, 1),
    signal: {
      label: 'Check-ins',
      detail: `Activity logged on ${active} of the last ${periodDays} days.`,
    },
  };
}

function recencyComponent(data: WindowData, today: string, periodDays: number): Component {
  const since = daysSinceLastCheckIn(data.activeDates, today, periodDays);
  // Today is allowed to be empty: the day is still in progress at the moment
  // this runs. The gap that counts starts at yesterday.
  const gap = Math.max(0, since - 1);
  let detail: string;
  if (since === 0) detail = 'Checked in today.';
  else if (since === 1) detail = 'Checked in yesterday.';
  else if (since <= periodDays) detail = `Last check-in was ${since} days ago.`;
  else detail = `No check-ins in the last ${periodDays} days yet.`;

  return {
    weight: WEIGHTS.recency,
    fraction: clamp(1 - gap / RECENCY_ZERO_AT_GAP_DAYS, 0, 1),
    signal: { label: 'Rhythm', detail },
  };
}

function intakeComponent(userId: string, data: WindowData): Component | null {
  const target = getStore().byId<TargetsDoc>('profiles', targetsId(userId))?.kcalTarget;
  if (!target || target <= 0) return null;
  const logged = [...data.kcalByDate.values()];
  if (logged.length < INTAKE_MIN_LOGGED_DAYS) return null;

  // Averaged over days that were logged, not over the whole window. Treating an
  // unlogged day as a 0 kcal day would both double-count the gap (logging
  // already covers it) and read as "you barely ate", which is untrue and
  // exactly the wrong thing to tell someone.
  const mean = logged.reduce((sum, kcal) => sum + kcal, 0) / logged.length;
  const deviation = Math.abs(mean - target) / target;
  const percent = Math.round(deviation * 100);
  const detail =
    deviation <= INTAKE_CLOSE_ENOUGH
      ? 'Average intake tracked close to your target.'
      : `Average intake ran about ${percent}% ${mean > target ? 'over' : 'under'} your target.`;

  return {
    weight: WEIGHTS.intake,
    fraction: clamp(1 - deviation / INTAKE_ZERO_AT_DEVIATION, 0, 1),
    signal: { label: 'Intake', detail },
  };
}

/**
 * Surface the factors that actually moved the number, not all of them in a
 * fixed order: salience is a component's weight times how far it sat from the
 * overall result. A user reading this should see the reason their week landed
 * where it did, so the band never looks like an opaque verdict.
 */
function pickSignals(components: Component[], overall: number): ReadinessSignal[] {
  return components
    .map((component, index) => ({
      component,
      index,
      salience: component.weight * Math.abs(component.fraction - overall),
    }))
    .sort(
      (a, b) =>
        b.salience - a.salience ||
        b.component.weight - a.component.weight ||
        a.index - b.index,
    )
    .slice(0, 4)
    .map((entry) => entry.component.signal);
}

function coldStart(periodDays: number): ReadinessAssessment {
  return {
    mode: 'maintain',
    // The middle of the maintain band by construction: a new account has
    // neither earned a lighter week nor shown the consistency that warrants a
    // heavier one, so it sits as far from either edge as the bands allow.
    score: Math.round((READINESS_PROTECT_MAX_SCORE + 1 + READINESS_MAINTAIN_MAX_SCORE) / 2),
    signals: [
      {
        label: 'Getting started',
        detail: 'There is not enough history yet to read your week, so your plan stays as built.',
      },
      {
        label: 'What happens next',
        detail: 'Once a few days of check-ins are in, your plan starts adapting to how your week actually goes.',
      },
    ],
    headline: COLD_START_HEADLINE,
    volumeMultiplier: READINESS_VOLUME_MULTIPLIER.maintain,
    periodDays,
  };
}

/**
 * Score the trailing `periodDays` ending on `today` (a local YYYY-MM-DD) and
 * map it to a mode and a working-volume multiplier. Deterministic: the same
 * store contents and the same `today` always produce the same assessment.
 */
export function assessReadiness(
  userId: string,
  today: string,
  periodDays = 7,
): ReadinessAssessment {
  const data = loadWindow(userId, today, periodDays);

  if (data.firstSeen === undefined || daysBetween(data.firstSeen, today) + 1 < MIN_HISTORY_DAYS) {
    return coldStart(periodDays);
  }

  const components: Component[] = [
    completionComponent(data, periodDays),
    loggingComponent(data, periodDays),
    recencyComponent(data, today, periodDays),
    intakeComponent(userId, data),
  ].filter((component): component is Component => component !== null);

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const overall = components.reduce((sum, c) => sum + c.weight * c.fraction, 0) / totalWeight;
  const score = clamp(Math.round(overall * 100), 0, 100);
  const mode = modeForScore(score);

  return {
    mode,
    score,
    signals: pickSignals(components, overall),
    headline: HEADLINES[mode],
    volumeMultiplier: READINESS_VOLUME_MULTIPLIER[mode],
    periodDays,
  };
}
