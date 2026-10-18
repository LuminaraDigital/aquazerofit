/**
 * Gateway vision behaviour:
 *  1. extractJson — the strictest-first fallback that copes with providers
 *     (Gemini in particular) wrapping JSON in a fence or preamble prose.
 *  2. withImageParts — images ride on the last user message as image_url parts.
 *  3. Provider selection — text-only providers (Groq) are skipped when the
 *     caller supplies opts.images; a mock answer after that skip is degraded,
 *     which is what releases the user's credit hold.
 * The provider is stubbed at the fetch seam so the wire payload is asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  complete,
  extractJson,
  resetProviderCircuits,
  withImageParts,
  type GatewayMessage,
  type WireContentPart,
} from '../modules/ai/gateway';

const PROVIDER_ENV = [
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'NVIDIA_API_KEY',
  'NVIDIA_BASE_URL',
  'OLLAMA_API_KEY',
  'OLLAMA_BASE_URL',
];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of PROVIDER_ENV) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  resetProviderCircuits();
});

afterEach(() => {
  for (const key of PROVIDER_ENV) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  resetProviderCircuits();
});

const VISION_MESSAGES: GatewayMessage[] = [
  { role: 'system', content: '# P-01 — Meal Photograph Analysis\nIdentify foods.' },
  { role: 'user', content: 'Identify foods in photo test.jpg' },
];
const IMAGE = `data:image/jpeg;base64,${Buffer.from('fake-jpeg-bytes').toString('base64')}`;
const CANDIDATES = [
  { id: 'food-chicken', name: 'Chicken Breast', commonServings: [{ label: 'serving', grams: 150 }] },
  { id: 'food-rice', name: 'White Rice', commonServings: [{ label: 'cup', grams: 180 }] },
];

interface StubCall {
  url: string;
  body: { messages: { role: string; content: string | WireContentPart[] }[] } & Record<string, unknown>;
}

function stubFetch(handler: (call: StubCall) => unknown): { calls: StubCall[] } {
  const calls: StubCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      const call = { url: String(url), body: JSON.parse(init.body) as StubCall['body'] };
      calls.push(call);
      return handler(call);
    }),
  );
  return { calls };
}

function response(status: number, payload: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  };
}

function okBody(text: string) {
  return { choices: [{ message: { content: text } }], usage: { total_tokens: 20 } };
}

describe('extractJson', () => {
  it('parses plain JSON, whitespace and all', () => {
    expect(extractJson('\n  {"predictions":[{"foodId":"food-chicken-breast","confidence":0.9}]}\n')).toEqual({
      predictions: [{ foodId: 'food-chicken-breast', confidence: 0.9 }],
    });
  });

  it('strips a ```json fence and a bare ``` fence', () => {
    expect(extractJson('```json\n{"predictions":[]}\n```')).toEqual({ predictions: [] });
    expect(extractJson('```\n{"predictions":[]}\n```')).toEqual({ predictions: [] });
  });

  it('extracts the object from after preamble prose', () => {
    const text = 'Here is my analysis of the meal photo:\n{"predictions":[{"foodId":"food-broccoli","confidence":0.8}]}';
    expect((extractJson(text) as { predictions: { foodId: string }[] }).predictions[0]?.foodId).toBe('food-broccoli');
  });

  it('handles preamble plus a fence plus trailing prose', () => {
    const text = 'Sure! Here is the JSON output:\n```json\n{"predictions":[]}\n```\nLet me know if you need more.';
    expect(extractJson(text)).toEqual({ predictions: [] });
  });

  it('throws a SyntaxError when no JSON object can be found', () => {
    expect(() => extractJson('I cannot analyse this image due to content policies.')).toThrow(SyntaxError);
    expect(() => extractJson('')).toThrow(SyntaxError);
  });
});

describe('withImageParts', () => {
  it('attaches image parts to the last user message only', () => {
    const messages: GatewayMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'look at this' },
    ];
    const out = withImageParts(messages, [IMAGE]);
    expect(out.slice(0, 3)).toEqual(messages.slice(0, 3));
    expect(out[3]!.content).toEqual([
      { type: 'text', text: 'look at this' },
      { type: 'image_url', image_url: { url: IMAGE } },
    ]);
  });

  it('leaves messages untouched with no images or no user turn', () => {
    expect(withImageParts(VISION_MESSAGES, undefined)).toBe(VISION_MESSAGES);
    expect(withImageParts(VISION_MESSAGES, [])).toBe(VISION_MESSAGES);
    const systemOnly: GatewayMessage[] = [{ role: 'system', content: 'sys' }];
    expect(withImageParts(systemOnly, [IMAGE])).toBe(systemOnly);
  });
});

describe('complete() vision-provider selection', () => {
  it('skips Groq and sends the image to OpenAI as an image_url part', async () => {
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.OPENAI_API_KEY = 'oai-key';
    const { calls } = stubFetch((call) =>
      call.url.includes('openai.com')
        ? response(200, okBody(JSON.stringify({ predictions: [] })))
        : response(400, { error: 'text-only model' }),
    );

    const result = await complete('visionPrimary', VISION_MESSAGES, { json: true, images: [IMAGE] });

    expect(calls.filter((c) => c.url.includes('groq.com'))).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(result.meta.provider).toBe('openai');
    expect(result.meta.degraded).toBe(false);
    const messages = calls[0]!.body.messages;
    expect(messages[0]).toEqual(VISION_MESSAGES[0]);
    expect(messages.at(-1)!.content).toEqual([
      { type: 'text', text: 'Identify foods in photo test.jpg' },
      { type: 'image_url', image_url: { url: IMAGE } },
    ]);
  });

  it('falls through to a degraded mock when Groq is the only key and images are supplied', async () => {
    process.env.GROQ_API_KEY = 'groq-key';
    // The key-optional Ollama probe is the only call that can go out; reject it
    // so the terminal answer is always the mock.
    const { calls } = stubFetch(() => response(503));

    const result = await complete('visionPrimary', VISION_MESSAGES, {
      json: true,
      images: [IMAGE],
      context: { seedKey: 'test.jpg', candidates: CANDIDATES },
    });

    expect(calls.filter((c) => c.url.includes('groq.com'))).toHaveLength(0);
    expect(result.meta.provider).toBe('mock');
    // A real key was present but could not see the photo: degraded, so unbilled.
    expect(result.meta.degraded).toBe(true);
    const json = result.json as { predictions: { foodId: string }[] };
    expect(json.predictions.length).toBeGreaterThan(0);
    for (const p of json.predictions) expect(CANDIDATES.map((c) => c.id)).toContain(p.foodId);
  });

  it('falls back to a degraded mock when the vision provider rejects the image', async () => {
    process.env.OPENAI_API_KEY = 'oai-key';
    stubFetch(() => response(400));

    const result = await complete('visionPrimary', VISION_MESSAGES, {
      json: true,
      images: [IMAGE],
      context: { seedKey: 'test.jpg', candidates: CANDIDATES },
    });

    expect(result.meta.provider).toBe('mock');
    expect(result.meta.degraded).toBe(true);
    expect((result.json as { predictions: unknown[] }).predictions.length).toBeGreaterThan(0);
  });

  it('still uses Groq, with plain string content, when no images are supplied', async () => {
    process.env.GROQ_API_KEY = 'groq-key';
    const { calls } = stubFetch((call) =>
      call.url.includes('groq.com')
        ? response(200, okBody(JSON.stringify({ predictions: [] })))
        : Promise.reject(new Error('offline')),
    );

    const result = await complete('visionPrimary', VISION_MESSAGES, { json: true });

    expect(result.meta.provider).toBe('groq');
    expect(typeof calls[0]!.body.messages.at(-1)!.content).toBe('string');
  });

  it('accepts a vision answer wrapped in preamble prose instead of retrying it', async () => {
    process.env.OPENAI_API_KEY = 'oai-key';
    const { calls } = stubFetch(() =>
      response(200, okBody('Here is the JSON:\n{"predictions":[{"foodId":"food-rice","estimatedGrams":180,"confidence":0.8}]}')),
    );

    const result = await complete('visionPrimary', VISION_MESSAGES, { json: true, images: [IMAGE] });

    expect(calls).toHaveLength(1);
    expect(result.meta.provider).toBe('openai');
    expect(result.json).toEqual({ predictions: [{ foodId: 'food-rice', estimatedGrams: 180, confidence: 0.8 }] });
  });
});
