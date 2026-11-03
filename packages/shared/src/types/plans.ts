/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

import type { AiMetadata } from './ai';

// ---------- plans container ----------

export interface SlotEntry {
  id: string;
  exerciseId: string;
  sets: number;
  reps: number;
  restSeconds: number;
  notes?: string;
  // Phase 2 (wger training-engine patterns): load/RIR targets and rep ranges.
  weightKg?: number | null; // null = bodyweight / not prescribed
  rir?: number | null; // reps in reserve target (0–9.5, step 0.5)
  repsMax?: number | null; // when set, `reps`..`repsMax` is a rep range
}

export interface PlanSlot {
  order: number;
  entries: SlotEntry[];
}

export interface PlanDay {
  order: number; // 1..7
  focus: string; // e.g. 'Full Body Strength', 'Rest', 'Cardio'
  isRest: boolean;
  slots: PlanSlot[];
  // Phase 2: when true the day only advances once its session has logged sets
  // (wger `need_logs_to_advance` schedule-drift pattern).
  needLogsToAdvance?: boolean;
}

export interface ProgressionRule {
  slotEntryId: string;
  kind: 'weight' | 'reps' | 'sets' | 'rest' | 'rir';
  iteration: number;
  value: number;
  // Phase 2 (wger progression-as-data patterns). All optional — a rule without
  // them keeps the legacy behaviour: `value` is the absolute target.
  op?: 'add' | 'subtract' | 'replace'; // absent = legacy absolute-value behaviour
  step?: 'abs' | 'percent'; // default 'abs'; 'percent' interprets value as a %
  repeat?: boolean; // re-apply this rule on every later iteration
  requires?: ('weight' | 'reps' | 'sets' | 'rest' | 'rir')[]; // autoregulation:
  // apply only when the previous iteration's logs met these targets
}

export interface TrainingPlan {
  id: string;
  userId: string;
  type: 'trainingPlan';
  name: string;
  startDate: string;
  endDate: string | null;
  currentIteration: number;
  days: PlanDay[];
  progressionRules: ProgressionRule[];
  generatedBy: AiMetadata | null;
  createdAt: string;
}

/** Per-set actuals (Phase 2): history survives plan edits and feeds drift analysis. */
export interface SetLog {
  set: number; // 1-based set number within the exercise
  reps: number;
  weightKg?: number | null;
  rir?: number | null;
  completed: boolean;
}

export interface SessionExercise {
  exerciseId: string;
  name: string;
  setsPlanned: number;
  setsCompleted: number;
  reps: number;
  restSeconds: number;
  skipped: boolean;
  // Phase 2: targets captured at plan resolution time (log target AND actual).
  targetWeightKg?: number | null;
  targetReps?: number | null;
  targetRir?: number | null;
  // Actuals (exercise-level rollup; per-set detail in setLogs).
  weightKg?: number | null;
  rir?: number | null;
  setLogs?: SetLog[];
}

export interface WorkoutSession {
  id: string;
  userId: string;
  type: 'workoutSession';
  planId: string | null;
  planDayOrder: number | null;
  focus: string;
  exercises: SessionExercise[];
  status: 'pending' | 'inProgress' | 'completed' | 'skipped';
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  kcalBurned: number | null;
  localDate: string;
}
