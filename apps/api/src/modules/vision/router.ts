/**
 * Meal photo pipeline (AQF-07 §3.2, AQF-09 §3).
 *
 * POST /            multipart upload → 202 { jobId } (credits reserved)
 * GET  /:jobId      job status + predictions with confidence
 * POST /:jobId/confirm  user-confirmed items → MealLog (source 'photo')
 *
 * The model only IDENTIFIES foods; calories and macros are a deterministic
 * per-100g lookup × grams in code (brief rule 1). Nothing is ever committed
 * to the log without the explicit confirm call (AQF-11 §6 human in the loop).
 */
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../../platform/config';
import { requireAuth } from '../../platform/auth';
import { AppError } from '../../platform/errors';
import {
  confirmVisionSchema,
  MEAL_PHOTO_MAX_BYTES,
  MEAL_PHOTO_MIME,
} from '@aquazerofit/shared';
import type { Food, MealLog, MealType, VisionJob, VisionPrediction } from '@aquazerofit/shared';
import { complete } from '../ai/gateway';
import { creditLedger } from '../ai/creditLedger';
import { post as postGuardrail } from '../ai/guardrails';
import { assertLaneAllowed } from '../ai/tierPolicy';
import { asyncHandler, byIdDoc, deleteDoc, getUser, localToday, newId, nowIso, round1, upsertDoc, whereDocs } from '../ai/util';

export const visionRouter = Router();
visionRouter.use(requireAuth);

// Jobs carry a private reservation reference that is never returned to clients.
// `aiDegraded` is recorded when the job is processed but consumed later, at
// confirm time, because that is where this lane settles its reservation.
type StoredVisionJob = VisionJob & { reservationId?: string; aiDegraded?: boolean };

// Uploads are re-encoded before they are persisted (see toStorableJpeg), so
// the bytes on disk are always baseline JPEG whatever the client sent. Storage
// extension and served Content-Type follow from that fact, never from the
// client's multipart headers.
const STORED_IMAGE_EXT = '.jpg';
const STORED_IMAGE_MIME = 'image/jpeg';

/**
 * Decode the upload and write a fresh JPEG from the pixels.
 *
 * Privacy: a phone photo carries EXIF GPS at home-address precision, the
 * capture timestamp and the camera serial number. Persisting that verbatim
 * would bolt a location trail onto health-adjacent records that only need the
 * picture of the food. Re-encoding rebuilds the file from decoded pixels, so
 * every metadata block (EXIF, XMP, IPTC, ICC) is discarded — sharp only copies
 * metadata forward when explicitly asked with .withMetadata().
 *
 * .rotate() with no argument applies the EXIF orientation to the pixels first;
 * without it, dropping the orientation tag would leave portrait photos sideways.
 *
 * Security: this is also the real upload type check. `file.mimetype` is an
 * attacker-controlled multipart header, so it proves nothing — only bytes
 * libvips can actually decode as an image get past this call.
 */
async function toStorableJpeg(buffer: Buffer, declaredMime?: string): Promise<Buffer> {
  try {
    return await sharp(buffer).rotate().jpeg({ quality: 82 }).toBuffer();
  } catch (err) {
    // HEIC is called out separately because it is the one format whose support
    // depends on the codecs compiled into the deployed libvips rather than on
    // the upload being valid. sharp advertises a heif loader, but a build
    // without an HEVC decoder rejects a perfectly good iPhone photo — and
    // "that file could not be read" would send the user off to fix a file that
    // is fine. Log it distinctly so this is diagnosable from production logs,
    // and tell them the one thing that actually works.
    const looksHeic = declaredMime === 'image/heic' || declaredMime === 'image/heif';
    if (looksHeic) {
      // eslint-disable-next-line no-console
      console.warn('[vision] HEIC decode failed — libvips build may lack an HEVC decoder', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
      throw new AppError(
        'VALIDATION_FAILED',
        'HEIC photos are not supported yet. Please choose “Most Compatible” in iOS camera settings, or use a JPEG or PNG.',
        { allowed: MEAL_PHOTO_MIME },
      );
    }
    // A payload we cannot decode is a bad request, not a server fault.
    throw new AppError('VALIDATION_FAILED', 'That file could not be read as an image. Use a jpeg or png photo.', {
      allowed: MEAL_PHOTO_MIME,
    });
  }
}

function uploadsDir(): string {
  const dir = config.uploadsDir;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Best-effort removal of a job's photo file; missing files are fine. */
function deleteJobImage(job: { imagePath?: string }): void {
  if (!job.imagePath) return;
  try {
    unlinkSync(job.imagePath);
  } catch {
    /* already gone */
  }
}

/**
 * TTL sweep: photo files (and their job docs) for jobs that reached a terminal
 * state more than 24 hours ago are deleted. Runs on boot and hourly
 * (scheduled from index.ts); exported for tests.
 */
export async function sweepVisionArtifacts(now = Date.now()): Promise<number> {
  const terminalCutoff = now - 24 * 3600 * 1000;
  /** Orphaned in-flight jobs (crash/restart before processJob finishes) must not hold credits for a full day. */
  const inFlightCutoff = now - 2 * 3600 * 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stale = await whereDocs<StoredVisionJob>('ai', (d: any) => {
    if (d?.type !== 'cvJob') return false;
    if (d?.status === 'queued' || d?.status === 'processing') {
      return typeof d?.createdAt === 'string' && new Date(d.createdAt).getTime() < inFlightCutoff;
    }
    return (
      (d?.status === 'succeeded' || d?.status === 'failed' || d?.status === 'confirmed') &&
      typeof d?.completedAt === 'string' &&
      new Date(d.completedAt).getTime() < terminalCutoff
    );
  });
  for (const job of stale) {
    // Confirmed jobs already committed credits; every other terminal state may
    // still hold an unreleased reservation (failed path releases inline, but
    // succeeded-without-confirm and sweep races must not leak holds).
    if (job.reservationId && job.status !== 'confirmed') {
      await creditLedger.release(job.reservationId);
    }
    deleteJobImage(job);
    await deleteDoc('ai', job.id);
  }
  return stale.length;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEAL_PHOTO_MAX_BYTES, files: 1 },
});

function isMealType(value: unknown): value is MealType {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack';
}

/** Deterministic per-100g lookup x grams — same rule as processJob (brief rule 1). */
function nutritionFromFood(food: Food, grams: number, nameOverride?: string) {
  const factor = grams / 100;
  return {
    foodId: food.id,
    name: nameOverride ?? food.name,
    grams,
    kcal: round1(food.per100g.kcal * factor),
    proteinG: round1(food.per100g.proteinG * factor),
    carbsG: round1(food.per100g.carbsG * factor),
    fatG: round1(food.per100g.fatG * factor),
  };
}

/** Cap catalog size sent to the vision model; full list blows prompt budgets. */
const MAX_VISION_CANDIDATES = 150;

function visionCandidates(foods: Food[]): { id: string; name: string; commonServings?: Food['commonServings'] }[] {
  return foods
    .slice()
    .sort((a, b) => {
      const aHas = a.commonServings?.length ? 1 : 0;
      const bHas = b.commonServings?.length ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
      return a.id.localeCompare(b.id);
    })
    .slice(0, MAX_VISION_CANDIDATES)
    .map((f) => ({ id: f.id, name: f.name, commonServings: f.commonServings }));
}

function publicJob(job: StoredVisionJob): Omit<VisionJob, 'imagePath'> {
  // reservationId and aiDegraded are internal metering state; imagePath is a
  // server filesystem location and must never reach the client.
  const { reservationId: _hidden, imagePath: _path, aiDegraded: _degraded, ...rest } = job;
  return rest;
}

// ---------------------------------------------------------------------------
// Background processing (~1.2 s simulated queue latency)
// ---------------------------------------------------------------------------

async function processJob(jobId: string): Promise<void> {
  const job = await byIdDoc<StoredVisionJob>('ai', jobId);
  if (!job || job.type !== 'cvJob' || job.status !== 'queued') return;

  job.status = 'processing';
  await upsertDoc('ai', job);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const foods = await whereDocs<Food>('content', (d: any) => d?.type === 'food');
    const seedKey = path.basename(job.imagePath);
    const result = await complete('visionPrimary', [{ role: 'user', content: `Identify foods in photo ${seedKey}` }], {
      json: true,
      promptId: 'P-01',
      context: {
        seedKey,
        candidates: visionCandidates(foods),
      },
    });

    if (result.text) {
      const outCheck = postGuardrail(result.text, { userId: job.userId });
      if (outCheck.blocked) {
        throw new Error(`vision output blocked: ${outCheck.category ?? 'unknown'}`);
      }
    }

    const raw = (result.json ?? {}) as { predictions?: { foodId?: string; name?: string; estimatedGrams?: number; confidence?: number }[] };
    const predictions: VisionPrediction[] = [];
    for (const p of raw.predictions ?? []) {
      // Deterministic nutrition: the model identifies, CODE calculates.
      const food = p.foodId ? foods.find((f) => f.id === p.foodId) : undefined;
      if (!food) continue; // never trust free-text identifications we cannot ground
      const grams = Math.min(2000, Math.max(10, Math.round(p.estimatedGrams ?? 100)));
      const grounded = nutritionFromFood(food, grams);
      predictions.push({
        name: grounded.name,
        foodId: grounded.foodId,
        estimatedGrams: grams,
        confidence: Math.min(0.99, Math.max(0.05, p.confidence ?? 0.5)),
        kcal: grounded.kcal,
        proteinG: grounded.proteinG,
        carbsG: grounded.carbsG,
        fatG: grounded.fatG,
      });
    }

    if (predictions.length === 0) {
      throw new Error('no groundable predictions');
    }

    job.status = 'succeeded';
    job.predictions = predictions;
    job.ai = result.meta;
    // Carried to the confirm handler, which is where this lane settles credits.
    job.aiDegraded = result.meta.degraded === true;
    job.completedAt = nowIso();
    await upsertDoc('ai', job);
  } catch (err) {
    job.status = 'failed';
    job.error = 'We could not analyse this photo. You can still log the meal manually.';
    job.completedAt = nowIso();
    await upsertDoc('ai', job);
    if (job.reservationId) await creditLedger.release(job.reservationId);
    // A failed job's photo has no further use — delete it immediately.
    deleteJobImage(job);
    console.error('[vision] job failed', jobId, err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

visionRouter.post(
  '/',
  (req, res, next) => {
    upload.any()(req, res, (err: unknown) => {
      if (err && typeof err === 'object' && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
        next(
          new AppError('VALIDATION_FAILED', 'Photo is too large (maximum 10 MB).', {
            maxBytes: MEAL_PHOTO_MAX_BYTES,
          }),
        );
        return;
      }
      next(err as Error | undefined);
    });
  },
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const file = files[0];
    if (!file) {
      throw new AppError('VALIDATION_FAILED', 'Attach a meal photo (jpeg, png or heic).');
    }
    if (!(MEAL_PHOTO_MIME as readonly string[]).includes(file.mimetype)) {
      throw new AppError('VALIDATION_FAILED', `Unsupported image type ${file.mimetype}. Use jpeg, png or heic.`, {
        allowed: MEAL_PHOTO_MIME,
      });
    }
    if (file.size > MEAL_PHOTO_MAX_BYTES) {
      throw new AppError('VALIDATION_FAILED', 'Photo is too large (maximum 10 MB).');
    }

    const mealType: MealType = isMealType(req.body?.mealType) ? req.body.mealType : 'lunch';

    // Admission: lane before any work is done.
    assertLaneAllowed(user.tier, 'visionPrimary');

    // Strip metadata and prove the payload really is an image *before*
    // reserving credits — a reservation made here would have no release path
    // if the decode then threw.
    const imageBytes = await toStorableJpeg(file.buffer, file.mimetype);

    const reservationId = await creditLedger.reserve(user.id, 'mealPhoto');

    // Unguessable id: doubles as the on-disk filename, so it must never be
    // enumerable (crypto.randomUUID, not a timestamp counter).
    const jobId = `vj-${crypto.randomUUID()}`;
    const imagePath = path.join(uploadsDir(), `${jobId}${STORED_IMAGE_EXT}`);
    writeFileSync(imagePath, imageBytes);

    const job: StoredVisionJob = {
      id: jobId,
      userId: user.id,
      type: 'cvJob',
      status: 'queued',
      imagePath,
      mealType,
      predictions: [],
      ai: null,
      createdAt: nowIso(),
      reservationId,
    };
    await upsertDoc('ai', job);

    // Simulated queue: transition to processing → succeeded in the background.
    setTimeout(() => {
      void processJob(jobId);
    }, 1200);

    res.status(202).json({ jobId, status: 'queued' });
  }),
);

/**
 * Authenticated photo access (replaces the old public static /uploads mount):
 * only the owner of the job may stream its image.
 */
visionRouter.get(
  '/:jobId/image',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const job = await byIdDoc<StoredVisionJob>('ai', req.params.jobId as string);
    if (!job || job.type !== 'cvJob' || job.userId !== user.id) {
      throw new AppError('NOT_FOUND', 'Photo analysis job not found.');
    }
    if (!job.imagePath || !existsSync(job.imagePath)) {
      throw new AppError('NOT_FOUND', 'Photo is no longer available.');
    }
    // Every stored photo came out of sharp as JPEG, so the type is known from
    // what we wrote — it is never echoed back from the uploader's header.
    res.setHeader('Content-Type', STORED_IMAGE_MIME);
    res.setHeader('Cache-Control', 'private, no-store');
    createReadStream(job.imagePath)
      .on('error', () => {
        if (!res.headersSent) res.status(404);
        res.end();
      })
      .pipe(res);
  }),
);

visionRouter.get(
  '/:jobId',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const job = await byIdDoc<StoredVisionJob>('ai', req.params.jobId as string);
    if (!job || job.type !== 'cvJob' || job.userId !== user.id) {
      throw new AppError('NOT_FOUND', 'Photo analysis job not found.');
    }
    res.json({ job: publicJob(job) });
  }),
);

visionRouter.post(
  '/:jobId/confirm',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const job = await byIdDoc<StoredVisionJob>('ai', req.params.jobId as string);
    if (!job || job.type !== 'cvJob' || job.userId !== user.id) {
      throw new AppError('NOT_FOUND', 'Photo analysis job not found.');
    }
    if (job.status !== 'succeeded') {
      throw new AppError('CONFLICT', `This job cannot be confirmed (status: ${job.status}).`, {
        status: job.status,
      });
    }

    const parsed = confirmVisionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'Confirmation payload is invalid.', {
        issues: parsed.error.issues,
      });
    }
    const { mealType, localDate, items } = parsed.data;

    // Re-derive nutrition from the food catalog — never trust client macros.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const foods = await whereDocs<Food>('content', (d: any) => d?.type === 'food');
    const foodById = new Map(foods.map((f) => [f.id, f]));
    const confirmedItems = items.map((item) => {
      if (!item.foodId) {
        throw new AppError('VALIDATION_FAILED', 'Each confirmed item must include a known foodId.', {
          name: item.name,
        });
      }
      const food = foodById.get(item.foodId);
      if (!food) {
        throw new AppError('VALIDATION_FAILED', `Unknown foodId: ${item.foodId}.`, { foodId: item.foodId });
      }
      return nutritionFromFood(food, item.grams, item.name);
    });

    const totals = confirmedItems.reduce(
      (acc, item) => ({
        kcal: acc.kcal + item.kcal,
        proteinG: acc.proteinG + item.proteinG,
        carbsG: acc.carbsG + item.carbsG,
        fatG: acc.fatG + item.fatG,
      }),
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

    const mealLog: MealLog = {
      id: newId('ml'),
      userId: user.id,
      type: 'mealLog',
      mealType,
      items: confirmedItems,
      totalKcal: round1(totals.kcal),
      totalProteinG: round1(totals.proteinG),
      totalCarbsG: round1(totals.carbsG),
      totalFatG: round1(totals.fatG),
      source: 'photo',
      visionJobId: job.id,
      loggedAt: nowIso(),
      localDate: localDate || localToday(),
    };
    await upsertDoc('logs', mealLog);

    job.status = 'confirmed';
    job.mealType = mealType;
    await upsertDoc('ai', job);

    // The confirmed items are persisted in the meal log; the raw photo is no
    // longer needed and is removed (data minimisation).
    deleteJobImage(job);

    // Predictions that came from the offline engine after real providers failed
    // are not a model answer the user should pay for, even though they confirmed
    // a meal log off the back of them. Mirrors the chat and recommendation lanes.
    if (job.reservationId) {
      if (job.aiDegraded) {
        await creditLedger.release(job.reservationId);
      } else {
        await creditLedger.commit(job.reservationId);
      }
    }

    res.status(201).json({ mealLog, job: publicJob(job) });
  }),
);
