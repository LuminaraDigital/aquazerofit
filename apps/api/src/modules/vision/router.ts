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
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs';
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

/**
 * One encoding of a stored photo, and the Content-Type it must be served with.
 *
 * The mime travels WITH the file rather than being inferred at read time. Until
 * WebP existed here, "everything came out of sharp as JPEG" was a true global
 * invariant and the served type could be a module constant; the moment a second
 * encoding is written that constant becomes a lie that no longer type-errors.
 */
type StoredImageVariant = { path: string; mime: string };

// Jobs carry a private reservation reference that is never returned to clients.
// `aiDegraded` is recorded when the job is processed but consumed later, at
// confirm time, because that is where this lane settles its reservation.
// `imageVariants` is the record of what was actually written to disk.
type StoredVisionJob = VisionJob & {
  reservationId?: string;
  aiDegraded?: boolean;
  imageVariants?: StoredImageVariant[];
};

// Uploads are re-encoded before they are persisted (see toStorableImages), so
// the bytes on disk are always something this process produced, whatever the
// client sent. Storage extension and served Content-Type follow from that fact,
// never from the client's multipart headers.
const STORED_JPEG_EXT = '.jpg';
const STORED_JPEG_MIME = 'image/jpeg';
const STORED_WEBP_EXT = '.webp';
const STORED_WEBP_MIME = 'image/webp';

/**
 * Longest edge kept on a stored meal photo.
 *
 * A modern phone hands us a 12 MP capture — 4000x3000 and several megabytes —
 * and every consumer of it is either a thumbnail in the confirm sheet or a
 * model that downsamples aggressively before it looks at anything. Storing the
 * full capture buys nothing and costs disk, backup volume and egress on a
 * route that streams the file back on every view. 1600px on the long edge is
 * comfortably above what any current screen shows this image at.
 *
 * `fit: 'inside'` preserves aspect ratio and `withoutEnlargement` means a small
 * photo is passed through at its own size rather than upscaled into a blurry
 * 1600px one.
 */
const STORED_IMAGE_MAX_EDGE = 1600;

/**
 * Decode the upload and write fresh images from the pixels.
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
 * It must stay ahead of .resize(), or the fit box is applied to the unrotated
 * dimensions and a portrait photo comes out the wrong shape.
 *
 * Security: the JPEG encode is also the real upload type check. `file.mimetype`
 * is an attacker-controlled multipart header, so it proves nothing — only bytes
 * libvips can actually decode as an image get past this call.
 *
 * The WebP variant is deliberately best-effort and encoded second: it is a
 * bandwidth optimisation, and a libvips build without a WebP encoder must
 * degrade to JPEG-only rather than reject a photo the user can see is fine.
 * The JPEG stays the canonical fallback for exactly that reason.
 */
/**
 * Decode ceiling for anything a caller uploads.
 *
 * The multipart limit caps the bytes on the wire, not the pixels they expand
 * to, and those are the ones that cost memory. A ~1 MB PNG at 16000x16000 is
 * comfortably under sharp's own 268 Mpx default — so it is NOT rejected — and
 * decodes to roughly 1 GB of RGBA. Two pipelines run below, both inline in the
 * request, and the rate limiter permits 20 uploads per minute per user. That
 * is a remotely triggerable OOM, and because `assertSingleInstance` makes this
 * process the whole API, it takes the service down for everybody.
 *
 * 40 Mpx is far above any real phone camera (a 48 MP sensor outputs ~12 Mpx
 * by default, and even full-frame medium format lands under 100 MP) and far
 * below what hurts. sharp raises a normal error over the limit, which the
 * catch below already turns into a clean 400.
 */
const DECODE_LIMITS = { limitInputPixels: 40_000_000 } as const;

async function toStorableImages(
  buffer: Buffer,
  declaredMime?: string,
): Promise<{ jpeg: Buffer; webp?: Buffer }> {
  try {
    const jpeg = await sharp(buffer, DECODE_LIMITS)
      .rotate()
      .resize(STORED_IMAGE_MAX_EDGE, STORED_IMAGE_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    let webp: Buffer | undefined;
    try {
      webp = await sharp(buffer, DECODE_LIMITS)
        .rotate()
        .resize(STORED_IMAGE_MAX_EDGE, STORED_IMAGE_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (webpErr) {
      // The bytes already decoded once, so this is an encoder problem, not a
      // bad upload. Warn and carry on with JPEG only.
      // eslint-disable-next-line no-console
      console.warn('[vision] WebP encode failed — serving JPEG only', {
        reason: webpErr instanceof Error ? webpErr.message : 'unknown',
      });
    }

    return { jpeg, webp };
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

/**
 * Every encoding stored for a job, newest scheme first.
 *
 * Jobs written before the WebP variant existed have no `imageVariants` and only
 * a `.jpg` on disk. That single legacy shape is the ONLY place a hardcoded mime
 * is still correct, because it describes what this code provably wrote at the
 * time: a job with no variant list predates any encoder other than JPEG.
 */
function storedVariants(job: { imagePath?: string; imageVariants?: StoredImageVariant[] }): StoredImageVariant[] {
  if (job.imageVariants?.length) return job.imageVariants;
  return job.imagePath ? [{ path: job.imagePath, mime: STORED_JPEG_MIME }] : [];
}

/**
 * Best-effort removal of every file a job wrote; missing files are fine.
 *
 * Deletion has to cover the variants, not just imagePath. This function is the
 * data-minimisation path — the failed-job cleanup, the confirm-time delete and
 * the 24-hour TTL sweep all route through it — so a variant it forgets is a
 * meal photo that outlives its own retention rule.
 */
function deleteJobImage(job: { imagePath?: string; imageVariants?: StoredImageVariant[] }): void {
  const paths = new Set<string>();
  if (job.imagePath) paths.add(job.imagePath);
  for (const variant of job.imageVariants ?? []) paths.add(variant.path);
  for (const file of paths) {
    try {
      unlinkSync(file);
    } catch {
      /* already gone */
    }
  }
}

/**
 * Does the client actually say it understands WebP?
 *
 * Deliberately stricter than req.accepts(), which treats an absent Accept
 * header and a wildcard one as accepting anything. Both really mean "unknown
 * client", and the answer for an unknown client is the encoding
 * every decoder on earth handles. Only an explicit `image/webp` token — what
 * every browser that supports it sends — opts in, and an explicit `q=0` on that
 * token opts back out.
 */
function acceptsWebp(accept: string | undefined): boolean {
  if (!accept) return false;
  return accept.split(',').some((part) => {
    const [type, ...params] = part.trim().split(';');
    if ((type ?? '').trim().toLowerCase() !== STORED_WEBP_MIME) return false;
    return !params.some((param) => /^\s*q\s*=\s*0(?:\.0+)?\s*$/i.test(param));
  });
}

/** Content negotiation over what is actually on disk; JPEG is always the fallback. */
function pickVariant(variants: StoredImageVariant[], accept: string | undefined): StoredImageVariant | undefined {
  if (acceptsWebp(accept)) {
    const webp = variants.find((v) => v.mime === STORED_WEBP_MIME);
    if (webp) return webp;
  }
  return variants.find((v) => v.mime === STORED_JPEG_MIME) ?? variants[0];
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
  // reservationId and aiDegraded are internal metering state; imagePath and
  // imageVariants are server filesystem locations and must never reach the
  // client. The image is reached only through the ownership-checked route.
  const {
    reservationId: _hidden,
    imagePath: _path,
    aiDegraded: _degraded,
    imageVariants: _variants,
    ...rest
  } = job;
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
    
    // AI-04: Compute image hash for mock engine acknowledgment (dev parity)
    let imageHash: string | undefined;
    if (existsSync(job.imagePath)) {
      const imageBuffer = readFileSync(job.imagePath);
      const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
      imageHash = hash.slice(0, 16); // Short hash for seed
    }
    
    const result = await complete('visionPrimary', [{ role: 'user', content: `Identify foods in photo ${seedKey}` }], {
      json: true,
      promptId: 'P-01',
      context: {
        seedKey,
        candidates: visionCandidates(foods),
        // AI-04: Pass image hash for mock dev parity
        imageHash,
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
    const encoded = await toStorableImages(file.buffer, file.mimetype);

    const reservationId = await creditLedger.reserve(user.id, 'mealPhoto', user.tier);

    // Unguessable id: doubles as the on-disk filename, so it must never be
    // enumerable (crypto.randomUUID, not a timestamp counter).
    const jobId = `vj-${crypto.randomUUID()}`;
    const dir = uploadsDir();

    // imagePath stays the JPEG. It is the canonical copy — the fallback the
    // serve route falls back TO, and what processJob hashes — so the variant
    // list records it as well rather than treating it as a separate thing.
    const imagePath = path.join(dir, `${jobId}${STORED_JPEG_EXT}`);
    writeFileSync(imagePath, encoded.jpeg);
    const imageVariants: StoredImageVariant[] = [{ path: imagePath, mime: STORED_JPEG_MIME }];

    if (encoded.webp) {
      const webpPath = path.join(dir, `${jobId}${STORED_WEBP_EXT}`);
      writeFileSync(webpPath, encoded.webp);
      imageVariants.unshift({ path: webpPath, mime: STORED_WEBP_MIME });
    }

    const job: StoredVisionJob = {
      id: jobId,
      userId: user.id,
      type: 'cvJob',
      status: 'queued',
      imagePath,
      imageVariants,
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

    res.status(202).json({ jobId, status: 'queued', job: publicJob(job) });
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
    const available = storedVariants(job).filter((variant) => existsSync(variant.path));
    const chosen = pickVariant(available, req.headers.accept);
    if (!chosen) {
      throw new AppError('NOT_FOUND', 'Photo is no longer available.');
    }
    // The served type is a property of the stored record, read back from the
    // variant we are about to stream. It is never echoed back from the
    // uploader's header, and it is no longer a module constant — since the
    // WebP variant landed, "it is always JPEG" stopped being true.
    res.setHeader('Content-Type', chosen.mime);
    // The response body genuinely differs by Accept, so any cache along the
    // way has to key on it. Redundant next to no-store today; wrong to omit if
    // that policy ever loosens.
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'private, no-store');
    createReadStream(chosen.path)
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
