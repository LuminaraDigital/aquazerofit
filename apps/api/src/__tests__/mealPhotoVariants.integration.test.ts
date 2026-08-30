/**
 * MEAL-PHOTO STORAGE AND DELIVERY SUITE.
 *
 * Two changes to the upload pipeline are pinned here.
 *
 * Resizing: a phone hands us a 12 MP capture and we were storing all of it,
 * when every consumer is a confirm-sheet thumbnail or a model that downsamples
 * before it looks at anything.
 *
 * WebP: a second encoding is written alongside the JPEG and chosen by Accept.
 * That breaks the invariant the serve route used to rely on — "everything came
 * out of sharp as JPEG, so the served type is a constant" — so the type now
 * travels on the stored record. The tests that matter most below are the ones
 * asserting the JPEG fallback still works, because a client that cannot decode
 * WebP getting WebP anyway is a blank photo with a 200 status.
 *
 * The privacy guarantees this pipeline already carried (EXIF/GPS stripping,
 * decode-as-type-check, no-store on delivery) are covered in
 * uploadSecurity.test.ts and are re-asserted here only where the resize could
 * plausibly have disturbed them.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { User } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-photo-variants-'));
process.env.AZF_DATA_DIR = dataDir;
// The background analysis kicked off by an upload must land on the
// deterministic mock provider even on a host carrying real provider keys.
for (const key of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY', 'OLLAMA_API_KEY']) {
  delete process.env[key];
}

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

type StoredVariant = { path: string; mime: string };
type StoredJob = { imagePath?: string; imageVariants?: StoredVariant[] };

let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
/** Files the API wrote during this run, for cleanup. */
const written: string[] = [];

function storedJob(jobId: string): StoredJob {
  const job = getStore().byId('ai', jobId) as StoredJob | undefined;
  expect(job).toBeTruthy();
  if (job!.imagePath) written.push(job!.imagePath);
  for (const variant of job!.imageVariants ?? []) written.push(variant.path);
  return job!;
}

/** A deliberately oversized capture, standing in for a 12 MP phone photo. */
function bigJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 90, b: 40 } } })
    .jpeg()
    .toBuffer();
}

async function uploadPhoto(body: Buffer, filename = 'meal.jpg', contentType = 'image/jpeg'): Promise<string> {
  const res = await request(app)
    .post(`${base}/meal-photos`)
    .set(auth())
    .field('mealType', 'lunch')
    .attach('photo', body, { filename, contentType });
  expect(res.status).toBe(202);
  return res.body.jobId as string;
}

beforeAll(async () => {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'photo-variants@example.com', password: 'CorrectHorse9Battery' });
  expect(res.status).toBe(201);
  token = res.body.accessToken as string;

  /*
   * Comp the account so the credit allowance cannot decide whether this file
   * passes. The free tier is ten credits and a photo costs three, so a
   * suite that uploads more than three images starts 402-ing on a limit that
   * has nothing to do with image variants, EXIF or content negotiation — and
   * the failure would then move every time the pricing does. What is under
   * test here is the storage pipeline; the paywall is tested in its own file.
   */
  const store = getStore();
  const user = store.findOne<User>(
    'users',
    (d) => (d as User).email === 'photo-variants@example.com',
  );
  if (user) {
    store.upsert('users', {
      ...user,
      premiumUntil: new Date(Date.now() + 86_400_000).toISOString(),
    });
  }
});

afterAll(async () => {
  // Each upload schedules a background analysis ~1.2 s later; let it settle so
  // it cannot race the cleanup below.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await getStore().flush();
  for (const file of written) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* the confirm/fail paths delete it themselves */
    }
  }
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

// ---------------------------------------------------------------------------

describe('stored photos are resized', () => {
  it('a 3000x2250 capture is stored at 1600px on the long edge, aspect ratio intact', async () => {
    const source = await bigJpeg(3000, 2250);
    const job = storedJob(await uploadPhoto(source));

    const stored = await sharp(fs.readFileSync(job.imagePath!)).metadata();
    expect(stored.width).toBe(1600);
    expect(stored.height).toBe(1200); // 4:3 preserved
    expect(stored.format).toBe('jpeg');
  });

  it('a portrait capture is bounded on its own long edge, not squashed into a box', async () => {
    const job = storedJob(await uploadPhoto(await bigJpeg(2250, 3000)));
    const stored = await sharp(fs.readFileSync(job.imagePath!)).metadata();
    expect(stored.width).toBe(1200);
    expect(stored.height).toBe(1600);
  });

  it('a small photo is passed through at its own size, never upscaled', async () => {
    // withoutEnlargement: blowing a 64x48 thumbnail up to 1600px would cost
    // bytes and add nothing but blur.
    const job = storedJob(await uploadPhoto(await bigJpeg(64, 48)));
    const stored = await sharp(fs.readFileSync(job.imagePath!)).metadata();
    expect(stored.width).toBe(64);
    expect(stored.height).toBe(48);
  });

  it('the resize actually saves a large amount of disk', async () => {
    const source = await bigJpeg(3000, 2250);
    const job = storedJob(await uploadPhoto(source));
    const stored = fs.statSync(job.imagePath!).size;
    expect(stored).toBeLessThan(source.length / 2);
  });

  it('resizing did not disturb the EXIF stripping this pipeline exists to do', async () => {
    const withExif = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: { r: 10, g: 160, b: 80 } },
    })
      .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSDateStamp: '2026:07:31' } })
      .jpeg()
      .toBuffer();

    const job = storedJob(await uploadPhoto(withExif));
    const bytes = fs.readFileSync(job.imagePath!);
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    expect(bytes.includes(Buffer.from('2026:07:31'))).toBe(false);
  });
});

describe('a WebP variant is stored alongside the JPEG', () => {
  let jobId = '';
  let job: StoredJob;

  beforeAll(async () => {
    jobId = await uploadPhoto(await bigJpeg(2000, 1500));
    job = storedJob(jobId);
  });

  it('the record names both encodings and the mime of each', () => {
    expect(job.imageVariants).toBeTruthy();
    const mimes = job.imageVariants!.map((v) => v.mime).sort();
    expect(mimes).toEqual(['image/jpeg', 'image/webp']);
    // The served type is a property of the record, not a module constant.
    for (const variant of job.imageVariants!) {
      expect(fs.existsSync(variant.path)).toBe(true);
    }
  });

  it('imagePath still points at the JPEG — it is the canonical fallback copy', () => {
    expect(job.imagePath!.endsWith('.jpg')).toBe(true);
    const jpegVariant = job.imageVariants!.find((v) => v.mime === 'image/jpeg');
    expect(jpegVariant!.path).toBe(job.imagePath);
  });

  it('the WebP is a real, smaller WebP of the same resized dimensions', async () => {
    const webp = job.imageVariants!.find((v) => v.mime === 'image/webp')!;
    const meta = await sharp(fs.readFileSync(webp.path)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(1200);
    expect(fs.statSync(webp.path).size).toBeLessThan(fs.statSync(job.imagePath!).size);
  });

  it('neither the variant list nor the filesystem paths leak into the job payload', async () => {
    const res = await request(app).get(`${base}/meal-photos/${jobId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.job.imageVariants).toBeUndefined();
    expect(res.body.job.imagePath).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(dataDir);
  });
});

describe('the image route negotiates on Accept', () => {
  let jobId = '';

  beforeAll(async () => {
    jobId = await uploadPhoto(await bigJpeg(1200, 900));
  });

  const fetchImage = (accept?: string) => {
    const req = request(app).get(`${base}/meal-photos/${jobId}/image`).set(auth());
    return accept === undefined ? req : req.set('Accept', accept);
  };

  it('a browser that advertises image/webp gets WebP', async () => {
    const res = await fetchImage('image/avif,image/webp,image/apng,*/*;q=0.8');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/webp');
    expect((await sharp(res.body as Buffer).metadata()).format).toBe('webp');
  });

  it('a client that sends no Accept header gets JPEG', async () => {
    // The important fallback: an unknown client is not evidence of WebP
    // support, and serving WebP to a decoder that lacks it is a blank image
    // with a 200 status — the worst possible failure shape.
    const res = await fetchImage();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect((await sharp(res.body as Buffer).metadata()).format).toBe('jpeg');
  });

  it('a wildcard-only Accept gets JPEG, not WebP', async () => {
    const res = await fetchImage('*/*');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
  });

  it('an explicit image/webp;q=0 is honoured as a refusal', async () => {
    const res = await fetchImage('image/webp;q=0, image/jpeg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
  });

  it('a JPEG-only client gets JPEG', async () => {
    const res = await fetchImage('image/jpeg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
  });

  it('Vary: Accept is set, because the body genuinely differs by Accept', async () => {
    const res = await fetchImage('image/webp');
    expect(res.headers['vary']).toContain('Accept');
  });

  it('delivery is still private and no-store whichever variant is served', async () => {
    for (const accept of ['image/webp', 'image/jpeg']) {
      const res = await fetchImage(accept);
      // The handler sets this itself and must win over the router-wide default.
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
  });

  it('another user still cannot reach the photo, whatever they send in Accept', async () => {
    const other = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: 'photo-variants-other@example.com', password: 'CorrectHorse9Battery' });
    expect(other.status).toBe(201);

    const res = await request(app)
      .get(`${base}/meal-photos/${jobId}/image`)
      .set({ Authorization: `Bearer ${other.body.accessToken}` })
      .set('Accept', 'image/webp');
    expect(res.status).toBe(404);
  });
});

describe('legacy records written before WebP existed still serve', () => {
  it('a job with only imagePath and no variant list is served as JPEG', async () => {
    const jobId = await uploadPhoto(await bigJpeg(800, 600));
    const store = getStore();
    const job = store.byId('ai', jobId) as unknown as StoredJob & Record<string, unknown>;

    // Simulate the on-disk shape of a job stored before this change: drop the
    // variant list and the WebP file, leaving only the JPEG.
    for (const variant of job.imageVariants ?? []) {
      if (variant.mime === 'image/webp') fs.unlinkSync(variant.path);
    }
    delete job.imageVariants;
    store.upsert('ai', job as never);

    const res = await request(app)
      .get(`${base}/meal-photos/${jobId}/image`)
      .set(auth())
      .set('Accept', 'image/webp,*/*');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
  });
});

describe('deletion covers every variant', () => {
  it('confirming a job removes the WebP as well as the JPEG', async () => {
    const jobId = await uploadPhoto(await bigJpeg(1000, 750));
    const paths = storedJob(jobId).imageVariants!.map((v) => v.path);
    expect(paths).toHaveLength(2);
    expect(paths.every((p) => fs.existsSync(p))).toBe(true);

    // Wait for the background analysis to reach 'succeeded' so confirm is legal.
    let status = '';
    for (let attempt = 0; attempt < 40 && status !== 'succeeded'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const poll = await request(app).get(`${base}/meal-photos/${jobId}`).set(auth());
      status = poll.body.job?.status as string;
      if (status === 'failed') break;
    }
    expect(status).toBe('succeeded');

    const poll = await request(app).get(`${base}/meal-photos/${jobId}`).set(auth());
    type Prediction = {
      foodId: string;
      name: string;
      estimatedGrams: number;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    };
    const items = (poll.body.job.predictions as Prediction[]).map((p) => ({
      foodId: p.foodId,
      name: p.name,
      grams: p.estimatedGrams,
      kcal: p.kcal,
      proteinG: p.proteinG,
      carbsG: p.carbsG,
      fatG: p.fatG,
    }));

    const confirmed = await request(app)
      .post(`${base}/meal-photos/${jobId}/confirm`)
      .set(auth())
      .send({ mealType: 'lunch', localDate: '2026-08-28', items });
    expect(confirmed.status).toBe(201);

    // Data minimisation: the confirmed items live in the meal log now, so no
    // encoding of the raw photo may survive.
    for (const file of paths) expect(fs.existsSync(file)).toBe(false);
  });
});
