/**
 * The streaming turn, with a provider that insists the log is empty.
 *
 * The tool summary on this path already had the day's totals. What the model
 * received did not win: an older assistant turn saying the log was empty sat
 * closer to the question than the context block, and a consent-off context
 * was a set of nulls. This drives the real router with a scripted completion
 * so the stored reply, the wire context and the replayed history are all
 * asserted together.
 */
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { claimsLogEmpty, PERSONALISATION_OFF_REPLY } from '../modules/chat/grounding';
import { resetProviderCircuits } from '../modules/ai/gateway';
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
const savedLlmSafety = process.env.ENABLE_LLM_SAFETY;
const dataDir = createIsolatedDataDir('azf-chat-ground-');
bindIsolatedDataDir(dataDir);
clearProviderEnv();
process.env.GROQ_API_KEY = 'test-key';
process.env.ENABLE_LLM_SAFETY = 'false';

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { upsertDoc } = await import('../modules/ai/util');
const app = createApp();
const base = '/api/v1';
const DAY = '2026-11-02';
const EMPTY_REPLY = 'Your nutrition log is empty. No meal data.';

interface WireCall {
  stream: boolean;
  messages: { role: string; content: string }[];
}
const calls: WireCall[] = [];

function stubProvider(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { stream?: boolean; messages: WireCall['messages'] };
      calls.push({ stream: body.stream === true, messages: body.messages });
      if (body.stream) {
        const streamContent =
          `data: ${JSON.stringify({ choices: [{ delta: { content: EMPTY_REPLY } }] })}\n\n` +
          'data: [DONE]\n\n';
        return {
          ok: true,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null),
          },
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(streamContent));
              controller.close();
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"facts":[]}' } }],
          usage: { total_tokens: 8 },
        }),
      };
    }),
  );
}

function doneMessage(raw: string): { content: string; toolCalls?: { tool: string; resultSummary: string }[] } {
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload.startsWith('{')) continue;
    const frame = JSON.parse(payload) as {
      type?: string;
      message?: { content: string; toolCalls?: { tool: string; resultSummary: string }[] };
    };
    if (frame.type === 'done' && frame.message) return frame.message;
  }
  throw new Error(`no done frame in: ${raw.slice(0, 400)}`);
}

let token = '';
let userId = '';

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  pinIsolatedDataDir(dataDir);
  resetProviderCircuits();
  stubProvider();

  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'grounding@example.com', password: 'CorrectHorse9Battery', displayName: 'Sam' });
  expect(reg.status).toBe(201);
  token = reg.body.accessToken as string;
  userId = reg.body.user.id as string;

  const consents = await request(app).put(`${base}/me/consents`).set(auth()).send({
    wellnessDataProcessing: true,
    aiPersonalisation: true,
    anonymisedAnalytics: false,
    reminders: false,
  });
  expect(consents.status).toBe(200);

  const meal = await request(app)
    .post(`${base}/meal-logs`)
    .set({ ...auth(), 'Idempotency-Key': 'ground-oats' })
    .send({
      mealType: 'breakfast',
      localDate: DAY,
      items: [{ name: 'Oats', grams: 80, kcal: 615, proteinG: 20, carbsG: 80, fatG: 10 }],
    });
  expect(meal.status).toBe(201);

  const water = await request(app)
    .post(`${base}/water-logs`)
    .set(auth())
    .send({ amountMl: 500, localDate: DAY });
  expect(water.status).toBe(201);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (savedLlmSafety === undefined) delete process.env.ENABLE_LLM_SAFETY;
  else process.env.ENABLE_LLM_SAFETY = savedLlmSafety;
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

it('stores a grounded reply when the model and an older turn both say the log is empty', async () => {
  pinIsolatedDataDir(dataDir);
  const session = await request(app).post(`${base}/chat/sessions`).set(auth()).send({});
  expect(session.status).toBe(201);
  const sessionId = session.body.session.id as string;

  await upsertDoc('ai', {
    id: 'cm_prior_user',
    sessionId,
    userId,
    type: 'chatMessage',
    role: 'user',
    content: 'What did I eat?',
    guardrail: { blocked: false, category: null },
    createdAt: '2020-01-01T00:00:00.000Z',
  });
  await upsertDoc('ai', {
    id: 'cm_prior_assistant',
    sessionId,
    userId,
    type: 'chatMessage',
    role: 'assistant',
    content: EMPTY_REPLY,
    guardrail: { blocked: false, category: null },
    createdAt: '2020-01-01T00:00:01.000Z',
  });

  const before = calls.length;
  const res = await request(app)
    .post(`${base}/chat/sessions/${sessionId}/messages`)
    .set(auth())
    .send({ content: 'What did I eat today?', localDate: DAY });
  expect(res.status).toBe(200);

  const stored = doneMessage(res.text);
  expect(stored.content).toContain('615');
  expect(stored.content).toContain('Oats');
  expect(stored.content).toContain('500 ml');
  expect(claimsLogEmpty(stored.content)).toBe(false);
  const nutrition = stored.toolCalls?.find((call) => call.tool === 'getTodayNutrition');
  expect(nutrition?.resultSummary).toMatch(/^615\/\d+ kcal, 1 meals, 500 ml water$/);

  const wire = calls.slice(before).find((call) => call.stream);
  expect(wire).toBeDefined();
  const context = wire!.messages.find((message) => message.content.includes('USER CONTEXT (real data'));
  expect(context?.content).toContain('"personalisation": "on"');
  expect(context?.content).toContain('"name": "Oats"');
  expect(context?.content).toContain('"mealsLogged": 1');

  const override = wire!.messages.find((message) => message.content.includes("TODAY'S GROUNDING OVERRIDES"));
  expect(override?.role).toBe('system');
  expect(override?.content).toContain('615');
  expect(override?.content).not.toContain('Oats');
  // The override sits after the replayed turns, immediately before the question.
  const roles = wire!.messages.map((message) => message.role);
  const overrideAt = wire!.messages.indexOf(override!);
  expect(roles[overrideAt + 1]).toBe('user');
  expect(wire!.messages[overrideAt + 1]?.content).toBe('What did I eat today?');

  const replayed = wire!.messages.filter((message) => message.role === 'assistant');
  expect(replayed).toHaveLength(1);
  expect(replayed[0]?.content).toBe('Continuing from the earlier turn.');
  expect(replayed.some((message) => claimsLogEmpty(message.content))).toBe(false);
});

it('says personalisation is off when logs are not fetched', async () => {
  pinIsolatedDataDir(dataDir);
  const consents = await request(app).put(`${base}/me/consents`).set(auth()).send({
    wellnessDataProcessing: true,
    aiPersonalisation: false,
    anonymisedAnalytics: false,
    reminders: false,
  });
  expect(consents.status).toBe(200);

  const session = await request(app).post(`${base}/chat/sessions`).set(auth()).send({});
  expect(session.status).toBe(201);
  const sessionId = session.body.session.id as string;

  const before = calls.length;
  const res = await request(app)
    .post(`${base}/chat/sessions/${sessionId}/messages`)
    .set(auth())
    .send({ content: 'What did I eat today?', localDate: DAY });
  expect(res.status).toBe(200);

  const stored = doneMessage(res.text);
  expect(stored.content).toBe(PERSONALISATION_OFF_REPLY);
  expect(claimsLogEmpty(stored.content)).toBe(false);
  const nutrition = stored.toolCalls?.find((call) => call.tool === 'getTodayNutrition');
  expect(nutrition?.resultSummary).toBe('not available, personalisation off');

  const wire = calls.slice(before).find((call) => call.stream);
  expect(wire).toBeDefined();
  const context = wire!.messages.find((message) => message.content.includes('USER CONTEXT (real data'));
  expect(context?.content).toContain('"personalisation": "off"');
  expect(context?.content).toContain('"nutrition": null');
  expect(context?.content).not.toContain('Oats');
  expect(context?.content).not.toContain('615');
  const override = wire!.messages.find((message) => message.content.includes("TODAY'S GROUNDING OVERRIDES"));
  expect(override?.content).toMatch(/Privacy/);
  expect(override?.content).not.toMatch(/not empty/);
});
