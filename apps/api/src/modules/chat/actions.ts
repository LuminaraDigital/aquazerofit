/**
 * Coach actions: a chat sentence becomes a proposal the user confirms.
 *
 * Reading is deterministic on purpose. No model is called, so a proposal costs
 * no credit, works on the offline engine, and sends nothing to a provider, which
 * is why it does not depend on aiPersonalisation. Whatever a confirmed action
 * costs is charged by the service that does the work. A missed report only leaves
 * the sentence as ordinary chat, while a wrong one puts a false number in front
 * of the user, so anything short of a plain report of today returns null.
 */
import { RANGES, type CoachAction, type MealType } from '@aquazerofit/shared';

export const CHAT_ACTION_DRAFT_TYPE = 'chatActionDraft';

export type PlanFocus = Extract<CoachAction, { kind: 'rebuildPlan' }>['focus'];

/** What the sentence alone can say, before anything is resolved against the user's data. */
export type CoachIntent =
  | Extract<CoachAction, { kind: 'logWater' | 'logWeight' }>
  | { kind: 'swapExercise'; exerciseName: string }
  | { kind: 'rebuildPlan'; focus: PlanFocus }
  | { kind: 'logMeal' };

const NOT_A_REPORT =
  /\?\s*$|\b(?:how|if|should|could|would|wish|want|wanna|hope|hoping|goal|target|need to|trying to|used to|to weigh|don'?t|not|yesterday|last|ago|on (?:mon|tues|wednes|thurs|fri|satur|sun)days?|before|after|when|since|says?|said|told)\b/i;

// The input guardrail catches the clear cases before this runs. This keeps a
// bright logging card away from a message about how the user feels.
const DISTRESS =
  /\b(?:feel(?:ing|s)?|felt|guilt(?:y)?|asham\w*|shame\w*|disgust\w*|hate|ugly|gross|awful|horrible|terrible|worthless|binge\w*|starv\w*|purg\w*|too much|sick|pain)\b/i;

// Water and weight overwrite or add to today's figures, so the sentence must be
// nothing but the report: "my weight is 70 kg, is that ok" stays chat.
const REPORT_LEAD = /^(?:\s|[,.!]|\b(?:hey|hi|hello|ok|okay|so|well|today|also|and)\b)*$/i;
const REPORT_TAIL = /^(?:\s|[.!]|\b(?:today|now|just now|this morning|tonight|please|thanks)\b)*$/i;

function isWholeReport(text: string, match: RegExpExecArray): boolean {
  const end = match.index + match[0].length;
  return REPORT_LEAD.test(text.slice(0, match.index)) && REPORT_TAIL.test(text.slice(end));
}

const WATER =
  /\b(?:(?:(?:i|i've|ive|i have)\s+(?:just\s+|already\s+)?|just\s+)(?:drank|drunk|had)|log|add|track|record)\s+(?:about\s+|around\s+|another\s+)?(\d+(?:\.\d+)?|an?|one)\s*(ml|millilitres?|milliliters?|l|litres?|liters?|glass(?:es)?)\s*(?:of\s+)?water\b/i;

const WEIGHT =
  /\b(?:(?:i\s+)?weigh(?:ed)?(?:\s+in)?(?:\s+at)?|my weight is|log(?:\s+my)?\s+weight(?:\s+(?:of|as|at))?)\s+(?:about\s+)?(\d+(?:\.\d+)?)\s*(kgs?|kilos?|lbs?|pounds?)\b/i;

const ML_PER_GLASS = 250;
const KG_PER_LB = 0.45359237;
const MAX_WATER_ML = 3000;

function waterMl(quantity: string, unit: string): number {
  const amount = Number(quantity) || 1;
  const lower = unit.toLowerCase();
  if (lower.startsWith('glass')) return amount * ML_PER_GLASS;
  return lower.startsWith('m') ? amount : amount * 1000;
}

// Requests may be phrased as questions ("can you swap the squats?"), so these
// run ahead of NOT_A_REPORT with only a negation guard of their own.
const NEGATED = /\b(?:don'?t|do not|never|not|no need|didn'?t|should|myself)\b/i;

const PLAN_KIND = String.raw`(?:(?:training|workout|strength|weight\s*loss)\s+)?`;
const REBUILD_PLAN = new RegExp(
  String.raw`\b(?:rebuild|regenerate|redo|remake|replace)\s+(?:my\s+|the\s+)?${PLAN_KIND}plan\b` +
    String.raw`|\b(?:make|give|build|create|generate|write)\s+me\s+(?:a\s+)?(?:new|fresh|different)\s+${PLAN_KIND}plan\b`,
  'i',
);

const SWAP_EXERCISE =
  /\b(?:swap|replace|switch)\s+(?:out\s+)?(?:(?:my|the|today'?s)\s+)*(.+?)(?:\s+(?:for|with|in|from|on|today|because|please)\b.*|[.!?]*)$/i;

const MEAL_REPORT =
  /\b(?:(?:i|i've|ive|i have)\s+(?:just\s+|already\s+)?(?:ate|eaten|had)|just\s+(?:ate|had))\b/i;

function focusIn(text: string): PlanFocus {
  if (/\bstrength\b/i.test(text)) return 'strength';
  if (/\bweight\s*loss\b/i.test(text)) return 'weightLoss';
  return 'general';
}

export function parseCoachIntent(text: string): CoachIntent | null {
  if (!NEGATED.test(text)) {
    if (REBUILD_PLAN.test(text)) return { kind: 'rebuildPlan', focus: focusIn(text) };
    const swap = SWAP_EXERCISE.exec(text);
    if (swap && !/\bplan\b/i.test(swap[1]!)) return { kind: 'swapExercise', exerciseName: swap[1]! };
  }

  if (NOT_A_REPORT.test(text) || DISTRESS.test(text)) return null;

  const water = WATER.exec(text);
  if (water) {
    if (!isWholeReport(text, water)) return null;
    const amountMl = Math.round(waterMl(water[1]!, water[2]!));
    return amountMl >= 1 && amountMl <= MAX_WATER_ML ? { kind: 'logWater', amountMl } : null;
  }

  const weight = WEIGHT.exec(text);
  if (weight) {
    if (!isWholeReport(text, weight)) return null;
    const amount = Number(weight[1]);
    const inKg = /^(?:lb|pound)/i.test(weight[2]!) ? amount * KG_PER_LB : amount;
    const weightKg = Math.round(inKg * 10) / 10;
    return weightKg >= RANGES.weightKg.min && weightKg <= RANGES.weightKg.max
      ? { kind: 'logWeight', weightKg }
      : null;
  }

  return MEAL_REPORT.test(text) ? { kind: 'logMeal' } : null;
}

/** Strips what the segmenter would otherwise read as part of a food name. */
export function mealTextOf(text: string): string {
  return text.replace(
    /\b(?:for|at)\s+(?:my\s+)?(?:breakfast|lunch|dinner|tea|a\s+snack|snack)\b|\b(?:this\s+)?(?:morning|afternoon|evening|tonight)\b/gi,
    ' ',
  );
}

export function mealTypeIn(text: string): MealType | null {
  const hit = /\b(breakfast|lunch|dinner|snack)\b/i.exec(text);
  return hit ? (hit[1]!.toLowerCase() as MealType) : null;
}

function askOf(action: CoachAction | { kind: 'logMeal' }): string {
  switch (action.kind) {
    case 'logWater':
      return `log ${action.amountMl} ml of water`;
    case 'logWeight':
      return `log a weight of ${action.weightKg} kg`;
    case 'logMeal':
      return 'log this meal';
    case 'swapExercise':
      return `swap ${action.exerciseName} in today's workout for a replacement the app chooses`;
    case 'rebuildPlan':
      return 'rebuild their training plan';
  }
}

/** Lets the reply agree with the card instead of claiming it cannot act. */
export function actionNoteFor(action: CoachAction | { kind: 'logMeal' }): string {
  return `The app is showing the user a confirmation card to ${askOf(action)}. Nothing happens until they confirm it. Do not say it is done, and do not say you cannot do it.`;
}
