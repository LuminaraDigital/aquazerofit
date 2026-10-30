/**
 * Coach actions: a chat sentence becomes a proposal the user confirms.
 *
 * Reading is deterministic on purpose. No model is called, so a proposal costs
 * no credit, works on the offline engine, and sends nothing to a provider, which
 * is why it does not depend on aiPersonalisation. A missed report only leaves
 * the sentence as ordinary chat, while a wrong one puts a false number in front
 * of the user, so anything short of a plain report of today returns null.
 */
import { RANGES } from '@aquazerofit/shared';

export const CHAT_ACTION_DRAFT_TYPE = 'chatActionDraft';

export type CoachAction =
  | { kind: 'logWater'; amountMl: number }
  | { kind: 'logWeight'; weightKg: number };

export type ChatActionDraftStatus = 'proposed' | 'confirmed' | 'dismissed';

export interface ChatActionDraft {
  id: string;
  userId: string;
  type: typeof CHAT_ACTION_DRAFT_TYPE;
  sessionId: string;
  action: CoachAction;
  sourceText: string;
  localDate: string;
  status: ChatActionDraftStatus;
  loggedId: string | null;
  createdAt: string;
  updatedAt: string;
}

const NOT_A_REPORT =
  /\?\s*$|\b(?:how|if|should|could|would|wish|want|wanna|hope|hoping|goal|target|need to|trying to|used to|to weigh|don'?t|not|yesterday|last night|last week|ago)\b/i;

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

export function parseCoachAction(text: string): CoachAction | null {
  if (NOT_A_REPORT.test(text)) return null;

  const water = WATER.exec(text);
  if (water) {
    const amountMl = Math.round(waterMl(water[1]!, water[2]!));
    return amountMl >= 1 && amountMl <= MAX_WATER_ML ? { kind: 'logWater', amountMl } : null;
  }

  const weight = WEIGHT.exec(text);
  if (weight) {
    const amount = Number(weight[1]);
    const inKg = /^(?:lb|pound)/i.test(weight[2]!) ? amount * KG_PER_LB : amount;
    const weightKg = Math.round(inKg * 10) / 10;
    return weightKg >= RANGES.weightKg.min && weightKg <= RANGES.weightKg.max
      ? { kind: 'logWeight', weightKg }
      : null;
  }

  return null;
}

/** Lets the reply agree with the card instead of claiming it cannot log. */
export function actionNoteFor(action: CoachAction): string {
  const what = action.kind === 'logWater' ? `${action.amountMl} ml of water` : `a weight of ${action.weightKg} kg`;
  return `The app is showing the user a confirmation card to log ${what}. Nothing is logged until they confirm it. Do not say it has been logged, and do not say you cannot log it.`;
}
