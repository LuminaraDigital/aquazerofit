/**
 * Consented food-recognition training samples.
 *
 * A sample pairs a meal photograph with what the model guessed and what the user
 * confirmed. Nothing here runs without the foodPhotoTraining consent, the
 * consent never gates scanning itself, and the normal 24-hour photo lifecycle
 * (vision router) is untouched for everyone else.
 *
 * Samples stay user-scoped on purpose: withdrawal and account deletion have to
 * find them. They live in the `ai` container, so the data export and the purge
 * sweep cover the documents with no type list to maintain; the files need the
 * explicit erasure below. Samples are never served over HTTP.
 */
import { copyFileSync, mkdirSync, unlinkSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  FOOD_PHOTO_SAMPLE_RETENTION_DAYS,
  type MealLogItem,
  type VisionJob,
} from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { getStore } from '../../platform/store';

export interface FoodPhotoSample {
  id: string;
  userId: string;
  type: 'foodPhotoSample';
  imagePath: string;
  predictions: VisionJob['predictions'];
  confirmed: Pick<MealLogItem, 'foodId' | 'name' | 'grams'>[];
  ai: VisionJob['ai'];
  /** Offline fallback: `predictions` are not a model answer, so exclude it from accuracy. */
  aiDegraded: boolean;
  /** The consent document's updatedAt when this sample was kept: its provenance. */
  consentUpdatedAt: string;
  createdAt: string;
}

/**
 * Keep a confirmed job's JPEG and labels. Best-effort: the meal is already
 * logged when this runs, and a failed copy must not fail the user's confirmation.
 */
export function retainFoodPhotoSample(
  job: VisionJob & { aiDegraded?: boolean },
  confirmedItems: MealLogItem[],
  consentUpdatedAt: string,
): void {
  try {
    const dir = path.join(config.uploadsDir, 'food-photo-samples');
    mkdirSync(dir, { recursive: true });
    const id = `fps-${crypto.randomUUID()}`;
    const imagePath = path.join(dir, `${id}.jpg`);
    copyFileSync(job.imagePath, imagePath);
    const sample: FoodPhotoSample = {
      id,
      userId: job.userId,
      type: 'foodPhotoSample',
      imagePath,
      predictions: job.predictions,
      confirmed: confirmedItems.map(({ foodId, name, grams }) => ({ foodId, name, grams })),
      ai: job.ai,
      aiDegraded: job.aiDegraded === true,
      consentUpdatedAt,
      createdAt: new Date().toISOString(),
    };
    getStore().upsert('ai', sample);
  } catch (err) {
    console.warn('[vision] food photo sample not retained', job.id, err instanceof Error ? err.message : err);
  }
}

function eraseSamples(matches: (sample: FoodPhotoSample) => boolean): number {
  const store = getStore();
  const samples = store.where<FoodPhotoSample>('ai', (d) => d.type === 'foodPhotoSample' && matches(d));
  const ids = new Set(samples.map((s) => s.id));
  for (const sample of samples) {
    try {
      unlinkSync(sample.imagePath);
    } catch {
      /* already gone */
    }
  }
  if (ids.size > 0) store.deleteWhere('ai', (d) => ids.has(d.id));
  return ids.size;
}

export function eraseFoodPhotoSamples(userId: string): number {
  return eraseSamples((s) => s.userId === userId);
}

export function sweepExpiredFoodPhotoSamples(now = Date.now()): number {
  const cutoff = now - FOOD_PHOTO_SAMPLE_RETENTION_DAYS * 24 * 3600 * 1000;
  return eraseSamples((s) => new Date(s.createdAt).getTime() < cutoff);
}
