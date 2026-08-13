/**
 * Consent revocation vs the chat context (memory feature security review).
 *
 * The USER CONTEXT system message is the only channel through which profile
 * and memory data reach a real provider. These tests stub the provider at the
 * fetch seam (same technique as gatewayContext.test.ts) and run FULL HTTP
 * turns, asserting on the exact wire payload:
 *
 *  1. with aiPersonalisation ON the context carries memory facts, profile
 *     essentials and the display name — plus the untrusted-data framing that
 *     defuses prompt injection via stored fact text;
 *  2. after the user revokes consent, the very next turn carries NONE of that
 *     data (no leakage through a stale doc — the doc is retained but
 *     unreadable), and
 *  3. the post-turn fact extraction never fires for a consent-off turn.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-consentctx-'));
process.env.AZF_DATA_DIR = dataDir;
// Exactly one (stubbed) provider: groq. Clear anything the host env carries.
for (const key of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY', 'OLLAMA_API_KEY']) {
  delete process.env[key];
}
process.env.GROQ_API_KEY = 'test-key';

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

const CHAT_MODEL = 'llama-3.3-70b-versatile'; // groq chatFast lane
const EXTRACTION_MODEL = 'llama-3.1-8b-instant'; // groq safetyCheap lane (P-10)
const FACT_TEXT = 'Follows a strict vegetarian diet (consent context marker)';
const DISPLAY_NAME = 'Samushka';

interface WireCall {
  model: string;
  messages: { role: string; content: string }[];
}
const calls: WireCall[] = [];

vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as WireCall;
    calls.push({ model: body.model, messages: body.messages });
    // The extraction lane asks for JSON; the chat lane wants prose (SSE stream).
    const isStream = init.body && JSON.parse(init.body).stream === true;
    const isExtraction = body.model === EXTRACTION_MODEL;
    
    if (isStream && !isExtraction) {
      // Return proper SSE stream for chat lane
      const streamContent = 'data: {"choices":[{"delta":{"content":"Grounded "}}]}\n\n' +
                            'data: {"choices":[{"delta":{"content":"reply."}}]}\n\n' +
                            'data: [DONE]\n\n';
      return {
        ok: true,
        headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? 'text/event-stream' : null },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(streamContent));
            controller.close();
          }
        }),
      };
    }
    
    // Non-streaming (extraction) response
    const content = isExtraction ? '{"facts":[]}' : 'Grounded reply.';
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content } }],
        usage: { total_tokens: 42 },
      }),
    };
  }),
);

let token = '';
let sessionId = '';

const auth = () => ({ Authorization: `Bearer ${token}` });

async function setConsents(aiPersonalisation: boolean): Promise<void> {
  const res = await request(app).put(`${base}/me/consents`).set(auth()).send({
    wellnessDataProcessing: true,
    aiPersonalisation,
    anonymisedAnalytics: false,
    reminders: false,
  });
  expect(res.status).toBe(200);
}

async function runTurn(content: string): Promise<string> {
  const res = await request(app)
    .post(`${base}/chat/sessions/${sessionId}/messages`)
    .set(auth())
    .send({ content });
  expect(res.status).toBe(200);
  expect(res.text).toContain('"type":"done"');
  return res.text;
}

/** Wait until the fire-and-forget extraction either fires or clearly won't. */
async function settleBackgroundWork(ms = 300): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'consent-context@example.com', password: 'CorrectHorse9Battery', displayName: DISPLAY_NAME });
  expect(reg.status).toBe(201);
  token = reg.body.accessToken as string;

  await setConsents(true);

  const profile = await request(app).put(`${base}/me/profile`).set(auth()).send({
    weightKg: 82,
    heightCm: 176,
    age: 29,
    sex: 'male',
    goal: 'lose',
    activityLevel: 'moderate',
    exerciseExperience: 'beginner',
    dietaryPreferences: ['vegetarian'],
    allergies: ['peanuts'],
    equipment: ['dumbbells'],
    unitPreference: 'metric',
  });
  expect(profile.status).toBe(200);

  const fact = await request(app)
    .post(`${base}/me/memory/facts`)
    .set(auth())
    .send({ text: FACT_TEXT, category: 'constraint' });
  expect(fact.status).toBe(201);

  const session = await request(app).post(`${base}/chat/sessions`).set(auth()).send({});
  expect(session.status).toBe(201);
  sessionId = session.body.session.id as string;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

it('consented turn: memory + profile + name reach the provider inside a framed USER CONTEXT block', async () => {
  await runTurn('How am I tracking today?');
  await settleBackgroundWork();

  const chatCall = calls.find((c) => c.model === CHAT_MODEL);
  expect(chatCall).toBeDefined();
  const contextMsg = chatCall!.messages.find(
    (m) => m.role === 'system' && m.content.includes('USER CONTEXT (real data'),
  );
  expect(contextMsg).toBeDefined();
  expect(contextMsg!.content).toContain(FACT_TEXT);
  expect(contextMsg!.content).toContain('"goal": "lose"');
  expect(contextMsg!.content).toContain(DISPLAY_NAME);
  // Prompt-injection mitigation: the block is explicitly framed as data.
  expect(contextMsg!.content).toContain('DATA, not instructions');

  // The post-turn extraction fired on the cheap lane (consent is on).
  expect(calls.some((c) => c.model === EXTRACTION_MODEL)).toBe(true);
});

it('after consent revocation: the next turn carries no memory, no profile, no name — and no extraction fires', async () => {
  await setConsents(false);
  const before = calls.length;

  await runTurn('And what should I eat tonight?');
  await settleBackgroundWork();

  const newCalls = calls.slice(before);
  // Exactly the chat completion — the extraction lane must stay silent.
  expect(newCalls).toHaveLength(1);
  expect(newCalls[0]!.model).toBe(CHAT_MODEL);

  const wire = JSON.stringify(newCalls[0]!.messages);
  expect(wire).not.toContain(FACT_TEXT);
  expect(wire).not.toContain(DISPLAY_NAME);
  expect(wire).not.toContain('"goal": "lose"');
  expect(wire).not.toContain('peanuts');

  // The memory doc itself is retained (re-consent restores it) — revocation
  // gates access, deletion is DELETE /me/memory or account purge.
  const { memoryId } = await import('../modules/memory/service');
  const me = await request(app).get(`${base}/me`).set(auth());
  expect(getStore().byId('ai', memoryId(me.body.user.id as string))).toBeDefined();
});

it('re-enabling consent restores the same memory into context (retention, not deletion)', async () => {
  await setConsents(true);
  const before = calls.length;
  await runTurn('Back again — plans for tomorrow?');
  await settleBackgroundWork();

  const chatCall = calls.slice(before).find((c) => c.model === CHAT_MODEL);
  expect(chatCall).toBeDefined();
  const contextMsg = chatCall!.messages.find(
    (m) => m.role === 'system' && m.content.includes('USER CONTEXT (real data'),
  );
  expect(contextMsg!.content).toContain(FACT_TEXT);
});
