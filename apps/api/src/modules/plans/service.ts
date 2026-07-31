/**
 * PlanGenerator — deterministic implementation of AQF-09 §2.4.
 * Pool = exercises whose equipment is a subset of the user's and whose
 * difficulty does not exceed the user's experience. Days carry a focus
 * rotation with rest-day rules; beginners never face consecutive
 * high-intensity days. Progression is data (rules keyed by iteration),
 * not branching code (AQF-06 §3.4). generatedBy is null: this path is
 * pure code, no model involvement.
 */
import { z } from 'zod';
import type {
  AiMetadata,
  Equipment,
  Exercise,
  ExerciseExperience,
  PlanDay,
  PlanSlot,
  ProgressionRule,
  TrainingPlan,
  WellnessProfile,
} from '@aquazerofit/shared';
import {
  repsSchema,
  restSecondsSchema,
  rirSchema,
  setsSchema,
  weightKgLoadSchema,
} from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { getStore, newId } from '../../platform/store';
import { addDays } from '../../platform/dates';

const EXPERIENCE_RANK: Record<ExerciseExperience, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

export type PlanFocus = 'weightLoss' | 'strength' | 'general';

/** True when the exercise needs nothing beyond the user's equipment. */
export function equipmentAllows(exercise: Exercise, userEquipment: Equipment[]): boolean {
  return exercise.equipment.every((e) => e === 'none' || userEquipment.includes(e));
}

export function buildExercisePool(exercises: Exercise[], profile: WellnessProfile): Exercise[] {
  return exercises
    .filter(
      (ex) =>
        EXPERIENCE_RANK[ex.difficulty] <= EXPERIENCE_RANK[profile.exerciseExperience] &&
        equipmentAllows(ex, profile.equipment),
    )
    .sort((a, b) => a.id.localeCompare(b.id)); // deterministic ordering
}

/** Calendar placement of workout days (1..7) chosen to respect rest-day rules. */
const DAY_PATTERNS: Record<number, number[]> = {
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 3, 5, 7],
  5: [1, 2, 4, 5, 7],
  6: [1, 2, 3, 5, 6, 7],
};

const FOCUS_ROTATIONS: Record<PlanFocus, string[]> = {
  general: [
    'Full Body Strength',
    'Cardio & Core',
    'Upper Body Strength',
    'Lower Body Strength',
    'Full Body Strength',
    'Cardio & Core',
  ],
  weightLoss: [
    'Cardio & Core',
    'Full Body Strength',
    'Cardio & Core',
    'Lower Body Strength',
    'Cardio & Core',
    'Full Body Strength',
  ],
  strength: [
    'Upper Body Strength',
    'Lower Body Strength',
    'Full Body Strength',
    'Upper Body Strength',
    'Lower Body Strength',
    'Full Body Strength',
  ],
};

function isHighIntensity(focus: string): boolean {
  return focus.includes('Cardio');
}

/** Muscle/category requirements for each focus, in slot order. */
type SlotSpec = { muscle?: string; category?: Exercise['category'] };
const FOCUS_SLOTS: Record<string, SlotSpec[]> = {
  'Full Body Strength': [
    { muscle: 'chest' },
    { muscle: 'back' },
    { muscle: 'quadriceps' },
    { muscle: 'glutes' },
    { category: 'core' },
  ],
  'Upper Body Strength': [
    { muscle: 'chest' },
    { muscle: 'back' },
    { muscle: 'shoulders' },
    { muscle: 'triceps' },
    { muscle: 'biceps' },
  ],
  'Lower Body Strength': [
    { muscle: 'quadriceps' },
    { muscle: 'glutes' },
    { muscle: 'hamstrings' },
    { muscle: 'calves' },
    { category: 'core' },
  ],
  'Cardio & Core': [
    { category: 'cardio' },
    { category: 'cardio' },
    { category: 'core' },
    { category: 'cardio' },
    { category: 'core' },
  ],
};

interface Prescription {
  sets: number;
  reps: number;
  restSeconds: number;
}

/** Sets/reps/rest by experience and exercise category (AQF-09 §2.4). */
export function prescriptionFor(
  experience: ExerciseExperience,
  category: Exercise['category'],
): Prescription {
  if (category === 'cardio') {
    return { sets: 3, reps: 30, restSeconds: experience === 'beginner' ? 45 : 30 };
  }
  if (category === 'core' || category === 'mobility') {
    if (experience === 'beginner') return { sets: 3, reps: 12, restSeconds: 45 };
    if (experience === 'intermediate') return { sets: 3, reps: 15, restSeconds: 45 };
    return { sets: 4, reps: 15, restSeconds: 60 };
  }
  // strength
  if (experience === 'beginner') return { sets: 3, reps: 10, restSeconds: 60 };
  if (experience === 'intermediate') return { sets: 3, reps: 12, restSeconds: 75 };
  return { sets: 4, reps: 10, restSeconds: 90 };
}

function pickExercise(
  pool: Exercise[],
  spec: SlotSpec,
  rotation: number,
  used: Set<string>,
): Exercise | undefined {
  let candidates = pool.filter((ex) => {
    if (used.has(ex.id)) return false;
    if (spec.category) return ex.category === spec.category;
    if (spec.muscle) return ex.primaryMuscles.includes(spec.muscle) && ex.category !== 'mobility';
    return false;
  });
  if (candidates.length === 0 && spec.muscle) {
    // fall back to secondary-muscle coverage before giving up on the slot
    candidates = pool.filter((ex) => !used.has(ex.id) && ex.secondaryMuscles.includes(spec.muscle!));
  }
  if (candidates.length === 0) return undefined;
  return candidates[rotation % candidates.length];
}

export interface BuildPlanOptions {
  userId: string;
  profile: WellnessProfile;
  exercises: Exercise[];
  daysPerWeek: number;
  focus: PlanFocus;
  startDate: string; // local YYYY-MM-DD
  now?: Date;
}

export function buildPlan(opts: BuildPlanOptions): TrainingPlan {
  const { userId, profile, exercises, daysPerWeek, focus, startDate } = opts;
  const now = opts.now ?? new Date();
  const pool = buildExercisePool(exercises, profile);
  if (pool.length < 8) {
    throw new AppError(
      'CONFLICT',
      'Not enough exercises match your equipment and experience to build a plan',
      { poolSize: pool.length },
    );
  }

  const workoutOrders = DAY_PATTERNS[daysPerWeek] ?? DAY_PATTERNS[4]!;
  const focuses = workoutOrders.map((_, i) => FOCUS_ROTATIONS[focus][i % FOCUS_ROTATIONS[focus].length]!);

  // Beginners: no consecutive high-intensity calendar days (AQF-09 §2.4).
  if (profile.exerciseExperience === 'beginner') {
    for (let i = 1; i < workoutOrders.length; i += 1) {
      const adjacent = workoutOrders[i]! - workoutOrders[i - 1]! === 1;
      if (adjacent && isHighIntensity(focuses[i]!) && isHighIntensity(focuses[i - 1]!)) {
        const swap = focuses.findIndex((f, j) => j > i && !isHighIntensity(f));
        if (swap !== -1) {
          [focuses[i], focuses[swap]] = [focuses[swap]!, focuses[i]!];
        } else {
          focuses[i] = 'Full Body Strength';
        }
      }
    }
  }

  const days: PlanDay[] = [];
  const progressionRules: ProgressionRule[] = [];
  let workoutIdx = 0;

  for (let order = 1; order <= 7; order += 1) {
    const isWorkout = workoutOrders.includes(order);
    if (!isWorkout) {
      days.push({ order, focus: 'Rest', isRest: true, slots: [] });
      continue;
    }
    const dayFocus = focuses[workoutIdx]!;
    const specs = FOCUS_SLOTS[dayFocus] ?? FOCUS_SLOTS['Full Body Strength']!;
    const used = new Set<string>();
    const slots: PlanSlot[] = [];

    specs.forEach((spec, slotIdx) => {
      const exercise = pickExercise(pool, spec, workoutIdx * 2 + slotIdx, used);
      if (!exercise) return; // slot skipped when the pool cannot cover it
      used.add(exercise.id);
      const rx = prescriptionFor(profile.exerciseExperience, exercise.category);
      const entryId = `se-${order}-${slotIdx + 1}`;
      slots.push({
        order: slotIdx + 1,
        entries: [
          {
            id: entryId,
            exerciseId: exercise.id,
            sets: rx.sets,
            reps: rx.reps,
            restSeconds: rx.restSeconds,
          },
        ],
      });
      // Progressive overload as inspectable data, keyed by iteration:
      // reps first, then volume, then rest density (AQF-09 §2.4 overload order).
      progressionRules.push(
        { slotEntryId: entryId, kind: 'reps', iteration: 2, value: rx.reps + 2 },
        { slotEntryId: entryId, kind: 'sets', iteration: 3, value: rx.sets + 1 },
        { slotEntryId: entryId, kind: 'rest', iteration: 4, value: Math.max(30, rx.restSeconds - 15) },
      );
    });

    days.push({ order, focus: dayFocus, isRest: false, slots });
    workoutIdx += 1;
  }

  const focusLabel =
    focus === 'weightLoss' ? 'Weight Loss' : focus === 'strength' ? 'Strength' : 'General Fitness';

  return {
    id: newId('plan'),
    userId,
    type: 'trainingPlan',
    name: `${daysPerWeek}-Day ${focusLabel} Plan`,
    startDate,
    endDate: null,
    currentIteration: 1,
    days,
    progressionRules,
    generatedBy: null,
    createdAt: now.toISOString(),
  };
}

// ----- AI plan lane (P-05) -----
//
// Code calculates, filters and enforces; the model only proposes. The AI
// module is implemented in parallel (modules/ai/planEngine), so it is loaded
// dynamically and every failure mode — missing module, throw, null result,
// invalid draft — falls back to the deterministic buildPlan unchanged.

export interface AiPlanDraft {
  name: string;
  days: PlanDay[];
  progressionRules: ProgressionRule[];
  rationale: string;
}

export interface PlanEngineModule {
  tryGenerateAiPlan(req: {
    profile: WellnessProfile;
    pool: Exercise[];
    daysPerWeek: number;
  }): Promise<{ draft: AiPlanDraft; ai: AiMetadata } | null>;
  suggestExerciseSwap(req: {
    exercise: Exercise;
    pool: Exercise[];
    profile: WellnessProfile;
    reason?: string;
  }): Promise<{ exerciseIds: string[]; rationale: string } | null>;
}

export async function loadPlanEngine(): Promise<PlanEngineModule | null> {
  try {
    return (await import('../ai/planEngine')) as PlanEngineModule;
  } catch {
    return null; // AI lane unavailable — deterministic paths stay authoritative
  }
}

// Structural caps for an AI draft. Values reuse the shared load schemas so no
// prompt output can produce absurd loads (AQF-11); semantic checks (pool
// membership, day coverage, rule references) live in aiDraftIsValid below.
const aiSlotEntrySchema = z.object({
  id: z.string().min(1).max(64),
  exerciseId: z.string().min(1).max(120),
  sets: setsSchema,
  reps: repsSchema,
  restSeconds: restSecondsSchema,
  weightKg: weightKgLoadSchema.nullable().optional(),
  rir: rirSchema.nullable().optional(),
  repsMax: repsSchema.nullable().optional(),
  notes: z.string().max(500).optional(),
});

const aiPlanDaySchema = z.object({
  order: z.number().int().min(1).max(7),
  focus: z.string().min(1).max(80),
  isRest: z.boolean(),
  slots: z
    .array(
      z.object({
        order: z.number().int().min(1).max(20),
        entries: z.array(aiSlotEntrySchema).min(1).max(4),
      }),
    )
    .max(12),
  needLogsToAdvance: z.boolean().optional(),
});

const aiProgressionRuleSchema = z.object({
  slotEntryId: z.string().min(1).max(64),
  kind: z.enum(['weight', 'reps', 'sets', 'rest', 'rir']),
  iteration: z.number().int().min(1).max(520),
  value: z.number().min(-1000).max(1000),
  op: z.enum(['add', 'subtract', 'replace']).optional(),
  step: z.enum(['abs', 'percent']).optional(),
  repeat: z.boolean().optional(),
  requires: z.array(z.enum(['weight', 'reps', 'sets', 'rest', 'rir'])).max(5).optional(),
});

export const aiPlanDraftSchema = z.object({
  name: z.string().min(1).max(120),
  days: z.array(aiPlanDaySchema).length(7),
  progressionRules: z.array(aiProgressionRuleSchema).max(400),
  rationale: z.string().max(4000),
});

/** Per-kind sanity bound on a rule value (deltas and percent jumps included). */
function ruleValueSane(rule: ProgressionRule): boolean {
  const magnitude = Math.abs(rule.value);
  if (rule.step === 'percent') return magnitude <= 50; // no >50% jumps
  switch (rule.kind) {
    case 'weight':
      return magnitude <= 1000;
    case 'rir':
      return magnitude <= 9.5;
    case 'reps':
      return magnitude <= 100;
    case 'sets':
      return magnitude <= 20;
    case 'rest':
      return magnitude <= 900;
  }
}

/**
 * Semantic validation of an AI draft against the deterministic contract:
 * exactly the 7 calendar days, workout-day count matches daysPerWeek, every
 * prescribed exercise comes from the pre-filtered pool, and progression rules
 * reference real entries with sane values.
 */
export function aiDraftIsValid(
  draft: AiPlanDraft,
  pool: Exercise[],
  daysPerWeek: number,
): boolean {
  const parsed = aiPlanDraftSchema.safeParse(draft);
  if (!parsed.success) return false;

  const orders = draft.days.map((d) => d.order).sort((a, b) => a - b);
  if (orders.length !== 7 || orders.some((o, i) => o !== i + 1)) return false;
  if (draft.days.filter((d) => !d.isRest).length !== daysPerWeek) return false;

  const poolIds = new Set(pool.map((ex) => ex.id));
  const entryIds = new Set<string>();
  for (const day of draft.days) {
    if (day.isRest) continue;
    if (day.slots.length === 0) return false; // a workout day must prescribe work
    for (const slot of day.slots) {
      for (const entry of slot.entries) {
        if (!poolIds.has(entry.exerciseId)) return false;
        if (entryIds.has(entry.id)) return false; // rules key on unique entry ids
        entryIds.add(entry.id);
      }
    }
  }
  for (const rule of draft.progressionRules) {
    if (!entryIds.has(rule.slotEntryId)) return false;
    if (!ruleValueSane(rule)) return false;
  }
  return true;
}

function planFromAiDraft(
  userId: string,
  draft: AiPlanDraft,
  ai: AiMetadata,
  startDate: string,
  now: Date,
): TrainingPlan {
  return {
    id: newId('plan'),
    userId,
    type: 'trainingPlan',
    name: draft.name,
    startDate,
    endDate: null,
    currentIteration: 1,
    days: draft.days,
    progressionRules: draft.progressionRules,
    generatedBy: ai,
    createdAt: now.toISOString(),
  };
}

// ----- store-facing service -----

export function getCurrentPlan(userId: string): TrainingPlan | undefined {
  const plans = getStore().where<TrainingPlan>(
    'plans',
    (d) => d.type === 'trainingPlan' && d.userId === userId && d.endDate === null,
  );
  return plans.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export async function generatePlanForUser(
  userId: string,
  input: { daysPerWeek: number; focus: PlanFocus },
  startDate: string,
): Promise<TrainingPlan> {
  const store = getStore();
  const profile = store.findOne<WellnessProfile & { id: string }>(
    'profiles',
    (d) => (d as { type?: string }).type === 'wellnessProfile' && d.userId === userId,
  );
  if (!profile) {
    throw new AppError('NOT_FOUND', 'Complete your wellness profile before generating a plan');
  }
  const exercises = store.where<Exercise>('content', (d) => d.type === 'exercise');
  const now = new Date();

  // P-05: give the AI lane first pass over the same pre-filtered pool the
  // deterministic engine uses. The draft is zod- and contract-validated; any
  // failure falls back to buildPlan unchanged.
  let plan: TrainingPlan | null = null;
  const engine = await loadPlanEngine();
  if (engine) {
    try {
      const pool = buildExercisePool(exercises, profile);
      const result = await engine.tryGenerateAiPlan({
        profile,
        pool,
        daysPerWeek: input.daysPerWeek,
      });
      if (result && result.draft && result.ai && aiDraftIsValid(result.draft, pool, input.daysPerWeek)) {
        plan = planFromAiDraft(userId, result.draft, result.ai, startDate, now);
      }
    } catch {
      plan = null; // model failure must never break plan generation
    }
  }
  if (!plan) {
    plan = buildPlan({
      userId,
      profile,
      exercises,
      daysPerWeek: input.daysPerWeek,
      focus: input.focus,
      startDate,
      now,
    });
  }

  // Close out any previous active plan the day before the new one starts.
  for (const previous of store.where<TrainingPlan>(
    'plans',
    (d) => d.type === 'trainingPlan' && d.userId === userId && d.endDate === null,
  )) {
    store.upsert('plans', { ...previous, endDate: addDays(startDate, -1) });
  }

  store.upsert('plans', plan);
  return plan;
}
