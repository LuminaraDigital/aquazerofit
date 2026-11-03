/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

import type { MealType } from './enums';
import type { MealLog } from './logs';
import type { AchievementDefinition } from './content';
import type { AiMetadata } from './ai';

// ---------- progress / analytics DTOs ----------

export interface DailyNutrition {
  date: string;
  kcalTarget: number;
  kcalConsumed: number;
  kcalBurned: number;
  kcalNet: number;
  kcalRemaining: number;
  proteinG: { consumed: number; target: number };
  carbsG: { consumed: number; target: number };
  fatG: { consumed: number; target: number };
  waterMl: { consumed: number; target: number };
  meals: Record<MealType, MealLog[]>;
}

export interface TrendPoint {
  date: string;
  value: number;
}

// ---------- consistency (recovery-aware streak) ----------

/**
 * Where the user currently sits in their logging habit. Deliberately has no
 * "broken"/"failed" member: the research this design answers (UCL, 58,881
 * posts) found streak loss to be a leading driver of shame and app
 * abandonment, so the model has no state that describes the user as having
 * lost something.
 *
 * - `resting`    no activity in the trailing window — neutral, not a failure
 * - `building`   an active run shorter than CONSISTENCY_STEADY_DAYS
 * - `steady`     an active run at or beyond CONSISTENCY_STEADY_DAYS
 * - `recovering` active again after a gap that ended a previous run
 */
export type ConsistencyState = 'resting' | 'building' | 'recovering' | 'steady';

/**
 * Consistency expressed so that a single missed day cannot destroy it.
 *
 * Three independent defences against the streak-shame failure mode:
 *  1. `graceRemaining` — a run tolerates CONSISTENCY_GRACE_DAYS missed days
 *     before it ends, so one bad day is absorbed rather than punished.
 *  2. `activeDays` / `windowDays` — the headline metric is "N of the last M
 *     days", which is monotonic in effort and cannot be reset to zero.
 *  3. `bestDays` — a high-water mark that never decreases, so past effort
 *     stays visible even when the current run is short.
 */
export interface ConsistencyStatus {
  /** Length of the current grace-tolerant run, in days. */
  currentDays: number;
  /** Longest run ever achieved. Never decreases. */
  bestDays: number;
  /** Distinct active days inside the trailing window. */
  activeDays: number;
  /** Width of the trailing window (CONSISTENCY_WINDOW_DAYS). */
  windowDays: number;
  /** Missed days the current run can still absorb before it ends. */
  graceRemaining: number;
  state: ConsistencyState;
  /** Most recent local date with any logged activity. */
  lastActiveDate: string | null;
}

export interface ProgressSummary {
  currentWeightKg: number | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  weightSeries: TrendPoint[];
  /**
   * Raw consecutive-day count. Retained for the chat tool surface and the
   * achievement rules; `consistency` is what the UI renders.
   */
  streakDays: number;
  consistency: ConsistencyStatus;
  workoutsCompleted: number;
  totalKcalBurned: number;
  achievements: { definition: AchievementDefinition; earnedAt: string | null }[];
}

// ---------- progress intelligence (P-08 insight lane) ----------

/** Code-computed statistics. The exact contract P-08 is written against. */
export interface ProgressInsightStats {
  deltaKg: number | null;
  weighInsCount: number;
  streakDays: number;
  workoutsCompleted: number;
  /** Mean intake as a ratio of target, e.g. 1.05 = 5% over. */
  avgKcalVsTarget: number | null;
  waterAdherencePct: number | null;
  periodDays: number;
}

export type InsightMetric = 'weight' | 'workouts' | 'intake' | 'hydration' | 'logging';

/**
 * One "what changed" line. Computed deterministically by comparing the current
 * period against the one before it — never authored by a model, so the numbers
 * a user reads are always the numbers the store holds.
 */
export interface ProgressInsightChange {
  metric: InsightMetric;
  direction: 'up' | 'down' | 'steady';
  /** Signed change against the previous period, in the metric's own unit. */
  delta: number | null;
  /** Deterministic, weight-neutral sentence. */
  label: string;
}

export interface ProgressInsight {
  id: string;
  userId: string;
  type: 'progressInsight';
  /** Local date of the Monday starting the period this insight describes. */
  periodStart: string;
  periodDays: number;
  stats: ProgressInsightStats;
  changes: ProgressInsightChange[];
  /**
   * 2–4 supportive sentences narrating `stats`. Model-authored, and therefore
   * subject to the output guardrail before it can reach a user; falls back to
   * a deterministic narration when blocked or unavailable.
   */
  narrative: string;
  ai: AiMetadata;
  createdAt: string;
}

// ---------- adaptive readiness (Protect / Maintain / Progress) ----------

/**
 * How hard the plan should push this week, derived in code from adherence.
 * `protect` is explicitly not a demotion — it is the app absorbing a hard week
 * on the user's behalf rather than letting them fail a plan built for a
 * different week.
 */
export type ReadinessMode = 'protect' | 'maintain' | 'progress';

export interface ReadinessSignal {
  label: string;
  detail: string;
}

export interface ReadinessAssessment {
  mode: ReadinessMode;
  /** 0–100, computed in code. */
  score: number;
  signals: ReadinessSignal[];
  /** Deterministic, non-shaming one-liner. */
  headline: string;
  /** Multiplier the plan engine applies to prescribed working volume. */
  volumeMultiplier: number;
  periodDays: number;
}
