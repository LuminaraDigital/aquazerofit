/**
 * Deterministic, context-aware template engine — the offline provider.
 *
 * The whole product must work with zero API keys (AQF-10 principle 5), so this
 * engine produces genuinely useful answers grounded ONLY in the tool data the
 * caller supplies (remaining calories, today's workout, weight trend, …).
 * Phrasing varies via an FNV-1a hash of the input, so identical inputs always
 * produce identical output (evaluable) while different inputs feel alive.
 *
 * Models identify/interpret/explain; CODE calculates: this engine never
 * invents numbers — every figure in its output comes from supplied context.
 */
import { CONSISTENCY_STEADY_DAYS, type ConsistencyState, type ModelGroup } from '@aquazerofit/shared';
import { coachById } from '@aquazerofit/shared';
import { personaHints } from '../prompts';
import { classify } from '../guardrails';

// ---------------------------------------------------------------------------
// Deterministic seeding
// ---------------------------------------------------------------------------

export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function pick<T>(options: readonly T[], seed: number, salt: number): T {
  const idx = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  return options[idx % options.length] as T;
}

// ---------------------------------------------------------------------------
// Context contracts (populated by chat tools / routers — real store data)
// ---------------------------------------------------------------------------

export interface MockNutritionContext {
  kcalTarget: number;
  kcalConsumed: number;
  kcalRemaining: number;
  proteinG: { consumed: number; target: number };
  carbsG: { consumed: number; target: number };
  fatG: { consumed: number; target: number };
  waterMl: { consumed: number; target: number };
  mealsLogged: number;
}

export interface MockWorkoutContext {
  focus: string;
  isRest: boolean;
  status: string;
  exercises: { name: string; sets: number; reps: number }[];
}

export interface MockPlanContext {
  name: string;
  daysPerWeek: number;
}

export interface MockProgressContext {
  currentWeightKg: number | null;
  startWeightKg: number | null;
  deltaKg: number | null;
  /** Raw consecutive-day run. Retained for context breadth, not for copy. */
  streakDays: number;
  /**
   * Recovery-aware consistency. The coach narrates these rather than
   * `streakDays` so it cannot congratulate or console a user on a number the
   * UI has stopped showing them.
   */
  activeDays: number;
  windowDays: number;
  bestDays: number;
  consistencyState: ConsistencyState;
  workoutsCompleted: number;
}

export interface MockProfileContext {
  goal: string;
  activityLevel: string;
  dietaryPreferences: string[];
  allergies: string[];
  equipment: string[];
  unitPreference: string;
}

export interface MockMemoryContext {
  summary: string;
  confirmedFacts: string[];
}

export interface MockChatContext {
  userName?: string;
  nutrition?: MockNutritionContext | null;
  workout?: MockWorkoutContext | null;
  plan?: MockPlanContext | null;
  progress?: MockProgressContext | null;
  profile?: MockProfileContext | null;
  memory?: MockMemoryContext | null;
}

export interface MockVisionCandidate {
  id: string;
  name: string;
  commonServings?: { label: string; grams: number }[];
}

export interface MockVisionContext {
  seedKey: string;
  candidates: MockVisionCandidate[];
  /** AI-04: Optional image data acknowledgment for dev parity.
   * Real providers receive image bytes; mock acknowledges the structure. */
  imageBase64?: string;
  imageHash?: string;
}

export interface MockRecCandidate {
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MockRecommendationContext {
  mealType: string;
  remaining: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  candidates: MockRecCandidate[];
}

export interface MockMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MockResult {
  text: string;
  json?: unknown;
}

// ---------------------------------------------------------------------------
// Chat lane — grounded wellness answers
// ---------------------------------------------------------------------------

const OPENERS = [
  'Here’s where you stand today:',
  'Quick look at your day so far:',
  'Let’s check the numbers:',
  'Good question. Here’s your snapshot:',
  'Happy to help. This is what your data says:',
] as const;

const CLOSERS = [
  'Small consistent steps win, and you’re doing the work.',
  'Keep it steady; consistency beats intensity.',
  'Nice momentum. Keep listening to your body.',
  'You’ve got this. One meal, one session at a time.',
  'Proud of the effort you’re putting in.',
] as const;

const r = (n: number) => Math.round(n);

function nutritionLines(n: MockNutritionContext, seed: number): string[] {
  const lines: string[] = [];
  if (n.kcalRemaining >= 0) {
    lines.push(
      pick(
        [
          `You’ve logged ${r(n.kcalConsumed)} kcal of your ${r(n.kcalTarget)} kcal target, with ${r(n.kcalRemaining)} kcal remaining today.`,
          `So far today: ${r(n.kcalConsumed)} kcal in, leaving about ${r(n.kcalRemaining)} kcal of your ${r(n.kcalTarget)} kcal budget.`,
        ],
        seed,
        11,
      ),
    );
  } else {
    lines.push(
      `You’re about ${r(Math.abs(n.kcalRemaining))} kcal over today’s ${r(n.kcalTarget)} kcal target. No drama, tomorrow is a clean slate. A lighter dinner or a walk can help balance things out.`,
    );
  }
  const pGap = n.proteinG.target - n.proteinG.consumed;
  if (pGap > 15) {
    lines.push(
      `Protein is at ${r(n.proteinG.consumed)} g of ${r(n.proteinG.target)} g, roughly ${r(pGap)} g to go, so something protein-forward would fit well next.`,
    );
  } else {
    lines.push(`Protein looks solid: ${r(n.proteinG.consumed)} g of your ${r(n.proteinG.target)} g goal.`);
  }
  const wPct = n.waterMl.target > 0 ? Math.round((n.waterMl.consumed / n.waterMl.target) * 100) : 0;
  lines.push(
    wPct >= 80
      ? `Hydration is on point: ${n.waterMl.consumed} ml of ${n.waterMl.target} ml (${wPct}%).`
      : `Hydration check: ${n.waterMl.consumed} ml of ${n.waterMl.target} ml (${wPct}%). A glass now would help.`,
  );
  return lines;
}

function workoutLines(w: MockWorkoutContext | null | undefined, seed: number): string[] {
  if (!w) return ['You don’t have a training plan yet. Generate one from the Workouts tab and I can walk you through it.'];
  if (w.isRest) {
    return [
      pick(
        [
          'Today is a scheduled rest day, and recovery is where the adaptation happens. A gentle walk or some stretching is plenty.',
          'Rest day today. Let the muscles rebuild; light movement and good sleep are the workout.',
        ],
        seed,
        13,
      ),
    ];
  }
  const list = w.exercises
    .slice(0, 4)
    .map((e) => `${e.name} (${e.sets}×${e.reps})`)
    .join(', ');
  const status =
    w.status === 'completed'
      ? 'Already completed. Great work today!'
      : 'Warm up first, and stop if anything hurts.';
  return [`Today’s session is ${w.focus}: ${list}. ${status}`];
}

function progressLines(p: MockProgressContext | null | undefined, seed: number): string[] {
  if (!p) return ['Log a weigh-in and a few meals and I can show you a trend.'];
  const lines: string[] = [];
  if (p.currentWeightKg != null && p.deltaKg != null && p.startWeightKg != null) {
    const dir = p.deltaKg < 0 ? 'down' : p.deltaKg > 0 ? 'up' : 'holding steady at';
    if (p.deltaKg === 0) {
      lines.push(`Your weight is holding steady at ${p.currentWeightKg.toFixed(1)} kg.`);
    } else {
      lines.push(
        `You’re at ${p.currentWeightKg.toFixed(1)} kg, ${dir} ${Math.abs(p.deltaKg).toFixed(1)} kg over the recorded period. ${
          p.deltaKg < 0 ? 'That’s a steady, sustainable trend.' : 'Trends wobble; the weekly average is what matters.'
        }`,
      );
    }
  }
  // Consistency is narrated from the window count, never the consecutive run.
  // The old copy fired only when the run exceeded one day, so a user who missed
  // yesterday got silence at the exact moment encouragement matters most — and
  // "showing up daily" framed anything short of perfect as falling short.
  // Every state gets a line, and none of them describe a loss.
  const window = `${p.activeDays} of the last ${p.windowDays} days`;
  switch (p.consistencyState) {
    case 'steady':
      lines.push(
        pick(
          [
            `You've logged ${window}, and that consistency is the real engine of progress.`,
            `${window} logged. That's a habit, not a run of luck.`,
          ],
          seed,
          17,
        ),
      );
      break;
    case 'recovering':
      lines.push(
        pick(
          [
            `You're back at it, and you've still got ${window} behind you. Picking it up again is the whole skill.`,
            `Coming back counts. ${window} logged, and today adds to it.`,
          ],
          seed,
          17,
        ),
      );
      break;
    case 'building':
      lines.push(`${window} logged so far. That's the base to build on.`);
      break;
    case 'resting':
      lines.push(
        `Whenever you're ready to pick it back up, one log is all it takes to start again.`,
      );
      break;
  }
  if (p.bestDays >= CONSISTENCY_STEADY_DAYS && p.consistencyState !== 'steady') {
    lines.push(`Your best run so far is ${p.bestDays} days. You've done this before.`);
  }
  if (p.workoutsCompleted > 0) {
    lines.push(`Workouts completed so far: ${p.workoutsCompleted}.`);
  }
  return lines;
}

type Intent = 'nutrition' | 'workout' | 'progress' | 'water' | 'plan' | 'greeting' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/\b(water|hydrat|drink)\b/.test(m)) return 'water';
  if (/\b(kcal|calorie|eat|food|meal|dinner|lunch|breakfast|snack|macro|protein|carb|fat|hungry|nutrition)\b/.test(m)) {
    return 'nutrition';
  }
  if (/\b(workout|train|exercise|gym|session|sets?|reps?|lift)\b/.test(m)) return 'workout';
  if (/\b(weight|progress|trend|streak|losing|gained?|scale)\b/.test(m)) return 'progress';
  if (/\bplan\b/.test(m)) return 'plan';
  if (/^(hi|hey|hello|yo|g'?day|morning|good\s+(morning|afternoon|evening))\b/.test(m.trim())) return 'greeting';
  return 'general';
}

/**
 * Who the offline engine speaks as. The selected coach when one is known,
 * otherwise the P-07 hints — so a keyless demo still sounds like the character
 * the user picked rather than like the default for everyone.
 */
function personaFor(coachId: string | undefined): { name: string; tone: string } {
  const coach = coachById(coachId);
  if (coach) return { name: coach.name.split(' ')[0]!, tone: coach.voice.word.toLowerCase() };
  return personaHints();
}

function chatReply(messages: MockMessage[], ctx: MockChatContext, coachId?: string): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const seed = fnv1a(lastUser + JSON.stringify([ctx.nutrition?.kcalConsumed, ctx.progress?.streakDays]));
  const persona = personaFor(coachId);
  const intent = detectIntent(lastUser);
  const parts: string[] = [];

  const hello = ctx.userName ? `Hey ${ctx.userName}! ` : '';

  switch (intent) {
    case 'nutrition':
      parts.push(pick(OPENERS, seed, 3));
      if (ctx.nutrition) parts.push(...nutritionLines(ctx.nutrition, seed));
      else parts.push('You haven’t logged anything yet today. Once you do, I can track your budget in real time.');
      break;
    case 'water': {
      const w = ctx.nutrition?.waterMl;
      parts.push(
        w
          ? `You’ve had ${w.consumed} ml of your ${w.target} ml water target today${
              w.consumed >= w.target ? '. Target hit, well done!' : `, with ${w.target - w.consumed} ml to go.`
            }`
          : 'No water logged yet today. Tap the water card on your dashboard to add a glass.',
      );
      break;
    }
    case 'workout':
      parts.push(...workoutLines(ctx.workout, seed));
      break;
    case 'plan':
      parts.push(
        ctx.plan
          ? `You’re on “${ctx.plan.name}”, ${ctx.plan.daysPerWeek} training days a week.`
          : 'You don’t have an active training plan yet. You can generate one from the Workouts tab.',
      );
      parts.push(...workoutLines(ctx.workout, seed));
      break;
    case 'progress':
      parts.push(...progressLines(ctx.progress, seed));
      break;
    case 'greeting':
    case 'general':
    default: {
      parts.push(`${hello}I’m ${persona.name}, your wellness coach. ${pick(OPENERS, seed, 5)}`);
      if (ctx.nutrition) {
        parts.push(
          ctx.nutrition.kcalRemaining >= 0
            ? `Food: ${r(ctx.nutrition.kcalConsumed)} / ${r(ctx.nutrition.kcalTarget)} kcal logged (${r(ctx.nutrition.kcalRemaining)} kcal left).`
            : `Food: ${r(ctx.nutrition.kcalConsumed)} kcal logged, a touch over your ${r(ctx.nutrition.kcalTarget)} kcal target.`,
        );
      }
      const wl = workoutLines(ctx.workout, seed);
      if (wl.length) parts.push(wl[0] as string);
      if (ctx.progress && ctx.progress.streakDays > 1) {
        parts.push(`Streak: ${ctx.progress.streakDays} days of consistent logging.`);
      }
      parts.push('Ask me about your meals, today’s workout, or how your weight is trending.');
      break;
    }
  }

  parts.push(pick(CLOSERS, seed, 7));
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Vision lane — identification only; calories are computed by CODE upstream
// ---------------------------------------------------------------------------

interface MockVisionPrediction {
  foodId: string;
  name: string;
  estimatedGrams: number;
  confidence: number;
}

function visionIdentify(ctx: MockVisionContext): { predictions: MockVisionPrediction[] } {
  const candidates = ctx.candidates;
  if (candidates.length === 0) return { predictions: [] };
  
  // AI-04: Acknowledge image parameter for dev parity
  // In real providers, image bytes are sent; here we log receipt and use seed for determinism
  const hasImage = !!(ctx.imageBase64 || ctx.imageHash);
  const seedInput = hasImage 
    ? `${ctx.seedKey}|img:${ctx.imageHash ?? 'b64'}${ctx.imageBase64?.slice(0, 32) ?? ''}`
    : ctx.seedKey;
  const seed = fnv1a(seedInput);
  
  const count = Math.min(candidates.length, 2 + (seed % 3)); // 2–4 foods
  const predictions: MockVisionPrediction[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i += 1) {
    let idx = (seed >>> (i * 5)) % candidates.length;
    let guard = 0;
    while (used.has(idx) && guard < candidates.length) {
      idx = (idx + 7) % candidates.length;
      guard += 1;
    }
    used.add(idx);
    const food = candidates[idx] as MockVisionCandidate;
    const serving = food.commonServings?.[0]?.grams;
    const grams = serving && serving > 0 ? serving : 80 + ((seed >>> (i * 3)) % 23) * 10; // 80–300 g
    const confidence = 0.55 + (((seed >>> (i * 4)) % 41) / 100); // 0.55–0.95
    predictions.push({
      foodId: food.id,
      name: food.name,
      estimatedGrams: Math.round(grams),
      confidence: Math.round(confidence * 100) / 100,
    });
  }
  return { predictions };
}

// ---------------------------------------------------------------------------
// Structured lane — rank meal candidates by fit to remaining macros
// ---------------------------------------------------------------------------

function rankRecommendations(ctx: MockRecommendationContext): {
  rankedIds: string[];
  rationale: string;
} {
  const { remaining, candidates, mealType } = ctx;
  // Aim the meal at roughly the remaining budget (or a sensible share of it).
  const kcalGoal = Math.max(250, Math.min(remaining.kcal, remaining.kcal > 1200 ? remaining.kcal * 0.4 : remaining.kcal));
  const proteinGoal = Math.max(15, remaining.proteinG * 0.4);

  const scored = candidates
    .map((c) => {
      const kcalFit = Math.abs(c.kcal - kcalGoal) / Math.max(kcalGoal, 1);
      const proteinFit = Math.max(0, proteinGoal - c.proteinG) / Math.max(proteinGoal, 1);
      const overBudget = remaining.kcal > 0 && c.kcal > remaining.kcal ? 1.5 : 0;
      return { id: c.id, name: c.name, kcal: c.kcal, proteinG: c.proteinG, score: kcalFit + proteinFit + overBudget };
    })
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

  const top = scored[0];
  const rationale = top
    ? `Picked for your ${mealType}: it fits your remaining ~${Math.round(remaining.kcal)} kcal budget at ${Math.round(
        top.kcal,
      )} kcal and adds ${Math.round(top.proteinG)} g protein toward the ${Math.round(
        remaining.proteinG,
      )} g you have left today.`
    : 'No suitable candidates were available.';

  return { rankedIds: scored.map((s) => s.id), rationale };
}

// ---------------------------------------------------------------------------
// Plan lanes (P-05 plan generation / P-06 exercise swap) — deterministic
// offline versions so plan features work with zero keys and in evals.
// The mock only arranges the caller-supplied pool; planEngine.ts re-validates
// its output through the exact same deterministic gate as a real provider.
// ---------------------------------------------------------------------------

export interface MockPoolExercise {
  id: string;
  name: string;
  category: 'strength' | 'cardio' | 'mobility' | 'core';
  primaryMuscles: string[];
  equipment: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

interface MockPlanGenContext {
  daysPerWeek: number;
  profile?: { exerciseExperience?: string; goal?: string };
  pool: MockPoolExercise[];
}

const DIFFICULTY_RANK: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };

function prescriptionForLevel(experience: string, category: string): { sets: number; reps: number; restSeconds: number } {
  if (category === 'cardio') return { sets: 3, reps: 30, restSeconds: experience === 'beginner' ? 45 : 30 };
  if (category === 'core' || category === 'mobility') {
    if (experience === 'beginner') return { sets: 3, reps: 12, restSeconds: 45 };
    if (experience === 'intermediate') return { sets: 3, reps: 15, restSeconds: 45 };
    return { sets: 4, reps: 15, restSeconds: 60 };
  }
  if (experience === 'beginner') return { sets: 3, reps: 10, restSeconds: 60 };
  if (experience === 'intermediate') return { sets: 3, reps: 12, restSeconds: 75 };
  return { sets: 4, reps: 10, restSeconds: 90 };
}

const FOCUS_BY_CATEGORY: Record<string, string> = {
  strength: 'Strength',
  cardio: 'Cardio & Conditioning',
  core: 'Core Stability',
  mobility: 'Mobility & Recovery',
};

/**
 * Offline P-05 draft: rotates the pool deterministically (FNV-1a seeded),
 * prescribes by experience level, prescribes NO external load (weightKg null —
 * the conservative default), and emits simple replace-op progression rules.
 * Emits a full seven-day week with `daysPerWeek` training days spaced through
 * it (AQF-11 recovery rule) — see the distribution note in the loop.
 */
const DAYS_IN_WEEK = 7;

function planDraftOffline(ctx: MockPlanGenContext): Record<string, unknown> {
  const pool = [...ctx.pool].sort((a, b) => a.id.localeCompare(b.id));
  if (pool.length === 0 || !Number.isInteger(ctx.daysPerWeek) || ctx.daysPerWeek < 1 || ctx.daysPerWeek > 7) {
    return {};
  }
  const experience = ctx.profile?.exerciseExperience ?? 'beginner';
  const experienceRank = DIFFICULTY_RANK[experience] ?? 0;
  // Never prescribe above the user's level, even if the pool says otherwise.
  const usable = pool.filter((e) => (DIFFICULTY_RANK[e.difficulty] ?? 0) <= experienceRank);
  if (usable.length === 0) return {};

  const seed = fnv1a(`${ctx.daysPerWeek}|${experience}|${usable.map((e) => e.id).join(',')}`);
  const days: Record<string, unknown>[] = [];
  const progressionRules: Record<string, unknown>[] = [];
  const perDay = Math.min(4, Math.max(2, Math.ceil(usable.length / ctx.daysPerWeek)));

  /*
   * Seven days, of which exactly `daysPerWeek` are training days.
   *
   * This loop used to run to `ctx.daysPerWeek` and then mark every fourth of
   * THOSE as rest, so it emitted too few days and too few training days at
   * once. Both gates that consume this draft require a full week with exactly
   * `daysPerWeek` non-rest, so nothing it produced was ever accepted — and
   * since the offline engine is what every keyless deployment and every eval
   * run uses, that was the common case rather than an edge one.
   *
   * The rest days are chosen by Bresenham distribution rather than a modulo
   * rule: `(d - 1) * daysPerWeek % 7 < daysPerWeek` selects exactly
   * `daysPerWeek` of the seven and spreads them, starting on day 1. That
   * replaces the old beginner recovery rule, which met AQF-11 by quietly
   * handing a beginner fewer sessions than they asked for; spacing the
   * sessions achieves the same recovery without silently changing the
   * request, and `generatePlanSchema` caps the field at 6, so a week always
   * carries at least one rest day.
   */
  const isTrainingDay = (d: number): boolean => ((d - 1) * ctx.daysPerWeek) % DAYS_IN_WEEK < ctx.daysPerWeek;

  for (let day = 1; day <= DAYS_IN_WEEK; day += 1) {
    if (!isTrainingDay(day)) {
      days.push({ order: day, focus: 'Rest', isRest: true, slots: [] });
      continue;
    }
    const slots: Record<string, unknown>[] = [];
    for (let slot = 1; slot <= perDay; slot += 1) {
      const exercise = usable[(seed + day * 7 + slot * 3) % usable.length]!;
      const rx = prescriptionForLevel(experience, exercise.category);
      const entryId = `se-${day}-${slot}`;
      slots.push({
        order: slot,
        entries: [
          {
            id: entryId,
            exerciseId: exercise.id,
            sets: rx.sets,
            reps: rx.reps,
            restSeconds: rx.restSeconds,
            weightKg: null,
            rir: experience === 'beginner' ? 3 : 2,
          },
        ],
      });
      if (slot === 1) {
        progressionRules.push({
          slotEntryId: entryId,
          kind: 'reps',
          iteration: 2,
          value: rx.reps + 2,
          op: 'replace',
          requires: ['reps'],
        });
      }
    }
    const focus = FOCUS_BY_CATEGORY[usable[(seed + day * 7) % usable.length]!.category] ?? 'Full Body';
    days.push({ order: day, focus: `${focus} (Day ${day})`, isRest: false, slots });
  }

  return {
    name: `${ctx.daysPerWeek}-Day ${experience === 'beginner' ? 'Foundations' : 'Progression'} Plan`,
    days,
    progressionRules,
    rationale:
      `A ${ctx.daysPerWeek}-day ${experience} week built only from your available exercises, ` +
      'starting bodyweight-light so technique leads load. Exercise descriptions sourced from wger remain ' +
      'CC-BY-SA; their attribution is preserved wherever they are shown.',
  };
}

interface MockSwapContext {
  exercise: MockPoolExercise & { variationGroup?: string | null };
  pool: MockPoolExercise[];
  reason?: string | null;
}

/** Offline P-06 swap: rank pool exercises by muscle/category overlap with the target. */
function swapSuggestionOffline(ctx: MockSwapContext): Record<string, unknown> {
  const scored = ctx.pool
    .filter((e) => e.id !== ctx.exercise.id)
    .map((e) => {
      const muscleOverlap = e.primaryMuscles.filter((m) => ctx.exercise.primaryMuscles.includes(m)).length;
      const categoryBonus = e.category === ctx.exercise.category ? 1 : 0;
      return { id: e.id, score: muscleOverlap * 2 + categoryBonus };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const exerciseIds = scored.slice(0, 3).map((s) => s.id);
  return {
    exerciseIds,
    rationale:
      exerciseIds.length > 0
        ? `These work the same primary muscles as ${ctx.exercise.name} with equipment you already have${
            ctx.reason ? `, and fit your reason (“${ctx.reason}”)` : ''
          }.`
        : `No safe alternative to ${ctx.exercise.name} exists in the current pool.`,
  };
}



// ---------------------------------------------------------------------------
// Insight lane — summarise supplied statistics only (P-08 contract)
// ---------------------------------------------------------------------------

function insightSummary(context: Record<string, unknown>): string {
  const stats = (context.stats ?? context) as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof stats.deltaKg === 'number') {
    bits.push(
      stats.deltaKg < 0
        ? `Weight is trending down ${Math.abs(stats.deltaKg as number).toFixed(1)} kg.`
        : `Weight is up ${(stats.deltaKg as number).toFixed(1)} kg. Averages matter more than single days.`,
    );
  }
  if (typeof stats.streakDays === 'number' && (stats.streakDays as number) > 0) {
    bits.push(`Logging streak: ${stats.streakDays} days.`);
  }
  if (typeof stats.workoutsCompleted === 'number') {
    bits.push(`${stats.workoutsCompleted} workouts completed.`);
  }
  if (bits.length === 0) bits.push('Keep logging. Insights appear once there is enough data.');
  return bits.join(' ');
}

// ---------------------------------------------------------------------------
// Memory lanes (P-10 extraction / P-11 summary) — deterministic offline
// versions so the memory pipeline works with zero keys and in tests.
// ---------------------------------------------------------------------------

interface MockExtractedFact {
  text: string;
  category: 'preference' | 'constraint' | 'goal' | 'milestone' | 'context';
}

/**
 * P-10 offline extractor: a few conservative patterns over the USER's message
 * only (never the coach reply — P-10 known failure mode). Deterministic:
 * identical input always yields identical facts. Most messages yield [].
 */
export function extractMemoryFactsOffline(userMessage: string): { facts: MockExtractedFact[] } {
  const facts: MockExtractedFact[] = [];
  const diet = /\b(?:i\s*(?:'|’)?m|i\s+am)\s+(vegan|vegetarian|pescatarian|lactose\s+intolerant|gluten[-\s]free)\b/i.exec(userMessage);
  if (diet) facts.push({ text: `Is ${diet[1]!.toLowerCase().replace(/\s+/g, ' ')}`, category: 'constraint' });
  const allergy = /\ballergic\s+to\s+([a-z][a-z\s]{1,40}?)(?=[.,!?]|$)/i.exec(userMessage);
  if (allergy) facts.push({ text: `Allergic to ${allergy[1]!.trim().toLowerCase()}`, category: 'constraint' });
  const pref = /\bi\s+(?:really\s+)?(prefer|hate|dislike|love)\s+([a-z][a-z\s-]{2,50}?)(?=[.,!?]|$)/i.exec(userMessage);
  if (pref) {
    const verb = pref[1]!.toLowerCase();
    const what = pref[2]!.trim().toLowerCase();
    facts.push({
      text: `${verb === 'prefer' ? 'Prefers' : verb === 'love' ? 'Enjoys' : 'Dislikes'} ${what}`,
      category: 'preference',
    });
  }
  const goal = /\b(?:my\s+goal\s+is\s+to|i\s+want\s+to|i\s*(?:'|’)?m\s+training\s+(?:for|to))\s+([a-z0-9][a-z0-9\s-]{2,60}?)(?=[.,!?]|$)/i.exec(userMessage);
  if (goal) facts.push({ text: `Wants to ${goal[1]!.trim().toLowerCase()}`, category: 'goal' });
  return { facts: facts.slice(0, 3) };
}

/** P-11 offline summariser: compress confirmed facts into one plain paragraph. */
function summariseMemoryOffline(confirmedFacts: string[]): string {
  if (confirmedFacts.length === 0) return '';
  return confirmedFacts.join('. ').replace(/\.\./g, '.').concat('.').slice(0, 1200);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface MockOptions {
  context?: Record<string, unknown>;
  seed?: string;
  /** Lane-default override (e.g. P-10/P-11 ride the safetyCheap lane). */
  promptId?: string;
  /** Selected coach persona; falls back to the P-07 hints when absent. */
  coachId?: string;
}

export function mockComplete(task: ModelGroup, messages: MockMessage[], opts: MockOptions = {}): MockResult {
  const context = opts.context ?? {};
  // Memory prompts ride the cheap lane but have their own contracts — dispatch
  // on promptId before the lane default (P-09 classifier) applies.
  if (opts.promptId === 'P-10') {
    const userMessage =
      typeof context.userMessage === 'string'
        ? context.userMessage
        : ([...messages].reverse().find((m) => m.role === 'user')?.content ?? '');
    const json = extractMemoryFactsOffline(userMessage);
    return { text: JSON.stringify(json), json };
  }
  if (opts.promptId === 'P-11') {
    const confirmedFacts = Array.isArray(context.confirmedFacts)
      ? (context.confirmedFacts as unknown[]).filter((f): f is string => typeof f === 'string')
      : [];
    return { text: summariseMemoryOffline(confirmedFacts) };
  }
  // P-05/P-06 ride planStructured/chatFast but have their own contracts —
  // dispatch on promptId before the lane defaults apply.
  if (opts.promptId === 'P-05' && Array.isArray((context as { pool?: unknown[] }).pool)) {
    const json = planDraftOffline(context as unknown as MockPlanGenContext);
    return { text: JSON.stringify(json), json };
  }
  if (
    opts.promptId === 'P-06' &&
    (context as { swap?: unknown }).swap === true &&
    Array.isArray((context as { pool?: unknown[] }).pool)
  ) {
    const json = swapSuggestionOffline(context as unknown as MockSwapContext);
    return { text: JSON.stringify(json), json };
  }
  switch (task) {
    case 'chatFast': {
      const text = chatReply(messages, context as unknown as MockChatContext, opts.coachId);
      return { text };
    }
    case 'visionPrimary': {
      const json = visionIdentify(context as unknown as MockVisionContext);
      return { text: JSON.stringify(json), json };
    }
    case 'planStructured': {
      if (Array.isArray((context as { candidates?: unknown[] }).candidates)) {
        const json = rankRecommendations(context as unknown as MockRecommendationContext);
        return { text: JSON.stringify(json), json };
      }
      return { text: '{}', json: {} };
    }
    case 'safetyCheap': {
      // The deterministic guardrail classifier is authoritative for this lane.
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const label = classify(lastUser).category;
      return { text: JSON.stringify({ category: label }), json: { category: label } };
    }
    case 'insightBatch': {
      const text = insightSummary(context);
      return { text };
    }
    default: {
      return { text: 'OK' };
    }
  }
}
