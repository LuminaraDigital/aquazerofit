/**
 * Coach action proposals and their confirmation (see ./actions for the reading).
 *
 * Deliberate team-boundary exceptions, as with the meal-draft confirm route: a
 * confirmed action runs the same service as the screen that owns it, so totals,
 * credits and safety rules have one home.
 */
import {
  generatePlanSchema,
  type Allergen,
  type ChatActionDraft,
  type CoachAction,
  type Food,
  type MealType,
} from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { getStore } from '../../platform/store';
import { newId, nowIso, readProfile, upsertDoc, whereDocs } from '../ai/util';
import { assertLaneAllowed } from '../ai/tierPolicy';
import { createWaterLog, upsertWeightLog } from '../logs/service';
import { hasConsent } from '../me/service';
import { getRememberedPortionGrams } from '../memory/service';
import { generatePlanForUser, getCurrentPlan } from '../plans/service';
import { getTodayWorkout, swapExercise } from '../workouts/service';
import {
  actionNoteFor,
  CHAT_ACTION_DRAFT_TYPE,
  mealTextOf,
  mealTypeIn,
  parseCoachIntent,
  type PlanFocus,
} from './actions';
import {
  applyRememberedPortions,
  buildDraftItems,
  CHAT_MEAL_DRAFT_TYPE,
  draftNotes,
  segmentMealText,
  tokensOf,
  type ChatMealDraft,
  type ExtractionCandidate,
} from './mealDraft';

type ActionUser = { id: string; tier: Parameters<typeof assertLaneAllowed>[0] };

/** Below this a word only brushed a food name: "cake" against Rice Cakes. */
const MIN_CHAT_MATCH_SCORE = 75;

/** A card older than this no longer describes the user's day. */
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
/** Longer than any model call. A `confirming` draft this old lost its process. */
const CONFIRMING_TTL_MS = 5 * 60 * 1000;

const ageOf = (iso: string): number => Date.now() - Date.parse(iso);

function isLive(draft: ChatActionDraft): boolean {
  if (ageOf(draft.createdAt) > PROPOSAL_TTL_MS) return false;
  return draft.status === 'proposed' || (draft.status === 'confirming' && ageOf(draft.updatedAt) > CONFIRMING_TTL_MS);
}

export async function loadFoodCorpus(): Promise<Food[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return whereDocs<Food>('content', (d: any) => d?.type === 'food');
}

/** Declared allergies, or none when the user has not consented to us reading them. */
export async function allergiesFor(userId: string): Promise<{ allergies: Allergen[]; consented: boolean }> {
  if (!hasConsent(userId, 'wellnessDataProcessing')) return { allergies: [], consented: false };
  const profile = await readProfile(userId);
  return { allergies: profile?.allergies ?? [], consented: true };
}

/** The one exercise in today's session the phrase names, or null when it is not clear. */
function resolveSwap(userId: string, localDate: string, exerciseName: string): CoachAction | null {
  let today: ReturnType<typeof getTodayWorkout>;
  try {
    today = getTodayWorkout(userId, localDate);
  } catch (err) {
    if (err instanceof AppError) return null;
    throw err;
  }
  const session = today.session;
  if (!session || session.status === 'completed') return null;

  const wanted = tokensOf(exerciseName);
  if (wanted.length === 0) return null;
  const matches = session.exercises.filter((entry) => {
    const name = tokensOf(today.exercises[entry.exerciseId]?.name ?? '');
    return wanted.every((token) => name.includes(token));
  });
  const only = matches.length === 1 ? matches[0] : undefined;
  const exercise = only && today.exercises[only.exerciseId];
  if (!exercise) return null;
  return { kind: 'swapExercise', sessionId: session.id, exerciseId: exercise.id, exerciseName: exercise.name };
}

async function resolveRebuild(userId: string, focus: PlanFocus): Promise<CoachAction | null> {
  if (!(await readProfile(userId))) return null;
  const trainingDays = getCurrentPlan(userId)?.days.filter((day) => !day.isRest).length;
  // Out of range falls back to the schema default rather than failing the turn.
  const parsed = generatePlanSchema.safeParse({ daysPerWeek: trainingDays, focus });
  const { daysPerWeek } = parsed.success ? parsed.data : generatePlanSchema.parse({ focus });
  return { kind: 'rebuildPlan', daysPerWeek, focus };
}

/** One shape for both ways a meal draft is born: the meal button and a chat sentence. */
export async function assembleMealDraft(input: {
  userId: string;
  sessionId: string | null;
  text: string;
  localDate: string;
  mealType: MealType;
  candidates: ExtractionCandidate[];
  ai: ChatMealDraft['ai'];
}): Promise<ChatMealDraft> {
  const { userId, sessionId, text, localDate, mealType, candidates, ai } = input;
  const { allergies, consented } = await allergiesFor(userId);
  const foods = await loadFoodCorpus();
  const items = applyRememberedPortions(buildDraftItems(candidates, foods, allergies), foods, (foodId) =>
    getRememberedPortionGrams(userId, foodId),
  );
  const allergyCheck: ChatMealDraft['allergyCheck'] = consented ? 'applied' : 'skippedNoConsent';
  return {
    id: newId('cmd'),
    userId,
    type: CHAT_MEAL_DRAFT_TYPE,
    sessionId,
    sourceText: text,
    mealType,
    localDate,
    // An empty draft is still persisted by the meal button: it is the evaluation
    // signal that tells us which sentences P-12 cannot read, and it is what the
    // client renders instead of silently doing nothing.
    status: items.length > 0 ? 'proposed' : 'empty',
    items,
    notes: draftNotes(items, allergyCheck),
    allergyCheck,
    ai,
    loggedMealId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

/**
 * The segmenter rather than P-12: the turn already paid for one model call, and
 * this keeps a meal sentence from costing a second. Grams, calories and allergen
 * checks come from the corpus either way. No recognised food means no card.
 */
async function proposeMeal(userId: string, sessionId: string, text: string, localDate: string): Promise<boolean> {
  const draft = await assembleMealDraft({
    userId,
    sessionId,
    text,
    localDate,
    mealType: mealTypeIn(text) ?? 'snack',
    candidates: segmentMealText(mealTextOf(text)),
    ai: null,
  });
  // The user did not ask for this card, so it needs a clear read of one food.
  // Anything less stays chat, and the meal button still offers every option.
  const clear = draft.items.some(
    (item) => item.status === 'resolved' && (item.matches[0]?.score ?? 0) >= MIN_CHAT_MATCH_SCORE,
  );
  if (!clear) return false;
  await upsertDoc('ai', draft);
  return true;
}

/** Only the newest proposal of a kind stays live: two rebuild cards would be two rebuilds. */
function supersedeOlder(userId: string, kind: CoachAction['kind']): void {
  const store = getStore();
  const stale = store.where<ChatActionDraft>(
    'ai',
    (d) =>
      d.type === CHAT_ACTION_DRAFT_TYPE && d.userId === userId && d.status === 'proposed' && d.action.kind === kind,
  );
  for (const draft of stale) store.upsert('ai', { ...draft, status: 'superseded', updatedAt: nowIso() });
}

/** Stores a proposal when the sentence calls for one; returns the reply's note. */
export async function proposeCoachAction(
  userId: string,
  sessionId: string,
  text: string,
  localDate: string,
): Promise<string | null> {
  const intent = parseCoachIntent(text);
  if (!intent) return null;

  if (intent.kind === 'logMeal') {
    return (await proposeMeal(userId, sessionId, text, localDate)) ? actionNoteFor(intent) : null;
  }

  const action =
    intent.kind === 'swapExercise'
      ? resolveSwap(userId, localDate, intent.exerciseName)
      : intent.kind === 'rebuildPlan'
        ? await resolveRebuild(userId, intent.focus)
        : intent;
  if (!action) return null;

  supersedeOlder(userId, action.kind);
  const draft: ChatActionDraft = {
    id: newId('cad'),
    userId,
    type: CHAT_ACTION_DRAFT_TYPE,
    sessionId,
    action,
    sourceText: text,
    localDate,
    status: 'proposed',
    loggedId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().upsert('ai', draft);
  return actionNoteFor(action);
}

export function listActionDrafts(userId: string): ChatActionDraft[] {
  return getStore()
    .where<ChatActionDraft>(
      'ai',
      (d) => d.userId === userId && d.type === CHAT_ACTION_DRAFT_TYPE && isLive(d),
    )
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 5);
}

function ownedProposal(userId: string, draftId: string): ChatActionDraft {
  const draft = getStore().byId<ChatActionDraft>('ai', draftId);
  if (!draft || draft.type !== CHAT_ACTION_DRAFT_TYPE || draft.userId !== userId) {
    throw new AppError('NOT_FOUND', 'Proposal not found.');
  }
  if (!isLive(draft)) {
    const state = draft.status === 'proposed' ? 'expired' : draft.status;
    throw new AppError('CONFLICT', `This proposal is already ${state}.`, {
      status: draft.status,
      loggedId: draft.loggedId,
    });
  }
  return draft;
}

async function runAction(user: ActionUser, draft: ChatActionDraft, today: string): Promise<string> {
  const { action, localDate } = draft;
  switch (action.kind) {
    case 'logWater':
      return createWaterLog(user.id, { amountMl: action.amountMl, localDate }).log.id;
    case 'logWeight':
      return upsertWeightLog(user.id, { weightKg: action.weightKg, localDate }).id;
    case 'swapExercise':
      return (await swapExercise(user.id, action.sessionId, action.exerciseId)).session.id;
    case 'rebuildPlan': {
      assertLaneAllowed(user.tier, 'planStructured');
      const { daysPerWeek, focus } = action;
      return (await generatePlanForUser(user.id, { daysPerWeek, focus }, today)).id;
    }
  }
}

/**
 * No await between the status check and `confirming`, so two taps cannot both
 * run the action. A failed action goes back to `proposed` so the user can retry
 * or dismiss it; the services release their own credits on failure.
 */
export async function confirmActionDraft(user: ActionUser, draftId: string, today: string): Promise<ChatActionDraft> {
  const store = getStore();
  const draft = ownedProposal(user.id, draftId);
  store.upsert('ai', { ...draft, status: 'confirming', updatedAt: nowIso() });
  try {
    const loggedId = await runAction(user, draft, today);
    const confirmed: ChatActionDraft = { ...draft, status: 'confirmed', loggedId, updatedAt: nowIso() };
    store.upsert('ai', confirmed);
    return confirmed;
  } catch (err) {
    store.upsert('ai', { ...draft, status: 'proposed', updatedAt: nowIso() });
    throw err;
  }
}

/** Clearing a conversation takes its open cards with it. */
export function dismissSessionDrafts(userId: string, sessionId: string): void {
  const store = getStore();
  const open = store.where<ChatActionDraft | ChatMealDraft>(
    'ai',
    (d) =>
      d.userId === userId &&
      d.sessionId === sessionId &&
      d.status === 'proposed' &&
      (d.type === CHAT_ACTION_DRAFT_TYPE || d.type === CHAT_MEAL_DRAFT_TYPE),
  );
  for (const draft of open) store.upsert('ai', { ...draft, status: 'dismissed', updatedAt: nowIso() });
}

export function dismissActionDraft(userId: string, draftId: string): ChatActionDraft {
  const dismissed: ChatActionDraft = { ...ownedProposal(userId, draftId), status: 'dismissed', updatedAt: nowIso() };
  getStore().upsert('ai', dismissed);
  return dismissed;
}
