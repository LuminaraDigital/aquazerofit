/**
 * MEAL-PHOTO UPLOAD SECURITY SUITE (security review, pre-deployment).
 *
 * Meal photos are health-adjacent personal data, so the upload path carries
 * two obligations that the rest of the vision suite does not cover:
 *
 *  1. Metadata minimisation — a phone photo's EXIF holds GPS at home-address
 *     precision, the capture timestamp and the camera serial. None of it may
 *     survive onto disk next to a health record.
 *  2. Type enforcement — the mimetype on a multipart part is set by the
 *     client, so it proves nothing. A non-image payload wearing an image
 *     mimetype must be rejected, never stored and later served as an image.
 *
 * Both are asserted against the bytes the API actually persisted, not against
 * what the handler claims it did.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MEAL_PHOTO_MAX_BYTES } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-upload-sec-'));
process.env.AZF_DATA_DIR = dataDir;
// The background job kicked off by an upload must land on the deterministic
// mock provider, even when the host environment carries real provider keys.
for (const key of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY', 'OLLAMA_API_KEY']) {
  delete process.env[key];
}

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';
const PASSWORD = 'CorrectHorse9Battery';

// Distinctive EXIF strings: if any of these can still be found in the stored
// file, the re-encode did not actually discard the metadata block.
// Coordinates themselves are written as binary rationals, so GPSDateStamp is
// the searchable ASCII sentinel that proves the GPS IFD travelled with the file.
const CAMERA_MAKE = 'AquaZeroFitTestCam';
const CAMERA_SERIAL = 'SN-TEST-0424242';
const GPS_DATESTAMP = '2026:07:31';
const GPS_LATITUDE = '51/1 30/1 26/1'; // ~central London, home-address precision
const GPS_LONGITUDE = '0/1 7/1 39/1';

let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
/** Files the API wrote under apps/api/uploads during this run, for cleanup. */
const written: string[] = [];

/** A real JPEG carrying GPS and camera-identity EXIF, as a phone would emit. */
function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 210, g: 120, b: 60 } } })
    .withExif({
      IFD0: { Make: CAMERA_MAKE, Model: 'AZF-1', BodySerialNumber: CAMERA_SERIAL },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: GPS_LATITUDE,
        GPSLongitudeRef: 'W',
        GPSLongitude: GPS_LONGITUDE,
        GPSDateStamp: GPS_DATESTAMP,
      },
    })
    .jpeg()
    .toBuffer();
}

/**
 * Read back what the server put on disk. imagePath is deliberately never in
 * any response body, so the store is the only way to reach it.
 */
function storedBytes(jobId: string): Buffer {
  const job = getStore().byId('ai', jobId) as { imagePath?: string } | undefined;
  expect(job?.imagePath).toBeTruthy();
  const file = job!.imagePath as string;
  written.push(file);
  return fs.readFileSync(file);
}

beforeAll(async () => {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'upload-security@example.com', password: PASSWORD });
  expect(res.status).toBe(201);
  token = res.body.accessToken as string;
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

describe('EXIF/GPS stripping on meal-photo upload', () => {
  let source: Buffer;
  let stored: Buffer;

  beforeAll(async () => {
    source = await jpegWithExif();

    const res = await request(app)
      .post(`${base}/meal-photos`)
      .set(auth())
      .field('mealType', 'lunch')
      .attach('photo', source, { filename: 'IMG_4821.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(202);
    // Read the file before the background job can reach its terminal state,
    // where a failure would delete it.
    stored = storedBytes(res.body.jobId as string);
  });

  it('the fixture really does carry GPS and camera identity (guards a vacuous pass)', async () => {
    const meta = await sharp(source).metadata();
    expect(meta.exif).toBeTruthy();
    expect(source.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(true);
    for (const marker of [CAMERA_MAKE, CAMERA_SERIAL, GPS_DATESTAMP]) {
      expect(source.includes(Buffer.from(marker))).toBe(true);
    }
  });

  it('the stored image has no EXIF block at all', async () => {
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it('no GPS coordinate or camera-identity string survives in the stored bytes', () => {
    for (const marker of [CAMERA_MAKE, CAMERA_SERIAL, GPS_DATESTAMP]) {
      expect(stored.includes(Buffer.from(marker))).toBe(false);
    }
    // Belt and braces: no APP1/Exif marker segment anywhere in the file.
    expect(stored.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(false);
  });

  it('the photo itself is intact — same pixels, still a decodable JPEG', async () => {
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(48);
  });
});

describe('upload type enforcement (the client mimetype is not evidence)', () => {
  it('a non-image payload labelled image/jpeg is rejected with a validation error', async () => {
    const notAnImage = Buffer.from(
      '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n',
      'utf8',
    );
    const res = await request(app)
      .post(`${base}/meal-photos`)
      .set(auth())
      .attach('photo', notAnImage, { filename: 'lunch.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    // A clean rejection, not a crash surfacing as a 500.
    expect(res.status).not.toBe(500);
  });

  it('a rejected upload creates no job and holds no credits', async () => {
    const jobs = () => getStore().where('ai', (d) => (d as { type?: string }).type === 'cvJob').length;
    const holds = () =>
      getStore().where('ledger', (d) => (d as { reason?: string }).reason === 'reserve:mealPhoto').length;
    const jobsBefore = jobs();
    const holdsBefore = holds();

    const res = await request(app)
      .post(`${base}/meal-photos`)
      .set(auth())
      .attach('photo', Buffer.from('definitely not an image at all'), {
        filename: 'meal.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);

    // Validation runs before the reservation, so nothing is left dangling.
    expect(jobs()).toBe(jobsBefore);
    expect(holds()).toBe(holdsBefore);
  });

  it('a real PNG is accepted, stored as JPEG, and served with the type we produced', async () => {
    const png = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 20, g: 180, b: 90 } },
    })
      .png()
      .toBuffer();

    const res = await request(app)
      .post(`${base}/meal-photos`)
      .set(auth())
      // A deliberately wrong extension: nothing downstream may key off it.
      .attach('photo', png, { filename: 'meal.heic', contentType: 'image/png' });
    expect(res.status).toBe(202);

    const jobId = res.body.jobId as string;
    const stored = storedBytes(jobId);
    expect((await sharp(stored).metadata()).format).toBe('jpeg');

    const image = await request(app).get(`${base}/meal-photos/${jobId}/image`).set(auth());
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toContain('image/jpeg');
    expect(image.headers['cache-control']).toContain('no-store');
  });
});

describe('multipart limits survive the multer v1 → v2 upgrade', () => {
  it('an oversized upload is refused as a validation error, not a crash', async () => {
    const oversized = Buffer.alloc(MEAL_PHOTO_MAX_BYTES + 1024, 0x41);
    const res = await request(app)
      .post(`${base}/meal-photos`)
      .set(auth())
      .attach('photo', oversized, { filename: 'huge.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details?.maxBytes).toBe(MEAL_PHOTO_MAX_BYTES);
  });

  it('the process is still healthy afterwards (no unhandled multipart stream error)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
