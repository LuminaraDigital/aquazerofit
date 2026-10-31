/**
 * The coach reply is grounded when the turn starts. If the user has already
 * logged a meal or generated a plan, that reply can still say "0 meals" and
 * "no plan" while the rest of the app has the newer rows. The latest turn is
 * the one people read as "right now", so its snapshot follows the cache when
 * the cache is ahead. Older turns stay as they were said.
 *
 * Personalisation-off summaries are left alone: the client must not paint
 * log data onto a turn the server refused to ground.
 */
import type { ChatMessage, ChatToolCall } from '@aquazerofit/shared';

export interface CoachLiveSnapshot {
  kcalConsumed: number;
  kcalTarget: number;
  meals: number;
  waterMl: number;
  planName: string | null;
}

const APOSTROPHE = "['\u2019]";

export function countLoggedMeals(meals: object | null | undefined): number {
  if (!meals) return 0;
  return Object.values(meals).reduce<number>((total, list) => {
    return total + (Array.isArray(list) ? list.length : 0);
  }, 0);
}

export function snapshotSuppressed(toolCalls: ChatToolCall[] | undefined): boolean {
  return (toolCalls ?? []).some((call) => /personalisation off/i.test(call.resultSummary));
}

function nutritionSummary(live: CoachLiveSnapshot): string {
  const meals = Math.max(0, Math.round(live.meals));
  const mealWord = meals === 1 ? 'meal' : 'meals';
  return `${Math.round(live.kcalConsumed)}/${Math.round(live.kcalTarget)} kcal, ${meals} ${mealWord}, ${Math.round(live.waterMl)} ml water`;
}

function nutritionIsBehind(summary: string, live: CoachLiveSnapshot): boolean {
  const meals = /,\s*(\d+) meals\b/.exec(summary);
  const kcal = /^(\d+)\//.exec(summary);
  if (!meals && !kcal) return false;
  const shownMeals = meals ? Number(meals[1]) : 0;
  const shownKcal = kcal ? Number(kcal[1]) : 0;
  return live.meals > shownMeals || live.kcalConsumed > shownKcal;
}

export function reconcileToolSummaries(
  toolCalls: ChatToolCall[] | undefined,
  live: CoachLiveSnapshot | null,
): ChatToolCall[] | undefined {
  if (!toolCalls || !live || snapshotSuppressed(toolCalls)) return toolCalls;
  return toolCalls.map((call) => {
    if (call.tool === 'getTodayNutrition' && nutritionIsBehind(call.resultSummary, live)) {
      return { ...call, resultSummary: nutritionSummary(live) };
    }
    if (call.tool === 'getCurrentPlan' && live.planName && /no active plan/i.test(call.resultSummary)) {
      return { ...call, resultSummary: `active plan "${live.planName}"` };
    }
    if (call.tool === 'getTodayWorkout' && live.planName && /no plan/i.test(call.resultSummary)) {
      return { ...call, resultSummary: `active plan "${live.planName}"` };
    }
    return call;
  });
}

/** Known empty-day sentences from the offline coach. Other prose is left as written. */
export function freshenCoachText(content: string, live: CoachLiveSnapshot | null): string {
  if (!live) return content;
  let text = content;
  if (live.meals > 0 || live.kcalConsumed > 0) {
    const logged = `You have logged ${Math.round(live.kcalConsumed)} kcal across ${live.meals} ${live.meals === 1 ? 'meal' : 'meals'} today.`;
    text = text.replace(
      new RegExp(
        `You haven${APOSTROPHE}t logged anything yet today\\. Once you do, I can track your budget in real time\\.`,
      ),
      logged,
    );
    text = text.replace(
      /Food: 0 \/ [\d,]+ kcal logged \([^)]*\)\./g,
      `Food: ${Math.round(live.kcalConsumed)} / ${Math.round(live.kcalTarget)} kcal logged (${live.meals} ${live.meals === 1 ? 'meal' : 'meals'}).`,
    );
  }
  if (live.planName) {
    const onPlan = `Your training plan is "${live.planName}".`;
    text = text.replace(
      new RegExp(
        `You don${APOSTROPHE}t have a training plan yet\\. Generate one from the Workouts tab and I can walk you through it\\.`,
      ),
      onPlan,
    );
    text = text.replace(
      new RegExp(
        `You don${APOSTROPHE}t have an active training plan yet\\. You can generate one from the Workouts tab\\.`,
      ),
      onPlan,
    );
  }
  return text;
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ChatMessage>;
  return (
    message.type === 'chatMessage' &&
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
    typeof message.content === 'string'
  );
}

export function upsertChatMessage(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const next = list.filter((item) => item.id !== message.id);
  next.push(message);
  next.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return next;
}
