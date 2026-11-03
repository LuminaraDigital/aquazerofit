/**
 * AI plan engine (wger integration Phase 3) — activates the dormant P-05/P-06
 * prompt lanes on top of the enlarged, wger-imported exercise pool.
 *
 * Contract (frozen; modules/plans and modules/workouts code against it):
 *   tryGenerateAiPlan(req)   → { draft, ai } | null  (null = caller falls back
 *                                                       to the deterministic engine)
 *   suggestExerciseSwap(req) → { exerciseIds, rationale } | null
 *
 * Admission sequence (AQF-07 §4): the caller (plans/workouts routers) owns
 * authenticate → rate limit → tier/credit check → input guardrail. THIS module
 * is the gateway step plus the output-guardrail-and-numeric-rules step: every
 * model output is validated deterministically before it can touch a plan —
 *   · every exerciseId must be inside the supplied (pre-filtered) pool;
 *   · days.length must equal daysPerWeek;
 *   · sets/reps/rest/weight/rir obey the shared zod hard caps (AQF-11);
 *   · prescribed loads are capped relative to bodyweight per experience level
 *     (no prompt output can produce an absurd load for a beginner);
 *   · progression rules must reference real slotEntryIds of the draft;
 *   · defense-in-depth: difficulty and equipment of every referenced exercise
 *     are re-checked against the profile even though the pool is pre-filtered;
 *   · model-authored rationale passes the output guardrail.
 * ANY failure returns null — the deterministic buildPlan remains authoritative.
 */
import type {
  AiMetadata,
  Exercise,
  ExerciseExperience,
  PlanDay,
  PlanSlot,
  ProgressionRule,
  SlotEntry,
  WellnessProfile,
} from '@aquazerofit/shared';
import {
  repsSchema,
  restSecondsSchema,
  rirSchema,
  setsSchema,
  weightKgLoadSchema,
} from '@aquazerofit/shared';
import {
  complete,
  type GatewayMessage,
  type GatewayMeta,
  type GatewayOptions,
  type GatewayResult,
} from './gateway';
import { post as postGuardrail } from './guardrails';
import { loadPrompt } from './prompts';

// ---------------------------------------------------------------------------
// Contract types (exact signatures the parallel FS-Training agent imports)
// ---------------------------------------------------------------------------

export interface AiPlanRequest {
  profile: WellnessProfile;
  pool: Exercise[];
  daysPerWeek: number;
}

export interface AiPlanDraft {
  name: string;
  days: PlanDay[];
  progressionRules: ProgressionRule[];
  rationale: string;
}

export interface SwapRequest {
  exercise: Exercise;
  pool: Exercise[];
  profile: WellnessProfile;
  reason?: string;
}

type CompleteFn = (
  task: 'planStructured' | 'chatFast',
  messages: GatewayMessage[],
  opts: GatewayOptions,
) => Promise<GatewayResult>;

/**
 * Test/eval seam: the eval runner injects adversarial `complete` fakes through
 * this optional second parameter. Production callers pass only `req`.
 */
export interface PlanEngineDeps {
  complete?: CompleteFn;
}

// ---------------------------------------------------------------------------
// Deterministic safety rules (duplicated locally per the team boundary — the
// AI lane never imports another team's service; mirrors plans/service.ts)
// ---------------------------------------------------------------------------

/**
 * A draft always describes a calendar week, so this is a fixed 7 rather than
 * anything derived from the request. `daysPerWeek` selects how many of these
 * days are training days; it never changes how many days there are.
 */
const DAYS_IN_WEEK = 7;

const EXPERIENCE_RANK: Record<ExerciseExperience, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

/** True when the exercise needs nothing beyond the user's equipment. */
function equipmentAllows(exercise: Exercise, profile: WellnessProfile): boolean {
  return exercise.equipment.every((e) => e === 'none' || profile.equipment.includes(e));
}

/**
 * Conservative prescribed-load caps as a multiple of bodyweight (AQF-11 §2:
 * no prompt output may produce absurd loads). Absolute ceiling stays the
 * shared zod cap (1000 kg); beginners get a far tighter envelope.
 */
const LOAD_BODYWEIGHT_MULTIPLE: Record<ExerciseExperience, number> = {
  beginner: 2,
  intermediate: 3,
  advanced: 4,
};

function maxPrescribableLoadKg(profile: WellnessProfile): number {
  return Math.min(1000, profile.weightKg * LOAD_BODYWEIGHT_MULTIPLE[profile.exerciseExperience]);
}

// ---------------------------------------------------------------------------
// Tolerant JSON extraction: strict first, then first-brace→last-brace so a
// model that wraps its JSON in prose still yields a parseable object.
// ---------------------------------------------------------------------------

export function extractJsonTolerant(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to brace-scan
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function resolveJson(result: GatewayResult): unknown {
  if (result.json !== undefined) return result.json;
  return extractJsonTolerant(result.text);
}

// ---------------------------------------------------------------------------
// Draft validation — deterministic, zero-tolerance. Returns a reason string
// on failure (surfaced in eval output and server logs) or null on success.
// ---------------------------------------------------------------------------

interface RawEntry {
  id?: unknown;
  exerciseId?: unknown;
  sets?: unknown;
  reps?: unknown;
  restSeconds?: unknown;
  weightKg?: unknown;
  rir?: unknown;
  repsMax?: unknown;
  notes?: unknown;
}

const PROGRESSION_KINDS = ['weight', 'reps', 'sets', 'rest', 'rir'] as const;
const PROGRESSION_OPS = ['add', 'subtract', 'replace'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateEntry(
  raw: RawEntry,
  ctx: {
    poolById: Map<string, Exercise>;
    profile: WellnessProfile;
    maxLoadKg: number;
  },
): { entry: SlotEntry } | { error: string } {
  if (typeof raw.id !== 'string' || raw.id.trim().length === 0) return { error: 'entry missing id' };
  if (typeof raw.exerciseId !== 'string') return { error: `entry ${raw.id}: exerciseId not a string` };
  const exercise = ctx.poolById.get(raw.exerciseId);
  if (!exercise) return { error: `entry ${raw.id}: exercise ${raw.exerciseId} not in pool` };
  // Defense-in-depth: re-check experience and equipment even though the pool
  // is contractually pre-filtered by the caller (AQF-09 §2.4 second net).
  if (EXPERIENCE_RANK[exercise.difficulty] > EXPERIENCE_RANK[ctx.profile.exerciseExperience]) {
    return { error: `entry ${raw.id}: ${raw.exerciseId} difficulty above user experience` };
  }
  if (!equipmentAllows(exercise, ctx.profile)) {
    return { error: `entry ${raw.id}: ${raw.exerciseId} needs equipment the user lacks` };
  }
  if (!setsSchema.safeParse(raw.sets).success) return { error: `entry ${raw.id}: sets out of range` };
  if (!repsSchema.safeParse(raw.reps).success) return { error: `entry ${raw.id}: reps out of range` };
  if (!restSecondsSchema.safeParse(raw.restSeconds).success) {
    return { error: `entry ${raw.id}: restSeconds out of range` };
  }

  let weightKg: number | null | undefined;
  if (raw.weightKg !== undefined && raw.weightKg !== null) {
    if (!weightKgLoadSchema.safeParse(raw.weightKg).success) {
      return { error: `entry ${raw.id}: weightKg out of range` };
    }
    if ((raw.weightKg as number) > ctx.maxLoadKg) {
      return {
        error: `entry ${raw.id}: weightKg ${raw.weightKg} exceeds the conservative cap ${ctx.maxLoadKg} for ${ctx.profile.exerciseExperience}`,
      };
    }
    weightKg = raw.weightKg as number;
  } else if (raw.weightKg === null) {
    weightKg = null;
  }

  let rir: number | null | undefined;
  if (raw.rir !== undefined && raw.rir !== null) {
    if (!rirSchema.safeParse(raw.rir).success) return { error: `entry ${raw.id}: rir out of range` };
    rir = raw.rir as number;
  } else if (raw.rir === null) {
    rir = null;
  }

  let repsMax: number | null | undefined;
  if (raw.repsMax !== undefined && raw.repsMax !== null) {
    if (!repsSchema.safeParse(raw.repsMax).success || (raw.repsMax as number) < (raw.reps as number)) {
      return { error: `entry ${raw.id}: repsMax out of range or below reps` };
    }
    repsMax = raw.repsMax as number;
  } else if (raw.repsMax === null) {
    repsMax = null;
  }

  const entry: SlotEntry = {
    id: raw.id,
    exerciseId: raw.exerciseId,
    sets: raw.sets as number,
    reps: raw.reps as number,
    restSeconds: raw.restSeconds as number,
  };
  if (weightKg !== undefined) entry.weightKg = weightKg;
  if (rir !== undefined) entry.rir = rir;
  if (repsMax !== undefined) entry.repsMax = repsMax;
  if (typeof raw.notes === 'string' && raw.notes.length > 0) {
    entry.notes = raw.notes.slice(0, 280);
  }
  return { entry };
}

function validateProgressionRule(
  raw: unknown,
  entryIds: Set<string>,
  maxLoadKg: number,
): { rule: ProgressionRule } | { error: string } {
  if (!isRecord(raw)) return { error: 'progression rule is not an object' };
  if (typeof raw.slotEntryId !== 'string' || !entryIds.has(raw.slotEntryId)) {
    return { error: `progression rule references unknown slotEntryId ${String(raw.slotEntryId)}` };
  }
  if (typeof raw.kind !== 'string' || !(PROGRESSION_KINDS as readonly string[]).includes(raw.kind)) {
    return { error: `progression rule for ${raw.slotEntryId}: invalid kind` };
  }
  if (!Number.isInteger(raw.iteration) || (raw.iteration as number) < 1 || (raw.iteration as number) > 52) {
    return { error: `progression rule for ${raw.slotEntryId}: iteration out of range` };
  }
  if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) {
    return { error: `progression rule for ${raw.slotEntryId}: value not finite` };
  }
  const op = raw.op === undefined ? undefined : (raw.op as string);
  if (op !== undefined && !(PROGRESSION_OPS as readonly string[]).includes(op)) {
    return { error: `progression rule for ${raw.slotEntryId}: invalid op` };
  }
  if (raw.step !== undefined && raw.step !== 'abs' && raw.step !== 'percent') {
    return { error: `progression rule for ${raw.slotEntryId}: invalid step` };
  }
  if (raw.repeat !== undefined && typeof raw.repeat !== 'boolean') {
    return { error: `progression rule for ${raw.slotEntryId}: repeat not boolean` };
  }
  if (raw.requires !== undefined) {
    if (
      !Array.isArray(raw.requires) ||
      raw.requires.some((r) => typeof r !== 'string' || !(PROGRESSION_KINDS as readonly string[]).includes(r))
    ) {
      return { error: `progression rule for ${raw.slotEntryId}: invalid requires` };
    }
  }

  // Absolute targets (legacy semantics or explicit replace) must respect the
  // same hard caps as prescriptions; deltas only need to be sane in magnitude.
  const absolute = op === undefined || op === 'replace';
  const value = raw.value as number;
  if (absolute) {
    const kindChecks: Record<(typeof PROGRESSION_KINDS)[number], boolean> = {
      weight: weightKgLoadSchema.safeParse(value).success && value <= maxLoadKg,
      reps: repsSchema.safeParse(value).success,
      sets: setsSchema.safeParse(value).success,
      rest: restSecondsSchema.safeParse(value).success,
      rir: rirSchema.safeParse(value).success,
    };
    if (!kindChecks[raw.kind as (typeof PROGRESSION_KINDS)[number]]) {
      return { error: `progression rule for ${raw.slotEntryId}: absolute ${raw.kind} target out of range` };
    }
  } else if (Math.abs(value) > 500) {
    return { error: `progression rule for ${raw.slotEntryId}: delta magnitude implausible` };
  }
  if (raw.step === 'percent' && (value <= 0 || value > 100)) {
    return { error: `progression rule for ${raw.slotEntryId}: percent step out of range` };
  }

  const rule: ProgressionRule = {
    slotEntryId: raw.slotEntryId,
    kind: raw.kind as ProgressionRule['kind'],
    iteration: raw.iteration as number,
    value,
  };
  if (op !== undefined) rule.op = op as ProgressionRule['op'];
  if (raw.step !== undefined) rule.step = raw.step as ProgressionRule['step'];
  if (raw.repeat !== undefined) rule.repeat = raw.repeat as boolean;
  if (raw.requires !== undefined) rule.requires = raw.requires as ProgressionRule['requires'];
  return { rule };
}

/**
 * Validate a raw model payload against the request. Exported for unit tests
 * and the eval runner; production flow goes through tryGenerateAiPlan.
 */
export function validatePlanDraft(
  raw: unknown,
  req: AiPlanRequest,
): { draft: AiPlanDraft } | { error: string } {
  if (!isRecord(raw)) return { error: 'payload is not a JSON object' };
  if (!Number.isInteger(req.daysPerWeek) || req.daysPerWeek < 1 || req.daysPerWeek > 7) {
    return { error: `daysPerWeek ${req.daysPerWeek} out of range (1–7)` };
  }
  if (req.pool.length === 0) return { error: 'exercise pool is empty' };

  const poolById = new Map(req.pool.map((e) => [e.id, e]));
  const maxLoadKg = maxPrescribableLoadKg(req.profile);

  if (typeof raw.name !== 'string' || raw.name.trim().length === 0 || raw.name.length > 80) {
    return { error: 'name missing or too long' };
  }
  if (typeof raw.rationale !== 'string' || raw.rationale.trim().length === 0 || raw.rationale.length > 2000) {
    return { error: 'rationale missing or too long' };
  }
  /*
   * A draft is a whole calendar week: seven days, with `daysPerWeek` of them
   * training days and the rest marked `isRest`. It is NOT a list of sessions.
   *
   * This used to demand `days.length === req.daysPerWeek`, matching P-05 1.1.0
   * and nothing else. The second gate — `plans/service.aiDraftIsValid`, which
   * mirrors the deterministic `buildPlan` whose shape the app actually renders
   * — has always required seven days with `daysPerWeek` non-rest. No draft can
   * satisfy both unless `daysPerWeek === 7`, and `generatePlanSchema` caps the
   * field at 6. So this lane spent a planStructured call on every single
   * `POST /plans/generate`, had the result rejected downstream, and fell back
   * to `buildPlan` — every time, since the day it shipped. The evals never
   * caught it because they exercise this function directly and stop before the
   * gate that disagreed.
   *
   * The non-rest count is checked here as well as downstream deliberately:
   * a draft that fails it is one this lane can still describe precisely, and
   * an error naming the real mismatch beats a generic rejection two files away.
   */
  if (!Array.isArray(raw.days) || raw.days.length !== DAYS_IN_WEEK) {
    return {
      error: `days length ${Array.isArray(raw.days) ? raw.days.length : 'n/a'} != ${DAYS_IN_WEEK} (a draft is a full calendar week)`,
    };
  }
  const trainingDayCount = (raw.days as unknown[]).filter(
    (d) => isRecord(d) && d.isRest === false,
  ).length;
  if (trainingDayCount !== req.daysPerWeek) {
    return {
      error: `training days ${trainingDayCount} != daysPerWeek ${req.daysPerWeek}`,
    };
  }

  const days: PlanDay[] = [];
  const entryIds = new Set<string>();
  const seenDayOrders = new Set<number>();

  for (const rawDay of raw.days as unknown[]) {
    if (!isRecord(rawDay)) return { error: 'day is not an object' };
    /*
     * Orders are 1..7 with no gaps and no repeats. The range half matters as
     * much as the uniqueness half: seven distinct orders of 1,2,3,4,5,6,99
     * would satisfy a bare uniqueness check here and then be rejected by
     * `aiDraftIsValid` downstream, which is the exact class of gate-1-passes /
     * gate-2-rejects waste this validator was just corrected for.
     */
    if (
      !Number.isInteger(rawDay.order) ||
      (rawDay.order as number) < 1 ||
      (rawDay.order as number) > DAYS_IN_WEEK ||
      seenDayOrders.has(rawDay.order as number)
    ) {
      return { error: `day order missing, out of range 1–${DAYS_IN_WEEK}, or duplicated` };
    }
    seenDayOrders.add(rawDay.order as number);
    if (typeof rawDay.focus !== 'string' || rawDay.focus.trim().length === 0) {
      return { error: `day ${rawDay.order}: focus missing` };
    }
    if (typeof rawDay.isRest !== 'boolean') return { error: `day ${rawDay.order}: isRest not boolean` };
    if (!Array.isArray(rawDay.slots)) return { error: `day ${rawDay.order}: slots not an array` };
    if (rawDay.isRest === true && rawDay.slots.length > 0) {
      return { error: `day ${rawDay.order}: rest day must have empty slots` };
    }
    if (rawDay.isRest === false && rawDay.slots.length === 0) {
      return { error: `day ${rawDay.order}: training day must have at least one slot` };
    }

    const slots: PlanSlot[] = [];
    const seenSlotOrders = new Set<number>();
    for (const rawSlot of rawDay.slots as unknown[]) {
      if (!isRecord(rawSlot)) return { error: `day ${rawDay.order}: slot is not an object` };
      if (!Number.isInteger(rawSlot.order) || seenSlotOrders.has(rawSlot.order as number)) {
        return { error: `day ${rawDay.order}: slot order missing or duplicated` };
      }
      seenSlotOrders.add(rawSlot.order as number);
      if (!Array.isArray(rawSlot.entries) || rawSlot.entries.length === 0) {
        return { error: `day ${rawDay.order} slot ${rawSlot.order}: entries missing` };
      }
      const entries: SlotEntry[] = [];
      for (const rawEntry of rawSlot.entries as unknown[]) {
        if (!isRecord(rawEntry)) return { error: `day ${rawDay.order}: entry is not an object` };
        const result = validateEntry(rawEntry as RawEntry, {
          poolById,
          profile: req.profile,
          maxLoadKg,
        });
        if ('error' in result) return { error: `day ${rawDay.order}: ${result.error}` };
        if (entryIds.has(result.entry.id)) return { error: `duplicate slotEntryId ${result.entry.id}` };
        entryIds.add(result.entry.id);
        entries.push(result.entry);
      }
      slots.push({ order: rawSlot.order as number, entries });
    }

    const day: PlanDay = {
      order: rawDay.order as number,
      focus: rawDay.focus,
      isRest: rawDay.isRest,
      slots,
    };
    days.push(day);
  }

  const progressionRules: ProgressionRule[] = [];
  if (raw.progressionRules !== undefined) {
    if (!Array.isArray(raw.progressionRules)) return { error: 'progressionRules not an array' };
    for (const rawRule of raw.progressionRules as unknown[]) {
      const result = validateProgressionRule(rawRule, entryIds, maxLoadKg);
      if ('error' in result) return result;
      progressionRules.push(result.rule);
    }
  }

  // Output guardrail on the model-authored prose before it can reach a user.
  if (postGuardrail(raw.rationale as string).blocked) {
    return { error: 'rationale blocked by output guardrail' };
  }

  return {
    draft: {
      name: (raw.name as string).trim(),
      days,
      progressionRules,
      rationale: (raw.rationale as string).trim(),
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt payload shaping — compact pool per the P-05/P-06 pool contract
// ---------------------------------------------------------------------------

function compactPool(pool: Exercise[]) {
  return pool.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    primaryMuscles: e.primaryMuscles,
    equipment: e.equipment,
    difficulty: e.difficulty,
  }));
}

function compactProfile(profile: WellnessProfile) {
  return {
    exerciseExperience: profile.exerciseExperience,
    goal: profile.goal,
    equipment: profile.equipment,
    weightKg: profile.weightKg,
    age: profile.age,
    sex: profile.sex,
  };
}

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/**
 * P-05 lane: propose a weekly training-plan draft from the pre-filtered pool.
 * Returns null on ANY failure (provider error, invalid JSON, deterministic
 * validation failure) so the caller falls back to the deterministic engine.
 */
export async function tryGenerateAiPlan(
  req: AiPlanRequest,
  deps?: PlanEngineDeps,
): Promise<{ draft: AiPlanDraft; ai: AiMetadata } | null> {
  try {
    if (!Number.isInteger(req.daysPerWeek) || req.daysPerWeek < 1 || req.daysPerWeek > 7) return null;
    if (req.pool.length === 0) return null;

    const run = deps?.complete ?? complete;
    const result = await run(
      'planStructured',
      [
        { role: 'system', content: loadPrompt('P-05').content },
        {
          role: 'user',
          content: [
            `Generate a ${req.daysPerWeek}-day weekly training plan draft from this pre-filtered pool.`,
            'Output STRICT JSON only, matching the documented output schema exactly.',
            JSON.stringify({
              profile: compactProfile(req.profile),
              daysPerWeek: req.daysPerWeek,
              pool: compactPool(req.pool),
            }),
          ].join('\n'),
        },
      ],
      {
        json: true,
        promptId: 'P-05',
        temperature: 0.3,
        maxTokens: 4096,
        context: {
          profile: compactProfile(req.profile),
          daysPerWeek: req.daysPerWeek,
          pool: compactPool(req.pool),
        },
      },
    );

    const validated = validatePlanDraft(resolveJson(result), req);
    if ('error' in validated) {
      console.error('[ai-plan-engine] P-05 draft rejected:', validated.error);
      return null;
    }
    return { draft: validated.draft, ai: result.meta };
  } catch (err) {
    // Error hygiene: internals stay in the server log; the caller sees only
    // null and falls back to the deterministic engine (AQF-10 principle 5).
    console.error('[ai-plan-engine] P-05 generation failed', err);
    return null;
  }
}

/**
 * P-06 lane (swap mode): propose replacement exercise ids from the supplied
 * pool for one exercise. Returns null on any failure — callers keep their
 * deterministic swap (same primary muscle + owned equipment).
 */
export async function suggestExerciseSwap(
  req: SwapRequest,
  deps?: PlanEngineDeps,
): Promise<{ exerciseIds: string[]; rationale: string; ai: GatewayMeta } | null> {
  try {
    if (req.pool.length === 0) return null;

    const run = deps?.complete ?? complete;
    const result = await run(
      'chatFast',
      [
        { role: 'system', content: loadPrompt('P-06').content },
        {
          role: 'user',
          content: [
            `Suggest up to 3 swap candidates for "${req.exercise.name}" (${req.exercise.id}) from the supplied pool only.`,
            req.reason ? `User reason: ${req.reason}` : 'No reason given.',
            'Output STRICT JSON only: {"exerciseIds":["..."],"rationale":"..."}',
            JSON.stringify({
              exercise: {
                id: req.exercise.id,
                name: req.exercise.name,
                category: req.exercise.category,
                primaryMuscles: req.exercise.primaryMuscles,
                equipment: req.exercise.equipment,
                difficulty: req.exercise.difficulty,
                variationGroup: req.exercise.variationGroup ?? null,
              },
              profile: compactProfile(req.profile),
              pool: compactPool(req.pool),
            }),
          ].join('\n'),
        },
      ],
      {
        json: true,
        promptId: 'P-06',
        temperature: 0.3,
        maxTokens: 512,
        context: {
          swap: true,
          exercise: {
            id: req.exercise.id,
            name: req.exercise.name,
            category: req.exercise.category,
            primaryMuscles: req.exercise.primaryMuscles,
            equipment: req.exercise.equipment,
            difficulty: req.exercise.difficulty,
          },
          profile: compactProfile(req.profile),
          pool: compactPool(req.pool),
          reason: req.reason ?? null,
        },
      },
    );

    const raw = resolveJson(result);
    if (!isRecord(raw)) return null;
    if (!Array.isArray(raw.exerciseIds) || typeof raw.rationale !== 'string') return null;
    const rationale = raw.rationale.trim();
    if (rationale.length === 0 || rationale.length > 1000) return null;

    const poolById = new Map(req.pool.map((e) => [e.id, e]));
    const seen = new Set<string>();
    const exerciseIds: string[] = [];
    for (const id of raw.exerciseIds as unknown[]) {
      if (typeof id !== 'string' || seen.has(id) || id === req.exercise.id) continue;
      const exercise = poolById.get(id);
      if (!exercise) return null; // out-of-pool id: refuse the whole suggestion
      if (EXPERIENCE_RANK[exercise.difficulty] > EXPERIENCE_RANK[req.profile.exerciseExperience]) {
        return null;
      }
      if (!equipmentAllows(exercise, req.profile)) return null;
      seen.add(id);
      exerciseIds.push(id);
      if (exerciseIds.length === 3) break;
    }
    if (exerciseIds.length === 0) return null;
    if (postGuardrail(rationale).blocked) return null;

    // `ai` rides along for the same reason tryGenerateAiPlan returns it: the
    // caller bills this lane, and `meta.degraded` is the difference between a
    // provider answering and the offline template engine standing in for one
    // that did not. Without it the swap lane had to charge for both.
    return { exerciseIds, rationale, ai: result.meta };
  } catch (err) {
    console.error('[ai-plan-engine] P-06 swap suggestion failed', err);
    return null;
  }
}
