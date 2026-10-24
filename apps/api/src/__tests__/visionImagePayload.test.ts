/**
 * End to end: the meal photo a user uploads is the image the vision provider
 * receives. Before this, processJob sent only the text "Identify foods in photo
 * <filename>", so a configured vision model was guessing from a filename.
 *
 * Asserted on the wire (fetch stubbed): the P-01 prompt leads the payload, and
 * the last user message carries the stored, re-encoded JPEG byte for byte as a
 * base64 image_url part.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WireContentPart } from '../modules/ai/gateway';
import { loadPrompt } from '../modules/ai/prompts';
import {
  bindIsolatedDataDir,
  clearProviderEnv,
  createIsolatedDataDir,
  pinIsolatedDataDir,
  saveProviderEnv,
  teardownIsolatedDataDir,
} from './helpers/integrationIsolation';

const savedAzfDataDir = process.env.AZF_DATA_DIR;
const savedProviderEnv = saveProviderEnv();
const dataDir = createIsolatedDataDir('azf-vision-image-');
bindIsolatedDataDir(dataDir);
clearProviderEnv();

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { resetProviderCircuits } = await import('../modules/ai/gateway');
const app = createApp();
const base = '/api/v1';

type StoredJob = {
  id: string;
  status: string;
  imagePath?: string;
  imageVariants?: { path: string }[];
  ai?: { provider?: string } | null;
  predictions: { foodId?: string }[];
};
type ProviderCall = { url: string; body: { messages: { role: string; content: string | WireContentPart[] }[] } };

let token = '';
const written: string[] = [];

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
});

beforeAll(async () => {
  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'vision-image@example.com', password: 'CorrectHorse9Battery' });
  expect(reg.status).toBe(201);
  token = reg.body.accessToken as string;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetProviderCircuits();
  for (const file of written) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* the confirm/fail paths delete it themselves */
    }
  }
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for the vision job');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('meal photo → vision provider payload', () => {
  it('sends P-01 and the stored JPEG bytes to a vision-capable provider', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    resetProviderCircuits();
    const calls: ProviderCall[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url: String(url), body: JSON.parse(init.body) as ProviderCall['body'] });
        const content = JSON.stringify({
          items: [
            {
              name: 'Chicken Breast (grilled)',
              portion: 'one small fillet',
              estimatedGrams: 150,
              confidence: 0.9,
            },
          ],
        });
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 42 } }),
        };
      }),
    );

    const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 120, b: 40 } } })
      .jpeg()
      .toBuffer();
    const up = await request(app)
      .post(`${base}/meal-photos`)
      .set({ Authorization: `Bearer ${token}` })
      .field('mealType', 'lunch')
      .attach('photo', jpeg, { filename: 'meal.jpg', contentType: 'image/jpeg' });
    expect(up.status).toBe(202);
    const jobId = up.body.jobId as string;

    const stored = getStore().byId<StoredJob>('ai', jobId)!;
    written.push(stored.imagePath!, ...(stored.imageVariants ?? []).map((v) => v.path));
    // Read now: the stored file is the re-encoded JPEG, not the upload.
    const storedBytes = fs.readFileSync(stored.imagePath!);

    const done = await waitFor(() => {
      const job = getStore().byId<StoredJob>('ai', jobId);
      return job && (job.status === 'succeeded' || job.status === 'failed') ? job : undefined;
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('openai.com');
    const messages = calls[0]!.body.messages;
    expect(messages[0]).toEqual({ role: 'system', content: loadPrompt('P-01').content });
    const prompt = messages[0]!.content as string;
    expect(prompt.length).toBeLessThan(1_500);
    expect(prompt).not.toContain('Strict grounding rule');
    expect(prompt).not.toContain('Kangaroo');
    expect(JSON.stringify(calls[0]!.body)).not.toContain('food-barramundi');
    expect(JSON.stringify(calls[0]!.body)).not.toContain('"candidates"');
    const parts = messages.at(-1)!.content as WireContentPart[];
    expect(Array.isArray(parts)).toBe(true);
    expect(parts).toContainEqual({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${storedBytes.toString('base64')}` },
    });

    expect(done.status).toBe('succeeded');
    expect(done.ai?.provider).toBe('openai');
    expect(done.predictions.map((p) => p.foodId)).toEqual(['food-chicken-breast']);
  });
});
