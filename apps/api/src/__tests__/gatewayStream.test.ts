/**
 * The streaming lane (gateway.stream), which chat bills through. It walks the
 * same provider chain as complete(), so these pin what a caller observes:
 * the tokens it yields, the request it sends, which failures it retries, and
 * the `degraded` verdict on the result it returns.
 *
 * Providers are stubbed at the fetch seam, as in aiResilience.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetProviderCircuits, stream, type GatewayMessage, type GatewayResult } from '../modules/ai/gateway';

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
});

const MESSAGES: GatewayMessage[] = [
  { role: 'system', content: 'You are Aqua Coach.' },
  { role: 'user', content: 'How am I doing today?' },
];

interface StubCall {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** An SSE response whose body arrives as the given chunks. */
function sse(chunks: string[]) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  };
}

const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

function failure(status: number) {
  return { ok: false, status, headers: { get: () => null } };
}

function stubFetch(handler: (call: StubCall) => unknown): { calls: StubCall[] } {
  const calls: StubCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
      const call = { url: String(url), headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> };
      calls.push(call);
      return handler(call);
    }),
  );
  return { calls };
}

const groqCalls = (calls: StubCall[]): StubCall[] => calls.filter((c) => c.url.includes('groq.com'));

/** Drive the generator by hand: for-await would discard the GatewayResult. */
async function drain(iterator: AsyncGenerator<string, GatewayResult>): Promise<{ tokens: string[]; result: GatewayResult }> {
  const tokens: string[] = [];
  for (;;) {
    const step = await iterator.next();
    if (step.done) return { tokens, result: step.value };
    tokens.push(step.value);
  }
}

describe('stream from a real provider', () => {
  it('yields each delta in order and returns the joined text as an undegraded answer', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubFetch(() => sse([delta('Hel'), `${delta('lo')}data: [DONE]\n\n`]));
    const onToken = vi.fn();
    const onComplete = vi.fn();

    const { tokens, result } = await drain(stream('chatFast', MESSAGES, { onToken, onComplete }));

    expect(tokens).toEqual(['Hel', 'lo']);
    expect(onToken.mock.calls.map(([token]) => token)).toEqual(['Hel', 'lo']);
    expect(onComplete).toHaveBeenCalledWith('Hello');
    expect(result.text).toBe('Hello');
    expect(result.json).toBeUndefined();
    expect(result.meta.provider).toBe('groq');
    expect(result.meta.model).toBe('qwen/qwen3.8-27b');
    expect(result.meta.degraded).toBe(false);
    expect(groqCalls(calls)).toHaveLength(1);
  });

  it('asks for a stream, sends the context block, and authenticates with the key', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubFetch(() => sse([delta('ok')]));

    await drain(stream('chatFast', MESSAGES, { context: { nutrition: { kcalRemaining: 450 } } }));

    const [call] = groqCalls(calls);
    expect(call!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(call!.headers.Authorization).toBe('Bearer test-key');
    expect(call!.body.stream).toBe(true);
    expect(call!.body.max_tokens).toBe(512);
    const messages = call!.body.messages as GatewayMessage[];
    expect(messages).toHaveLength(3);
    expect(messages[1]!.role).toBe('system');
    expect(messages[1]!.content).toContain('"kcalRemaining": 450');
  });

  it('skips lines that are not data frames or do not parse', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    stubFetch(() => sse([': keep-alive\n\n', 'data: {not json}\n\n', delta('kept')]));

    const { tokens } = await drain(stream('chatFast', MESSAGES, {}));

    expect(tokens).toEqual(['kept']);
  });
});

describe('stream retries and fallback', () => {
  it('retries a 503 and streams the attempt that succeeds', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    let groqAttempts = 0;
    const { calls } = stubFetch((call) => {
      if (!call.url.includes('groq.com')) return Promise.reject(new Error('offline'));
      groqAttempts += 1;
      return groqAttempts === 1 ? failure(503) : sse([delta('Recovered.')]);
    });

    const { result } = await drain(stream('chatFast', MESSAGES, {}));

    expect(groqCalls(calls)).toHaveLength(2);
    expect(result.text).toBe('Recovered.');
    expect(result.meta.degraded).toBe(false);
  });

  it('treats a missing response body as retryable', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubFetch((call) =>
      call.url.includes('groq.com')
        ? { ok: true, status: 200, headers: { get: () => null }, body: null }
        : Promise.reject(new Error('offline')),
    );

    const { result } = await drain(stream('chatFast', MESSAGES, {}));

    expect(groqCalls(calls)).toHaveLength(3);
    expect(result.meta.provider).toBe('mock');
  });

  it('does not retry a 400, and streams the offline answer marked degraded', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubFetch((call) =>
      call.url.includes('groq.com') ? failure(400) : Promise.reject(new Error('offline')),
    );
    const onToken = vi.fn();
    const onComplete = vi.fn();

    const { tokens, result } = await drain(stream('chatFast', MESSAGES, { onToken, onComplete }));

    expect(groqCalls(calls)).toHaveLength(1);
    expect(result.meta.provider).toBe('mock');
    expect(result.meta.degraded).toBe(true);
    expect(result.meta.degradedReason).toBe('provider_failure');
    // The offline text goes out word by word, whitespace included, so the
    // pieces rebuild it exactly.
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.join('')).toBe(result.text);
    expect(onToken).toHaveBeenCalledTimes(tokens.length);
    expect(onComplete).toHaveBeenCalledWith(result.text);
  });

  it('is undegraded on the keyless development path', async () => {
    stubFetch(() => Promise.reject(new Error('offline')));

    const { result } = await drain(stream('chatFast', MESSAGES, {}));

    expect(result.meta.provider).toBe('mock');
    expect(result.meta.degraded).toBe(false);
  });

  it('marks the result deadline_exceeded when the shared deadline runs out', async () => {
    process.env.GROQ_API_KEY = 'k1';
    process.env.OPENAI_API_KEY = 'k2';
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            calls.push(String(url));
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
    );

    const { result } = await drain(stream('chatFast', MESSAGES, { deadlineMs: 200, timeoutMs: 20_000 }));

    expect(result.meta.degraded).toBe(true);
    expect(result.meta.degradedReason).toBe('deadline_exceeded');
    expect(calls).toHaveLength(1);
  });
});
