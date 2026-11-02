/**
 * Coach grounding for today's nutrition.
 *
 * Two failures showed up on the same thread. With AI personalisation off, the
 * context was a set of nulls, so the model (and the offline engine) described
 * an empty log instead of saying the logs were not fetched. With it on, the
 * tool summary already had the day's totals, but older assistant turns that
 * said the log was empty are replayed after that block, which is the position
 * models copy from. Food names were also missing, so "no meal data" was an
 * easy wrong answer to "what did I eat".
 *
 * Numbers in the correction come from the tool result. Food names stay in the
 * untrusted USER CONTEXT block: they are user-authored and must not be copied
 * into a trusted system instruction.
 */
export interface NutritionFoodGrounding {
  name: string;
  mealType?: string;
}

export interface NutritionGrounding {
  kcalTarget: number;
  kcalConsumed: number;
  mealsLogged: number;
  waterMl?: { consumed: number; target: number };
  foods?: NutritionFoodGrounding[];
}

export interface CoachGrounding {
  personalisation?: 'on' | 'off';
  nutrition?: NutritionGrounding | null;
}

export const PERSONALISATION_OFF_REPLY =
  'AI personalisation is off, so I cannot see today\'s nutrition log. Enable it in Privacy if you want answers based on what you have logged.';

const STALE_TURN_PLACEHOLDER = 'Continuing from the earlier turn.';

/**
 * Claims that the day has no nutrition data. A missing meal slot ("haven't
 * logged dinner") is not a claim that the whole log is empty.
 */
const EMPTY_LOG_CLAIM =
  /\b(?:(?:nutrition|food|meal)\s+)?logs?\s+(?:is|are|looks|appears|seems)\s+empty\b|\blog(?:'s| is| looks) empty\b|\bno meal data\b|\bno meals? (?:logged|recorded|data|yet)\b|\bno logged meals\b|\bno food logged\b|\bnothing (?:has been |was |is )?logged\b|\b(?:have not|has not|haven['’]t|hasn['’]t) logged (?:anything|any meals|a meal|meals|food|nutrition)\b|\b(?:do not|don['’]t) (?:see|have) (?:any )?(?:meals|meal data|food|foods|nutrition data|a nutrition log)\b|\b(?:cannot|can['’]t) see (?:any )?(?:meals|food|your (?:meals|log|nutrition))\b/i;

export function claimsLogEmpty(text: string): boolean {
  return EMPTY_LOG_CLAIM.test(text);
}

export function hasNutritionIntake(nutrition: NutritionGrounding): boolean {
  if (nutrition.mealsLogged > 0 || nutrition.kcalConsumed > 0) return true;
  if ((nutrition.foods?.length ?? 0) > 0) return true;
  if ((nutrition.waterMl?.consumed ?? 0) > 0) return true;
  return false;
}

/** Skip names that could read as a calorie instruction in the corrected reply. */
function usableFoodName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return null;
  if (/\d|kcal|calor|ignore|instruction|system prompt/i.test(trimmed)) return null;
  return trimmed;
}

export function foodNameSentence(nutrition: NutritionGrounding): string | null {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const food of nutrition.foods ?? []) {
    const name = usableFoodName(food.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= 8) break;
  }
  if (names.length === 0) return null;
  return `Food logged: ${names.join(', ')}.`;
}

/** User-visible correction. Food names are allowed here: this is the reply. */
export function groundedIntakeSentence(nutrition: NutritionGrounding): string {
  const kcal = Math.round(nutrition.kcalConsumed);
  const target = Math.round(nutrition.kcalTarget);
  const meals = Math.max(0, Math.round(nutrition.mealsLogged));
  const mealWord = meals === 1 ? 'meal' : 'meals';
  const foods = foodNameSentence(nutrition);
  const water =
    nutrition.waterMl != null ? ` Water is ${Math.round(nutrition.waterMl.consumed)} ml.` : '';
  const foodBit = foods ? ` ${foods}` : '';
  return `You have logged ${kcal} of ${target} kcal across ${meals} ${mealWord} today.${foodBit}${water}`;
}

function intakeFigures(nutrition: NutritionGrounding): string {
  const kcal = Math.round(nutrition.kcalConsumed);
  const target = Math.round(nutrition.kcalTarget);
  const meals = Math.max(0, Math.round(nutrition.mealsLogged));
  const mealWord = meals === 1 ? 'meal' : 'meals';
  const water =
    nutrition.waterMl != null ? ` and ${Math.round(nutrition.waterMl.consumed)} ml of water` : '';
  return `${kcal} of ${target} kcal across ${meals} ${mealWord}${water}`;
}

function correctionFor(ctx: CoachGrounding): string | null {
  if (ctx.personalisation === 'off') return PERSONALISATION_OFF_REPLY;
  if (ctx.nutrition && hasNutritionIntake(ctx.nutrition)) return groundedIntakeSentence(ctx.nutrition);
  return null;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Drop empty-log sentences from replayed assistant turns when today's context
 * contradicts them. The user questions stay, so the thread still reads as a
 * conversation. A turn that was only the false claim becomes a placeholder
 * that does not repeat it.
 */
export function redactStaleEmptyLogClaims<T extends { role: string; content: string }>(
  history: T[],
  ctx: CoachGrounding,
): T[] {
  if (!correctionFor(ctx)) return history;
  return history.map((message) => {
    if (message.role !== 'assistant' || !claimsLogEmpty(message.content)) return message;
    const kept = sentences(message.content).filter((sentence) => !claimsLogEmpty(sentence));
    return { ...message, content: kept.length > 0 ? kept.join(' ') : STALE_TURN_PLACEHOLDER };
  });
}

/**
 * Sits after history and immediately before the current user message, which is
 * the position that beats a stale "log is empty" reply. Food names are not
 * copied in: they remain in the untrusted context block.
 */
export function groundingOverrideMessage(ctx: CoachGrounding): { role: 'system'; content: string } | null {
  if (ctx.personalisation === 'off') {
    return {
      role: 'system',
      content:
        "TODAY'S GROUNDING OVERRIDES earlier turns in this chat. AI personalisation is off, so today's logs were not fetched. Tell the user personalisation is off and that they can enable it in Privacy. Do not say the nutrition log is empty.",
    };
  }
  if (ctx.nutrition && hasNutritionIntake(ctx.nutrition)) {
    return {
      role: 'system',
      content:
        `TODAY'S GROUNDING OVERRIDES earlier turns in this chat. The nutrition log is not empty: ${intakeFigures(ctx.nutrition)}. ` +
        'Use the food names in the USER CONTEXT block when they are present. Do not claim the log is empty or that there is no meal data. Earlier replies that said so are stale.',
    };
  }
  return null;
}

/**
 * Last line of defence for a model that still copies a stale empty-log claim.
 * Runs on the finished reply, before it is stored, so the next turn cannot
 * replay the false sentence.
 */
export function enforceCoachGrounding(text: string, ctx: CoachGrounding): string {
  const replacement = correctionFor(ctx);
  if (!replacement || !claimsLogEmpty(text)) return text;
  const next: string[] = [];
  for (const sentence of sentences(text)) {
    const piece: string = claimsLogEmpty(sentence) ? replacement : sentence;
    if (piece === replacement && next[next.length - 1] === replacement) continue;
    next.push(piece);
  }
  return next.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
}
