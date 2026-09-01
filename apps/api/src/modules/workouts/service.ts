/**
 * WorkoutScheduler + SessionLogger (AQF-09 §2.4 / §1 training module).
 * Today's session is derived from the active plan (day = days since start
 * mod 7) with progression rules applied by iteration; completion computes a
 * deterministic kcal estimate (6–10 kcal/min scaled by session intensity).
 *
 * Phase 2 (wger training-engine patterns):
 * - Progression resolution delegates to the deterministic ProgressionEngine
 *   (op/step/repeat/requires) — legacy absolute rules keep exact behaviour.
 * - Sessions log target AND actual (targetWeightKg/targetReps/targetRir are
 *   frozen at resolution time, so history survives plan edits).
 * - PlanDay.needLogsToAdvance stalls schedule derivation on unlogged days
 *   (wger need_logs_to_advance); default off = previous behaviour.
 * - getTodayWorkout returns a pre-computed `resolved` document (folded sets,
 *   plate-rounded weights, rest timers, RiR targets) so the Telegram Mini
 *   App renders with minimal client logic. Legacy fields are untouched.
 */
import type {
  Equipment,
  Exercise,
  PlanDay,
  ProgressionRule,
  SessionExercise,
  SetLog,
  TrainingPlan,
  WellnessProfile,
  WorkoutSession,
} from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { getStore } from '../../platform/store';
import { addDays } from '../../platform/dates';
import { creditLedger } from '../ai/creditLedger';
import { tierOf } from '../billing/entitlements';
import {
  buildExercisePool,
  equipmentAllows,
  getCurrentPlan,
  loadPlanEngine,
} from '../plans/service';
import {
  resolvePrescription,
  roundToPlate,
  type ProgressionGate,
  type RuleKind,
} from '../plans/progression';
import { getProfile } from '../me/service';

const DAY_MS = 24 * 3600 * 1000;

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round(
    (new Date(`${toDate}T00:00:00Z`).getTime() - new Date(`${fromDate}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

export function planPositionFor(
  plan: TrainingPlan,
  localDate: string,
): { day: PlanDay; iteration: number } {
  const diff = Math.max(0, daysBetween(plan.startDate, localDate));
  const order = (diff % 7) + 1;
  const iteration = Math.floor(diff / 7) + 1;
  const day = plan.days.find((d) => d.order === order);
  if (!day) throw new AppError('INTERNAL', 'Plan is malformed: missing day', { order });
  return { day, iteration };
}

export const sessionId = (userId: string, localDate: string): string => `ws-${userId}-${localDate}`;

// ----- autoregulation: requires[] gates against previous-iteration logs -----

/**
 * Whether a completed session exercise met the listed targets. Targets that
 * were never prescribed (null) are trivially met; missing actuals are not
 * (unlogged = not met, progression stalls — fail closed).
 */
export function requirementsMet(se: SessionExercise, requires: RuleKind[]): boolean {
  for (const req of requires) {
    switch (req) {
      case 'sets':
        if (se.setsCompleted < se.setsPlanned) return false;
        break;
      case 'reps': {
        const target = se.targetReps ?? se.reps;
        if (se.setLogs && se.setLogs.length > 0) {
          const completed = se.setLogs.filter((s) => s.completed);
          if (completed.length === 0) return false;
          if (completed.some((s) => s.reps < target)) return false;
        } else if (se.setsCompleted < se.setsPlanned) {
          // Legacy logs without per-set detail: assume prescribed reps were
          // hit when all planned sets were completed.
          return false;
        }
        break;
      }
      case 'weight': {
        const target = se.targetWeightKg;
        if (target === null || target === undefined) break; // nothing prescribed
        const actual =
          se.weightKg ??
          (se.setLogs ?? []).reduce<number | null>(
            (max, s) => (s.completed && s.weightKg != null && (max === null || s.weightKg > max) ? s.weightKg : max),
            null,
          );
        if (actual === null || actual === undefined || actual < target) return false;
        break;
      }
      case 'rir': {
        const target = se.targetRir;
        if (target === null || target === undefined) break; // nothing prescribed
        const actual =
          se.rir ??
          (se.setLogs ?? []).reduce<number | null>(
            (min, s) => (s.completed && s.rir != null && (min === null || s.rir < min) ? s.rir : min),
            null,
          );
        // Actual RiR above target means the effort target was not met.
        if (actual === null || actual === undefined || actual > target) return false;
        break;
      }
      case 'rest':
        break; // rest compliance is not observable in logs
    }
  }
  return true;
}

/**
 * Gate for ProgressionEngine: the application at `atIteration` is honoured
 * only when the session logged one iteration earlier for the same plan day
 * shows the targets were met.
 */
function logsMetRequirements(
  userId: string,
  planDayOrder: number | null,
  exerciseId: string,
  logIteration: number,
  servedDate: string,
  currentIteration: number,
  requires: RuleKind[],
): boolean {
  const weeksBack = currentIteration - logIteration;
  if (weeksBack < 1) return false;
  const logDate = addDays(servedDate, -7 * weeksBack);
  const session = getStore().byId<WorkoutSession>('plans', sessionId(userId, logDate));
  if (!session || session.type !== 'workoutSession' || session.status !== 'completed') return false;
  if (session.planDayOrder !== planDayOrder) return false;
  const se = session.exercises.find((e) => e.exerciseId === exerciseId);
  if (!se || se.skipped) return false;
  return requirementsMet(se, requires);
}

// ----- needLogsToAdvance (wger schedule-drift pattern) -----

/** How far back a stalled day may carry the schedule (5 weeks). */
export const STALL_LOOKBACK_DAYS = 35;

/**
 * Earliest prior date whose workout day has needLogsToAdvance set and no
 * completed session. When found, today's derivation stalls on that day until
 * it is logged. Days without the flag never stall (previous behaviour).
 */
export function stalledDateFor(
  plan: TrainingPlan,
  userId: string,
  localDate: string,
): string | null {
  const store = getStore();
  const todayDiff = Math.max(0, daysBetween(plan.startDate, localDate));
  const fromDiff = Math.max(0, todayDiff - STALL_LOOKBACK_DAYS);
  for (let diff = fromDiff; diff < todayDiff; diff += 1) {
    const order = (diff % 7) + 1;
    const day = plan.days.find((d) => d.order === order);
    if (!day || day.isRest || !day.needLogsToAdvance) continue;
    const date = addDays(localDate, diff - todayDiff);
    const session = store.byId<WorkoutSession>('plans', sessionId(userId, date));
    if (!session || session.status !== 'completed') return date;
  }
  return null;
}

// ----- today's workout (pre-computed read model) -----

export interface ResolvedSet {
  set: number;
  reps: number;
  /** Plate-rounded working weight (2.5 kg steps); null = bodyweight/unprescribed. */
  weightKg: number | null;
  rir: number | null;
  restSeconds: number;
}

export interface ResolvedExercise {
  exerciseId: string;
  name: string;
  setsPlanned: number;
  targetReps: number;
  targetWeightKg: number | null;
  targetRir: number | null;
  restSeconds: number;
  sets: ResolvedSet[];
}

export interface ResolvedWorkout {
  localDate: string;
  iteration: number;
  /** True when needLogsToAdvance carried an earlier unlogged day forward. */
  stalled: boolean;
  exercises: ResolvedExercise[];
}

export interface TodayWorkout {
  rest: boolean;
  focus: string;
  iteration: number;
  session: WorkoutSession | null;
  /** Exercise detail (description, media, muscles) keyed by exerciseId. */
  exercises: Record<string, Exercise>;
  planId: string;
  planName: string;
  // Phase 2 additions (legacy fields above are unchanged):
  localDate: string;
  stalled: boolean;
  resolved: ResolvedWorkout | null;
}

function resolveSessionExercises(session: WorkoutSession, iteration: number, stalled: boolean): ResolvedWorkout {
  const exercises: ResolvedExercise[] = session.exercises
    .filter((se) => !se.skipped)
    .map((se) => {
      const targetReps = se.targetReps ?? se.reps;
      const targetWeightKg = se.targetWeightKg ?? null;
      const targetRir = se.targetRir ?? null;
      const sets: ResolvedSet[] = Array.from({ length: se.setsPlanned }, (_, i) => ({
        set: i + 1,
        reps: targetReps,
        weightKg: targetWeightKg === null ? null : roundToPlate(targetWeightKg),
        rir: targetRir,
        restSeconds: se.restSeconds,
      }));
      return {
        exerciseId: se.exerciseId,
        name: se.name,
        setsPlanned: se.setsPlanned,
        targetReps,
        targetWeightKg,
        targetRir,
        restSeconds: se.restSeconds,
        sets,
      };
    });
  return { localDate: session.localDate, iteration, stalled, exercises };
}

export function getTodayWorkout(userId: string, localDate: string): TodayWorkout {
  const store = getStore();
  const plan = getCurrentPlan(userId);
  if (!plan) {
    throw new AppError('NOT_FOUND', 'No active training plan — generate one first');
  }

  // needLogsToAdvance: stall on the earliest unlogged gated day (default off).
  const stallDate = stalledDateFor(plan, userId, localDate);
  const servedDate = stallDate ?? localDate;
  const stalled = stallDate !== null;
  const { day, iteration } = planPositionFor(plan, servedDate);

  if (day.isRest) {
    return {
      rest: true,
      focus: day.focus,
      iteration,
      session: null,
      exercises: {},
      planId: plan.id,
      planName: plan.name,
      localDate: servedDate,
      stalled,
      resolved: null,
    };
  }

  let session = store.byId<WorkoutSession>('plans', sessionId(userId, servedDate));
  if (!session) {
    const exercises: SessionExercise[] = [];
    for (const slot of day.slots) {
      for (const entry of slot.entries) {
        const exercise = store.byId<Exercise>('content', entry.exerciseId);
        const gate: ProgressionGate = (atIteration, rule) =>
          logsMetRequirements(
            userId,
            day.order,
            entry.exerciseId,
            atIteration - 1,
            servedDate,
            iteration,
            rule.requires ?? [],
          );
        const rx = resolvePrescription(
          entry.id,
          {
            sets: entry.sets,
            reps: entry.reps,
            restSeconds: entry.restSeconds,
            weightKg: entry.weightKg ?? null,
            rir: entry.rir ?? null,
          },
          plan.progressionRules,
          iteration,
          gate,
        );
        exercises.push({
          exerciseId: entry.exerciseId,
          name: exercise?.name ?? entry.exerciseId,
          setsPlanned: rx.sets,
          setsCompleted: 0,
          reps: rx.reps,
          restSeconds: rx.restSeconds,
          skipped: false,
          // Targets frozen at resolution time — history survives plan edits.
          targetWeightKg: rx.weightKg,
          targetReps: rx.reps,
          targetRir: rx.rir,
        });
      }
    }
    session = {
      id: sessionId(userId, servedDate),
      userId,
      type: 'workoutSession',
      planId: plan.id,
      planDayOrder: day.order,
      focus: day.focus,
      exercises,
      status: 'pending',
      startedAt: null,
      completedAt: null,
      durationMinutes: null,
      kcalBurned: null,
      localDate: servedDate,
    };
    store.upsert('plans', session);
  }

  const detail: Record<string, Exercise> = {};
  for (const se of session.exercises) {
    const exercise = store.byId<Exercise>('content', se.exerciseId);
    if (exercise) detail[se.exerciseId] = exercise;
  }

  return {
    rest: false,
    focus: day.focus,
    iteration,
    session,
    exercises: detail,
    planId: plan.id,
    planName: plan.name,
    localDate: servedDate,
    stalled,
    resolved: resolveSessionExercises(session, iteration, stalled),
  };
}

/** kcal/min by session intensity (AQF brief: ~6–10 kcal/min). */
export function kcalPerMinuteFor(focus: string): number {
  if (focus.includes('Cardio')) return 10;
  if (focus.includes('Full Body')) return 8;
  if (focus.includes('Strength')) return 7;
  return 6;
}

export function getSession(userId: string, id: string): WorkoutSession {
  const session = getStore().byId<WorkoutSession>('plans', id);
  if (!session || session.type !== 'workoutSession' || session.userId !== userId) {
    throw new AppError('NOT_FOUND', 'Workout session not found');
  }
  return session;
}

export interface CompleteWorkoutInput {
  exercises: {
    exerciseId: string;
    setsCompleted: number;
    skipped: boolean;
    // Phase 2 optional actuals (legacy clients omit them unchanged).
    weightKg?: number | null;
    rir?: number | null;
    setLogs?: SetLog[];
  }[];
  durationMinutes: number;
  localDate: string;
}

export function completeWorkout(
  userId: string,
  id: string,
  input: CompleteWorkoutInput,
): WorkoutSession {
  const store = getStore();
  const session = getSession(userId, id);
  if (session.status === 'completed') {
    throw new AppError('CONFLICT', 'This workout has already been completed');
  }
  const byExercise = new Map(input.exercises.map((e) => [e.exerciseId, e]));
  const exercises: SessionExercise[] = session.exercises.map((se) => {
    const result = byExercise.get(se.exerciseId);
    if (!result) return se;
    return {
      ...se,
      setsCompleted: result.setsCompleted,
      skipped: result.skipped || result.setsCompleted === 0,
      // Actuals persist alongside the frozen targets (undefined = keep prior).
      ...(result.weightKg !== undefined ? { weightKg: result.weightKg } : {}),
      ...(result.rir !== undefined ? { rir: result.rir } : {}),
      ...(result.setLogs !== undefined ? { setLogs: result.setLogs } : {}),
    };
  });
  // Effort-scaled estimate: full rate for performed work only.
  const performedRatio =
    exercises.length === 0
      ? 0
      : exercises.filter((e) => !e.skipped).length / exercises.length;
  const kcalBurned = Math.round(
    input.durationMinutes * kcalPerMinuteFor(session.focus) * Math.max(0.5, performedRatio),
  );
  const now = new Date().toISOString();
  const updated: WorkoutSession = {
    ...session,
    exercises,
    status: 'completed',
    startedAt: session.startedAt ?? now,
    completedAt: now,
    durationMinutes: input.durationMinutes,
    kcalBurned,
    localDate: input.localDate,
  };
  store.upsert('plans', updated);
  return updated;
}

// ----- exercise library: search / variations / swap -----

export interface ExerciseQuery {
  search?: string;
  category?: Exercise['category'];
  muscle?: string;
  equipment?: Equipment;
  limit?: number;
  offset?: number;
  /** Restrict to exercises the user's equipment allows (needs userId). */
  respectProfile?: boolean;
  userId?: string;
}

export function queryExercises(query: ExerciseQuery): { items: Exercise[]; total: number } {
  let list = getStore().where<Exercise>('content', (d) => d.type === 'exercise');
  if (query.respectProfile && query.userId) {
    const profile = getProfile(query.userId);
    if (profile) {
      list = list.filter((ex) => equipmentAllows(ex, profile.equipment));
    }
  }
  const q = (query.search ?? '').trim().toLowerCase();
  const muscle = query.muscle?.trim().toLowerCase();
  list = list
    .filter(
      (ex) =>
        (!query.category || ex.category === query.category) &&
        (!muscle ||
          ex.primaryMuscles.some((m) => m.toLowerCase() === muscle) ||
          ex.secondaryMuscles.some((m) => m.toLowerCase() === muscle)) &&
        (!query.equipment || ex.equipment.includes(query.equipment)) &&
        (q.length === 0 ||
          ex.name.toLowerCase().includes(q) ||
          ex.primaryMuscles.some((m) => m.toLowerCase().includes(q))),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const total = list.length;
  if (query.limit === undefined && query.offset === undefined) {
    return { items: list, total };
  }
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 50;
  return { items: list.slice(offset, offset + limit), total };
}

/** Backward-compatible wrapper over queryExercises (legacy signature). */
export function searchExercises(search: string, category?: string): Exercise[] {
  return queryExercises({ search, category: category as Exercise['category'] | undefined }).items;
}

/**
 * wger variation_group: exercises sharing the group are interchangeable.
 * Falls back to same-primary-muscle matches when the exercise has no group
 * (or the group has no other members). Used by the library UI and the swap.
 */
export function getExerciseVariations(exerciseId: string): {
  exercise: Exercise;
  variations: Exercise[];
  basis: 'variationGroup' | 'primaryMuscle';
} {
  const store = getStore();
  const exercise = store.byId<Exercise>('content', exerciseId);
  if (!exercise || exercise.type !== 'exercise') {
    throw new AppError('NOT_FOUND', 'Exercise not found');
  }
  const others = store.where<Exercise>(
    'content',
    (d) => d.type === 'exercise' && d.id !== exerciseId,
  );
  const group = exercise.variationGroup ?? null;
  let basis: 'variationGroup' | 'primaryMuscle' = 'variationGroup';
  let variations = group ? others.filter((ex) => ex.variationGroup === group) : [];
  if (variations.length === 0) {
    basis = 'primaryMuscle';
    variations = others.filter((ex) =>
      ex.primaryMuscles.some((m) => exercise.primaryMuscles.includes(m)),
    );
  }
  variations.sort((a, b) => a.name.localeCompare(b.name));
  return { exercise, variations, basis };
}

/** Deterministic swap constraint (AQF-07 §3.3): same group or primary muscle. */
function isValidSwapCandidate(candidate: Exercise, outgoing: Exercise, inSession: Set<string>): boolean {
  if (inSession.has(candidate.id)) return false;
  const group = outgoing.variationGroup ?? null;
  if (group && candidate.variationGroup === group) return true;
  return candidate.primaryMuscles.some((m) => outgoing.primaryMuscles.includes(m));
}

export async function swapExercise(
  userId: string,
  id: string,
  outgoingExerciseId: string,
  opts: { reason?: string } = {},
): Promise<{ session: WorkoutSession; replacement: Exercise }> {
  const store = getStore();
  const session = getSession(userId, id);
  if (session.status === 'completed') {
    throw new AppError('CONFLICT', 'Cannot swap exercises on a completed workout');
  }
  const idx = session.exercises.findIndex((e) => e.exerciseId === outgoingExerciseId);
  if (idx === -1) {
    throw new AppError('NOT_FOUND', 'That exercise is not part of this session');
  }
  const outgoing = store.byId<Exercise>('content', outgoingExerciseId);
  if (!outgoing) throw new AppError('NOT_FOUND', 'Exercise not found in the library');
  const profile = getProfile(userId);
  if (!profile) throw new AppError('NOT_FOUND', 'Complete your wellness profile first');

  const inSession = new Set(session.exercises.map((e) => e.exerciseId));
  const pool = buildExercisePool(
    store.where<Exercise>('content', (d) => d.type === 'exercise'),
    profile as WellnessProfile,
  );

  // Deterministic order: same variationGroup first (wger interchangeable
  // variants — the gold-standard swap), always within the equipment-filtered
  // pool. AI ranking below never overrides a group sibling.
  const group = outgoing.variationGroup ?? null;
  let replacement = group
    ? pool.find((ex) => !inSession.has(ex.id) && ex.variationGroup === group)
    : undefined;

  // Optional AI ranking (P-06) for the muscle-match tier: the model proposes,
  // code disposes — any AI pick must pass the deterministic equipment/muscle
  // constraints (same primary muscle, pool membership, not already in session).
  let reservationId: string | null = null;
  try {
    if (!replacement) {
      const engine = await loadPlanEngine();
      if (engine) {
        // The hold is taken here rather than on entry because everything above
        // answers the swap without a model: a group sibling, or an unavailable
        // AI lane, costs nothing to serve and so must cost the user nothing.
        try {
          reservationId = await creditLedger.reserve(userId, 'exerciseSwap', tierOf(userId));
        } catch {
          // An empty balance (CREDITS_INSUFFICIENT) costs the user the ranking,
          // not the substitution: skip the model and let the deterministic
          // fallback below answer, exactly as it does when the model fails.
        }
        if (reservationId) {
          try {
            const suggestion = await engine.suggestExerciseSwap({
              exercise: outgoing,
              pool,
              profile: profile as WellnessProfile,
              reason: opts.reason,
            });
            replacement = (suggestion?.exerciseIds ?? [])
              .map((exerciseId) => pool.find((ex) => ex.id === exerciseId))
              .find((ex): ex is Exercise => ex !== undefined && isValidSwapCandidate(ex, outgoing, inSession));
            // Billed only for a pick that survived the constraints — a null
            // suggestion, or one the constraints threw out, leaves the user on
            // the deterministic fallback, which is free on every other path.
            // Degraded output is the offline template engine answering for
            // providers that all failed: the pick is usable, so it stands, but
            // it is not a model's work and is not charged for. Same stance as
            // the chat and meal-recommendation lanes.
            if (replacement && suggestion?.ai.degraded !== true) {
              await creditLedger.commit(reservationId);
            }
          } catch {
            // Model failure never blocks the deterministic swap.
          }
        }
      }
    }

    // Deterministic fallback (pre-Phase-2 behaviour): same primary muscle.
    replacement ??= pool.find(
      (ex) =>
        !inSession.has(ex.id) &&
        ex.primaryMuscles.some((m) => outgoing.primaryMuscles.includes(m)),
    );

    if (!replacement) {
      throw new AppError('CONFLICT', 'No suitable substitute matches your equipment for this muscle group');
    }
    const current = session.exercises[idx]!;
    const exercises = [...session.exercises];
    exercises[idx] = { ...current, exerciseId: replacement.id, name: replacement.name };
    const updated: WorkoutSession = { ...session, exercises };
    store.upsert('plans', updated);
    return { session: updated, replacement };
  } finally {
    // Anything that is not a committed AI pick hands the credit back: a refused
    // suggestion, a thrown model call, or the CONFLICT raised when no candidate
    // survives at all. Once committed the ledger has settled the reservation and
    // this second attempt is a documented no-op, so the safety net needs no flag
    // tracking which way the branch above went.
    if (reservationId) await creditLedger.release(reservationId);
  }
}
