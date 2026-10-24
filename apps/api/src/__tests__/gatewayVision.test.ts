/**
 * Gateway vision behaviour:
 *  1. extractJson: the strictest-first fallback that copes with providers
 *     (Gemini in particular) wrapping JSON in a fence or preamble prose.
 *  2. withImageParts: images ride on the last user message as image_url parts.
 *  3. Provider selection: a meal photo tries Groq first (qwen/qwen3.8-27b),
 *     then the rest of the vision chain. A mock answer after a configured
 *     provider fails is degraded, which is what releases the user's credit hold.
 * The provider is stubbed at the fetch seam so the wire payload is asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_DEADLINE_MS,
  complete,
  DEFAULT_VISION_DEADLINE_MS,
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
  vi.useRealTimers();
  delete process.env.AI_VISION_DEADLINE_MS;
  delete process.env.GROQ_MODEL_VISIONPRIMARY;
  resetProviderCircuits();
});

const VISION_MESSAGES: GatewayMessage[] = [
  { role: 'system', content: '# P-01 - Meal Photograph Analysis\nIdentify foods.' },
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
  it('tries Groq before OpenAI and sends the image as an image_url part', async () => {
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.OPENAI_API_KEY = 'oai-key';
    const { calls } = stubFetch((call) =>
      call.url.includes('openai.com')
        ? response(200, okBody(JSON.stringify({ items: [] })))
        : response(400, { error: 'rejected' }),
    );

    const result = await complete('visionPrimary', VISION_MESSAGES, { json: true, images: [IMAGE] });

    expect(calls.map((call) => call.url)).toEqual([
      expect.stringContaining('groq.com'),
      expect.stringContaining('openai.com'),
    ]);
    expect(calls[0]!.body.model).toBe('qwen/qwen3.8-27b');
    expect(result.meta.provider).toBe('openai');
    expect(result.meta.degraded).toBe(false);
    const messages = calls[1]!.body.messages;
    expect(messages[0]).toEqual(VISION_MESSAGES[0]);
    expect(messages.at(-1)!.content).toEqual([
      { type: 'text', text: 'Identify foods in photo test.jpg' },
      { type: 'image_url', image_url: { url: IMAGE } },
    ]);
  });

  it('orders a meal photo Groq then NVIDIA when those are the configured keys', async () => {
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.NVIDIA_API_KEY = 'nvidia-key';
    const { calls } = stubFetch((call) => {
      if (call.url.includes('nvidia.com')) {
        return response(
          200,
          okBody(JSON.stringify({ items: [{ name: 'bacon', portion: 'two rashers', estimatedGrams: 40, confidence: 0.9 }] })),
        );
      }
      return response(400, { error: 'rejected' });
    });

    const result = await complete('visionPrimary', VISION_MESSAGES, { json: true, images: [IMAGE] });

    expect(calls.map((call) => new URL(call.url).host)).toEqual(['api.groq.com', 'integrate.api.nvidia.com']);
    expect(calls[0]!.body.model).toBe('qwen/qwen3.8-27b');
    expect(calls[1]!.body.model).toBe('meta/llama-3.2-11b-vision-instruct');
    expect(result.meta.provider).toBe('nvidia');
    expect(result.meta.degraded).toBe(false);
  });

  it('falls through to a degraded mock when Groq is the only key and it rejects the photo', async () => {
    process.env.GROQ_API_KEY = 'groq-key';
    // 400 is terminal, so Groq is one call. The key-optional Ollama probe may
    // follow; reject that too so the terminal answer is the mock.
    const { calls } = stubFetch(() => response(400));

    const result = await complete('visionPrimary', VISION_MESSAGES, {
      json: true,
      images: [IMAGE],
      context: { seedKey: 'test.jpg', candidates: CANDIDATES },
    });

    expect(calls.filter((call) => call.url.includes('groq.com')).length).toBeGreaterThan(0);
    expect(calls[0]!.body.model).toBe('qwen/qwen3.8-27b');
    expect(result.meta.provider).toBe('mock');
    // A real key was present but could not see the photo: degraded, so unbilled.
    expect(result.meta.degraded).toBe(true);
    const json = result.json as { items: { name: string }[] };
    expect(json.items.length).toBeGreaterThan(0);
    for (const item of json.items) expect(CANDIDATES.map((c) => c.name)).toContain(item.name);
    expect(json).not.toHaveProperty('predictions');
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
    expect((result.json as { items: unknown[] }).items.length).toBeGreaterThan(0);
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

function hangUntilAbort(url: string, init: { signal: AbortSignal }): Promise<never> {
  return new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error(`aborted ${url}`)));
  });
}

describe('lane deadlines', () => {
  it('keeps chat at 12s even when the caller asks for longer', async () => {
    vi.useFakeTimers();
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.OPENAI_API_KEY = 'oai-key';
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: { signal: AbortSignal }) => hangUntilAbort(String(url), init)),
    );

    const pending = complete('chatFast', VISION_MESSAGES, { deadlineMs: 30_000, timeoutMs: 60_000 });
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.advanceTimersByTimeAsync(CHAT_DEADLINE_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result.meta.provider).toBe('mock');
    expect(result.meta.degraded).toBe(true);
    expect(result.meta.degradedReason).toBe('deadline_exceeded');
  });

  it('lets a meal photo run past 12s and stop at the vision deadline', async () => {
    vi.useFakeTimers();
    process.env.GROQ_API_KEY = 'groq-key';
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: { signal: AbortSignal }) => hangUntilAbort(String(url), init)),
    );

    const pending = complete('visionPrimary', VISION_MESSAGES, {
      json: true,
      images: [IMAGE],
      deadlineMs: 30_000,
      timeoutMs: 60_000,
    });
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.advanceTimersByTimeAsync(CHAT_DEADLINE_MS);
    expect(settled).toBe(false);
    expect(DEFAULT_VISION_DEADLINE_MS).toBeGreaterThan(CHAT_DEADLINE_MS);

    await vi.advanceTimersByTimeAsync(DEFAULT_VISION_DEADLINE_MS - CHAT_DEADLINE_MS);
    const result = await pending;
    expect(result.meta.provider).toBe('mock');
    expect(result.meta.degraded).toBe(true);
    expect(result.meta.degradedReason).toBe('deadline_exceeded');
  });

  it('reads AI_VISION_DEADLINE_MS and still reserves a hop for NVIDIA', async () => {
    vi.useFakeTimers();
    process.env.AI_VISION_DEADLINE_MS = '20000';
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.NVIDIA_API_KEY = 'nvidia-key';
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: { body: string; signal: AbortSignal }) => {
        const target = String(url);
        calls.push(target);
        if (target.includes('groq.com')) return hangUntilAbort(target, init);
        return Promise.resolve(
          response(200, okBody(JSON.stringify({ items: [{ name: 'bacon', portion: 'two rashers', estimatedGrams: 40, confidence: 0.9 }] }))),
        );
      }),
    );

    const pending = complete('visionPrimary', VISION_MESSAGES, {
      json: true,
      images: [IMAGE],
      timeoutMs: 60_000,
    });
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    // Half the photo budget is held for NVIDIA, so Groq must already have
    // yielded before the old shared 12s chat cap would have killed the lane.
    await vi.advanceTimersByTimeAsync(CHAT_DEADLINE_MS);
    const result = await pending;
    expect(settled).toBe(true);
    expect(result.meta.provider).toBe('nvidia');
    expect(result.meta.degraded).toBe(false);
    expect(calls[0]).toContain('groq.com');
    expect(calls.some((url) => url.includes('nvidia.com'))).toBe(true);
    expect(calls.filter((url) => url.includes('groq.com'))).toHaveLength(1);
  });
});
