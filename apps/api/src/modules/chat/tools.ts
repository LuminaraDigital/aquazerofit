/**
 * Chat tool executor (AQF-09 module map: ChatService + ToolExecutor).
 * Tools read the store containers directly and compute aggregates locally so
 * the assistant's answers are grounded in the user's real data. Aggregation
 * helpers are deliberately duplicated here (small, local) rather than imported
 * from other teams' services, per the team boundary.
 */
import type {
  ChatToolCall,
  MealLog,
  TrainingPlan,
  WaterLog,
  WeightLog,
  WorkoutSession,
} from '@aquazerofit/shared';
import type {
  MockChatContext,
  MockMemoryContext,
  MockNutritionContext,
  MockPlanContext,
  MockProfileContext,
  MockProgressContext,
  MockWorkoutContext,
} from '../ai/providers/mock';
import { byIdDoc, localToday, readTargets, round1, whereDocs } from '../ai/util';
// Deliberate team-boundary exceptions (same as the router's hasConsent import):
// getProfile is the typed profile read (vs the duck-typed ai/util readProfile)
// and getMemoryForPrompt is the memory module's only sanctioned prompt-facing
// API — both are consent-aware read paths, not aggregation helpers.
import { getProfile } from '../me/service';
import { getMemoryForPrompt } from '../memory/service';

interface ToolOutcome<T> {
  data: T;
  call: ChatToolCall;
}

// ---------------------------------------------------------------------------

export async function getTodayNutrition(
  userId: string,
  localDate: string,
): Promise<ToolOutcome<MockNutritionContext>> {
  const targets = await readTargets(userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dayLogs = await whereDocs<MealLog | WaterLog>('logs', (d: any) => {
    return d?.userId === userId && d?.localDate === localDate && (d?.type === 'mealLog' || d?.type === 'waterLog');
  });
  const meals = dayLogs.filter((d): d is MealLog => d.type === 'mealLog');
  const water = dayLogs.filter((d): d is WaterLog => d.type === 'waterLog');

  const kcalConsumed = meals.reduce((s, m) => s + (m.totalKcal ?? 0), 0);
  const proteinConsumed = meals.reduce((s, m) => s + (m.totalProteinG ?? 0), 0);
  const carbsConsumed = meals.reduce((s, m) => s + (m.totalCarbsG ?? 0), 0);
  const fatConsumed = meals.reduce((s, m) => s + (m.totalFatG ?? 0), 0);
  const waterConsumed = water.reduce((s, w) => s + (w.amountMl ?? 0), 0);

  const data: MockNutritionContext = {
    kcalTarget: targets.kcalTarget,
    kcalConsumed: round1(kcalConsumed),
    kcalRemaining: round1(targets.kcalTarget - kcalConsumed),
    proteinG: { consumed: round1(proteinConsumed), target: targets.proteinG },
    carbsG: { consumed: round1(carbsConsumed), target: targets.carbsG },
    fatG: { consumed: round1(fatConsumed), target: targets.fatG },
    waterMl: { consumed: Math.round(waterConsumed), target: targets.waterMl },
    mealsLogged: meals.length,
  };
  return {
    data,
    call: {
      tool: 'getTodayNutrition',
      args: { localDate },
      resultSummary: `${Math.round(kcalConsumed)}/${targets.kcalTarget} kcal, ${meals.length} meals, ${Math.round(
        waterConsumed,
      )} ml water`,
    },
  };
}

// ---------------------------------------------------------------------------

export async function getCurrentPlan(
  userId: string,
): Promise<ToolOutcome<{ plan: TrainingPlan | null; summary: MockPlanContext | null }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plans = await whereDocs<TrainingPlan>('plans', (d: any) => {
    return d?.userId === userId && d?.type === 'trainingPlan';
  });
  const today = localToday();
  const active = plans
    .filter((p) => p.endDate == null || p.endDate >= today)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  const plan = active ?? null;
  const summary: MockPlanContext | null = plan
    ? { name: plan.name, daysPerWeek: plan.days.filter((d) => !d.isRest).length }
    : null;
  return {
    data: { plan, summary },
    call: {
      tool: 'getCurrentPlan',
      args: {},
      resultSummary: plan ? `active plan "${plan.name}"` : 'no active plan',
    },
  };
}

// ---------------------------------------------------------------------------

export async function getTodayWorkout(
  userId: string,
  localDate: string,
): Promise<ToolOutcome<MockWorkoutContext | null>> {
  // Prefer today's session document if one exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionPred = (d: any) => d?.userId === userId && d?.type === 'workoutSession' && d?.localDate === localDate;
  let sessions = await whereDocs<WorkoutSession>('plans', sessionPred);
  if (sessions.length === 0) {
    sessions = await whereDocs<WorkoutSession>('logs', sessionPred);
  }
  const session = sessions[0];
  if (session) {
    const data: MockWorkoutContext = {
      focus: session.focus,
      isRest: false,
      status: session.status,
      exercises: session.exercises.map((e) => ({ name: e.name, sets: e.setsPlanned, reps: e.reps })),
    };
    return {
      data,
      call: {
        tool: 'getTodayWorkout',
        args: { localDate },
        resultSummary: `${session.focus} (${session.status})`,
      },
    };
  }

  // Otherwise derive today's day from the active plan.
  const { data: planData } = await getCurrentPlan(userId);
  const plan = planData.plan;
  if (!plan || plan.days.length === 0) {
    return {
      data: null,
      call: { tool: 'getTodayWorkout', args: { localDate }, resultSummary: 'no plan and no session today' },
    };
  }
  const start = new Date(`${plan.startDate}T00:00:00Z`).getTime();
  const now = new Date(`${localDate}T00:00:00Z`).getTime();
  const daysSince = Math.max(0, Math.floor((now - start) / 86_400_000));
  const order = (daysSince % 7) + 1;
  const day = plan.days.find((d) => d.order === order) ?? plan.days[0];
  if (!day) {
    return {
      data: null,
      call: { tool: 'getTodayWorkout', args: { localDate }, resultSummary: 'plan has no days' },
    };
  }

  const exercises: MockWorkoutContext['exercises'] = [];
  for (const slot of day.slots) {
    for (const entry of slot.entries) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exercise = await byIdDoc<{ name?: string }>('content', entry.exerciseId);
      exercises.push({
        name: exercise?.name ?? 'Exercise',
        sets: entry.sets,
        reps: entry.reps,
      });
    }
  }
  const data: MockWorkoutContext = {
    focus: day.focus,
    isRest: day.isRest,
    status: 'pending',
    exercises,
  };
  return {
    data,
    call: {
      tool: 'getTodayWorkout',
      args: { localDate },
      resultSummary: day.isRest ? 'rest day' : `${day.focus}, ${exercises.length} exercises`,
    },
  };
}

// ---------------------------------------------------------------------------

export async function getProgressSummary(userId: string): Promise<ToolOutcome<MockProgressContext>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userLogs = await whereDocs<MealLog | WaterLog | WeightLog>('logs', (d: any) => d?.userId === userId);
  const weights = userLogs
    .filter((d): d is WeightLog => d.type === 'weightLog')
    .sort((a, b) => a.localDate.localeCompare(b.localDate));

  const current = weights.length > 0 ? (weights[weights.length - 1] as WeightLog).weightKg : null;
  const start = weights.length > 0 ? (weights[0] as WeightLog).weightKg : null;
  const deltaKg = current != null && start != null ? round1(current - start) : null;

  // Streak = consecutive localDates (ending today or yesterday) with any log.
  const dates = new Set(userLogs.map((l) => l.localDate));
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(localToday())) cursor.setDate(cursor.getDate() - 1); // today not logged yet
  for (;;) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    if (!dates.has(`${y}-${m}-${d}`)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionPred = (d: any) => d?.userId === userId && d?.type === 'workoutSession' && d?.status === 'completed';
  const completedA = await whereDocs<WorkoutSession>('plans', sessionPred);
  const completedB = completedA.length > 0 ? [] : await whereDocs<WorkoutSession>('logs', sessionPred);
  const workoutsCompleted = completedA.length + completedB.length;

  const data: MockProgressContext = {
    currentWeightKg: current,
    startWeightKg: start,
    deltaKg,
    streakDays: streak,
    workoutsCompleted,
  };
  return {
    data,
    call: {
      tool: 'getProgressSummary',
      args: {},
      resultSummary: `weight ${current ?? 'n/a'} kg (Δ ${deltaKg ?? 'n/a'}), streak ${streak}d, ${workoutsCompleted} workouts`,
    },
  };
}

// ---------------------------------------------------------------------------

export interface GatheredContext {
  context: MockChatContext;
  toolCalls: ChatToolCall[];
}

/**
 * Consent-off variant (aiPersonalisation === false): no profile or log data is
 * read or injected into model context. Chat still works generically — each
 * grounding tool reports that personalisation is off instead of returning data.
 */
export function gatherChatContextDenied(userName?: string): GatheredContext {
  const denied = 'not available — personalisation off';
  return {
    context: {
      userName,
      nutrition: null,
      workout: null,
      plan: null,
      progress: null,
      profile: null,
      memory: null,
    },
    toolCalls: [
      { tool: 'getTodayNutrition', args: {}, resultSummary: denied },
      { tool: 'getTodayWorkout', args: {}, resultSummary: denied },
      { tool: 'getCurrentPlan', args: {}, resultSummary: denied },
      { tool: 'getProgressSummary', args: {}, resultSummary: denied },
      { tool: 'getProfileEssentials', args: {}, resultSummary: denied },
      { tool: 'getMemory', args: {}, resultSummary: denied },
    ],
  };
}

/** Run all grounding tools; local reads are cheap and answers stay factual. */
export async function gatherChatContext(
  userId: string,
  localDate: string,
  userName?: string,
): Promise<GatheredContext> {
  const toolCalls: ChatToolCall[] = [];
  const context: MockChatContext = { userName };

  try {
    const nutrition = await getTodayNutrition(userId, localDate);
    context.nutrition = nutrition.data;
    toolCalls.push(nutrition.call);
  } catch {
    context.nutrition = null;
  }
  try {
    const workout = await getTodayWorkout(userId, localDate);
    context.workout = workout.data;
    toolCalls.push(workout.call);
  } catch {
    context.workout = null;
  }
  try {
    const plan = await getCurrentPlan(userId);
    context.plan = plan.data.summary;
    toolCalls.push(plan.call);
  } catch {
    context.plan = null;
  }
  try {
    const progress = await getProgressSummary(userId);
    context.progress = progress.data;
    toolCalls.push(progress.call);
  } catch {
    context.progress = null;
  }

  // Profile essentials (typed me/service read — consent already checked by the
  // caller; this function only runs with aiPersonalisation on).
  try {
    const profile = getProfile(userId);
    if (profile) {
      const essentials: MockProfileContext = {
        goal: profile.goal,
        activityLevel: profile.activityLevel,
        dietaryPreferences: profile.dietaryPreferences,
        allergies: profile.allergies,
        equipment: profile.equipment,
        unitPreference: profile.unitPreference,
      };
      context.profile = essentials;
      toolCalls.push({
        tool: 'getProfileEssentials',
        args: {},
        resultSummary: `goal ${profile.goal}, ${profile.activityLevel} activity, ${profile.allergies.length} allergies`,
      });
    } else {
      context.profile = null;
    }
  } catch {
    context.profile = null;
  }

  // Per-user memory (summary + user-confirmed facts). getMemoryForPrompt
  // re-checks consent itself and never surfaces suggested/rejected facts.
  try {
    const memory = await getMemoryForPrompt(userId);
    if (memory) {
      context.memory = memory as MockMemoryContext;
      toolCalls.push({
        tool: 'getMemory',
        args: {},
        resultSummary: `${memory.confirmedFacts.length} confirmed facts${memory.summary ? ', summary present' : ''}`,
      });
    } else {
      context.memory = null;
    }
  } catch {
    context.memory = null;
  }

  return { context, toolCalls };
}
