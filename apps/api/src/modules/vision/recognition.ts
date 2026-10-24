/**
 * Step one of meal-photo recognition: validate the model's JSON.
 * The catalog is not an input. Names are matched afterwards.
 */
import { z } from 'zod';
import type { Food, VisionPrediction } from '@aquazerofit/shared';
import { groundRecognisedFoods, type RecognisedFood } from './foodMatch';

export type { RecognisedFood };

const visionRecognitionItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  portion: z.string().trim().max(160).optional(),
  portionDescription: z.string().trim().max(160).optional(),
  estimatedGrams: z.coerce.number().finite(),
  confidence: z.coerce.number().finite(),
});

export interface RecognitionParse {
  /** False when the payload is not a recognition object, or every row was unusable. */
  ok: boolean;
  items: RecognisedFood[];
}

function clampGrams(value: number): number {
  return Math.min(2000, Math.max(1, Math.round(value)));
}

function clampConfidence(value: number): number {
  return Math.min(0.99, Math.max(0.05, value));
}

/**
 * Accept `{ items: [...] }` and the older `{ predictions: [...] }` key.
 * A row that fails the schema is dropped. If the model sent rows and none
 * of them parse, the payload is rejected so an empty plate is not invented.
 */
export function parseVisionRecognition(json: unknown): RecognitionParse {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, items: [] };
  const record = json as Record<string, unknown>;
  const raw = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.predictions)
      ? record.predictions
      : null;
  if (!raw) return { ok: false, items: [] };

  const items: RecognisedFood[] = [];
  for (const entry of raw) {
    const parsed = visionRecognitionItemSchema.safeParse(entry);
    if (!parsed.success) continue;
    if (!Number.isFinite(parsed.data.estimatedGrams) || parsed.data.estimatedGrams <= 0) continue;
    if (!Number.isFinite(parsed.data.confidence)) continue;
    const portion = (parsed.data.portion ?? parsed.data.portionDescription ?? '').trim();
    items.push({
      name: parsed.data.name,
      portion: portion || 'estimated portion',
      estimatedGrams: clampGrams(parsed.data.estimatedGrams),
      confidence: clampConfidence(parsed.data.confidence),
    });
    if (items.length >= 8) break;
  }

  if (raw.length > 0 && items.length === 0) return { ok: false, items: [] };
  return { ok: true, items };
}

/**
 * Turn a gateway result into review rows.
 * A degraded (mock fallback) result is an empty list: those foods were not
 * recognised, and their macros must not be shown as if they were.
 */
export function predictionsForVisionResult(
  degraded: boolean,
  json: unknown,
  foods: readonly Food[],
): VisionPrediction[] {
  if (degraded) return [];
  const parsed = parseVisionRecognition(json);
  if (!parsed.ok) {
    throw new Error('vision output failed schema validation');
  }
  return groundRecognisedFoods(parsed.items, foods);
}
