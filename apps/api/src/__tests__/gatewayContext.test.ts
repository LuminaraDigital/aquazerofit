/**
 * Gateway context delivery (the core personalisation fix): opts.context must
 * reach REAL providers as a delimited system-role message, not just the mock.
 * The provider is stubbed at the fetch seam so we can assert on the exact
 * messages array the gateway puts on the wire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { complete, withContextMessage, type GatewayMessage } from '../modules/ai/gateway';

const PROVIDER_ENV = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY', 'OLLAMA_API_KEY'];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of PROVIDER_ENV) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of PROVIDER_ENV) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

const BASE_MESSAGES: GatewayMessage[] = [
  { role: 'system', content: 'You are Aqua Coach.' },
  { role: 'user', content: 'How am I doing today?' },
];

describe('withContextMessage (message builder)', () => {
  it('inserts a delimited system context block after the leading system prompt', () => {
    const out = withContextMessage(BASE_MESSAGES, { nutrition: { kcalRemaining: 450 } });
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual(BASE_MESSAGES[0]);
    expect(out[1]!.role).toBe('system');
    expect(out[1]!.content).toContain('USER CONTEXT');
    expect(out[1]!.content).toContain('"kcalRemaining": 450');
    expect(out[2]).toEqual(BASE_MESSAGES[1]);
  });

  it('places the block before replayed history but after the system prompt', () => {
    const withHistory: GatewayMessage[] = [
      BASE_MESSAGES[0]!,
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
      BASE_MESSAGES[1]!,
    ];
    const out = withContextMessage(withHistory, { plan: { name: 'Base Strength' } });
    expect(out.map((m) => m.role)).toEqual(['system', 'system', 'user', 'assistant', 'user']);
  });

  it('returns the messages untouched when there is no context', () => {
    expect(withContextMessage(BASE_MESSAGES, undefined)).toBe(BASE_MESSAGES);
    expect(withContextMessage(BASE_MESSAGES, {})).toBe(BASE_MESSAGES);
  });
});

describe('complete() with a real (stubbed) provider', () => {
  function stubProvider(): { calls: { url: string; body: Record<string, unknown> }[] } {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url: String(url), body: JSON.parse(init.body) as Record<string, unknown> });
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Grounded reply.' } }],
            usage: { total_tokens: 42 },
          }),
        };
      }),
    );
    return { calls };
  }

  it('sends opts.context to the provider as a system message (the audited bug)', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubProvider();

    const context = {
      userName: 'Sam',
      nutrition: { kcalTarget: 1900, kcalConsumed: 1450, kcalRemaining: 450 },
      memory: { summary: 'Vegetarian.', confirmedFacts: ['Is vegetarian'] },
    };
    const result = await complete('chatFast', BASE_MESSAGES, { context, promptId: 'P-07' });

    expect(result.meta.provider).toBe('groq');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('api.groq.com');
    const sent = calls[0]!.body.messages as GatewayMessage[];
    expect(sent).toHaveLength(3);
    expect(sent[0]!.role).toBe('system');
    expect(sent[0]!.content).toBe('You are Aqua Coach.');
    expect(sent[1]!.role).toBe('system');
    expect(sent[1]!.content).toContain('USER CONTEXT');
    expect(sent[1]!.content).toContain('"kcalRemaining": 450');
    expect(sent[1]!.content).toContain('Is vegetarian');
    expect(sent[2]).toEqual({ role: 'user', content: 'How am I doing today?' });
  });

  it('sends the raw messages when no context was supplied', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubProvider();
    await complete('chatFast', BASE_MESSAGES, {});
    expect((calls[0]!.body.messages as GatewayMessage[])).toEqual(BASE_MESSAGES);
  });
});

describe('complete() mock terminal fallback', () => {
  it('still grounds the deterministic mock in the same context (no keys set)', async () => {
    // No provider env keys; stub fetch to reject so the keyless Ollama attempt
    // fails fast and the chain lands on the mock.
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    const result = await complete('chatFast', BASE_MESSAGES, {
      context: { nutrition: { kcalTarget: 1900, kcalConsumed: 1450, kcalRemaining: 450, proteinG: { consumed: 82, target: 120 }, carbsG: { consumed: 0, target: 200 }, fatG: { consumed: 0, target: 60 }, waterMl: { consumed: 500, target: 2000 }, mealsLogged: 2 } },
    });
    expect(result.meta.provider).toBe('mock');
    expect(result.text).toContain('1450');
  });
});
