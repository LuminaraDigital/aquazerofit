/**
 * The meal-photo upload decodes only the formats it advertises.
 *
 * The declared mimetype is an attacker-controlled multipart header, so the
 * real type check was "libvips can decode it". libvips decodes far more than
 * jpeg, png and heic: SVG (rendered by librsvg, with its own parser and
 * resource handling), GIF, TIFF, PDF where built in. Each is attack surface
 * on the request thread of the only API process. The upload now reads the
 * format sharp detects from the bytes and refuses anything else, before any
 * decode.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { User } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-photo-format-'));
process.env.AZF_DATA_DIR = dataDir;
for (const key of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY', 'OLLAMA_API_KEY']) {
  delete process.env[key];
}

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';
let token = '';

beforeAll(async () => {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'photo-format@example.com', password: 'CorrectHorse9Battery' });
  token = res.body.accessToken as string;
  const user = getStore().findOne<User>('users', (d) => (d as User).email === 'photo-format@example.com')!;
  getStore().upsert('users', { ...user, premiumUntil: new Date(Date.now() + 86_400_000).toISOString() });
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await getStore().flush();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const upload = (body: Buffer, contentType: string, filename: string) =>
  request(app)
    .post(`${base}/meal-photos`)
    .set('authorization', `Bearer ${token}`)
    .field('mealType', 'lunch')
    .attach('photo', body, { filename, contentType });

describe('meal photo formats', () => {
  it('accepts a real PNG', async () => {
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c85a28' } }).png().toBuffer();
    expect((await upload(png, 'image/png', 'meal.png')).status).toBe(202);
  });

  it('refuses SVG bytes sent as a PNG', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>',
    );
    const res = await upload(svg, 'image/png', 'meal.png');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a GIF sent as a JPEG', async () => {
    const gif = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c85a28' } }).gif().toBuffer();
    const res = await upload(gif, 'image/jpeg', 'meal.jpg');
    expect(res.status).toBe(400);
  });
});
