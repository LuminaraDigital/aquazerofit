/**
 * The meal recommender must send P-02 to real providers. It used to send only
 * the user line and the context block, so a configured model ranked without
 * the output schema or the rules — the offline engine never noticed, because
 * it grounds on context and does not read prompts.
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { resetProviderCircuits } from '../modules/ai/gateway';
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
const dataDir = createIsolatedDataDir('azf-rec-prompt-');
bindIsolatedDataDir(dataDir);
clearProviderEnv();
process.env.GROQ_API_KEY = 'test-key';

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

type Message = { role: string; content: string };
const calls: { url: string; messages: Message[] }[] = [];
let token = '';

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
});

beforeAll(async () => {
  resetProviderCircuits();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      calls.push({ url: String(url), messages: (JSON.parse(init.body) as { messages: Message[] }).messages });
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ rankedIds: [], rationale: 'Fits your budget.' }) } }],
          usage: { total_tokens: 30 },
        }),
      };
    }),
  );

  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'rec-prompt@example.com', password: 'CorrectHorse9Battery' });
  expect(reg.status).toBe(201);
  token = reg.body.accessToken as string;
  // aiPersonalisation ON routes the request through the model path.
  const consents = await request(app)
    .put(`${base}/me/consents`)
    .set({ Authorization: `Bearer ${token}` })
    .send({ wellnessDataProcessing: true, aiPersonalisation: true, anonymisedAnalytics: false, reminders: false });
  expect(consents.status).toBe(200);
  await getStore().flush();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetProviderCircuits();
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

it('sends the P-02 system prompt ahead of the context block and the request', async () => {
  const res = await request(app)
    .post(`${base}/recommendations/meals`)
    .set({ Authorization: `Bearer ${token}` })
    .send({ mealType: 'lunch', localDate: '2026-07-31' });
  expect(res.status).toBe(201);
  expect(res.body.recommendation.ai.provider).toBe('groq');

  expect(calls).toHaveLength(1);
  const [prompt, context, ask] = calls[0]!.messages;
  expect(prompt).toEqual({ role: 'system', content: loadPrompt('P-02').content });
  expect(prompt!.content).toContain('P-02');
  expect(context!.role).toBe('system');
  expect(context!.content).toContain('UNTRUSTED_DATA');
  expect(ask!.role).toBe('user');
  expect(ask!.content).toMatch(/^Recommend a lunch/);
});
