/**
 * The real-provider half of the AI gateway: which providers exist, which
 * model each runs per lane, the per-lane deadlines, and how one attempt
 * against one provider is made, classified, retried and circuit-broken.
 *
 * Split out of gateway.ts so that file stays about routing: the walk down the
 * chain, the shared deadline, the offline fallback and the degraded verdict.
 * Nothing here knows about the offline engine or about billing, and nothing in
 * gateway.ts builds an HTTP request. The onboarding checklist in gateway.ts's
 * header still governs every change to PROVIDERS below.
 */
import type { ModelGroup } from '@aquazerofit/shared';
import type { GatewayOptions, WireMessage } from './gateway';

export interface ProviderDef {
  name: string;
  baseUrl: string;
  /** Optional env var name that overrides baseUrl at runtime. */
  baseUrlEnv?: string;
  keyEnv: string;
  /** If true, the key is optional (e.g. local Ollama needs no auth). */
  keyOptional?: boolean;
  /**
   * True when the provider's visionPrimary model accepts image_url content
   * parts. Providers without it are skipped when the caller supplies
   * opts.images, so a text-only model never answers 400 to a meal photo.
   */
  supportsVision?: boolean;
  models: Record<ModelGroup, string>;
}

export const PROVIDERS: ProviderDef[] = [
  {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    // Vision default is qwen/qwen3.8-27b, listed on
    // https://console.groq.com/docs/vision (checked 2026-10-24) and on the
    // supported-models page. meta-llama/llama-4-scout-17b-16e-instruct was
    // shut down on 2026-07-17 and is not offered. meta-models/muse-spark-open
    // also accepts images but only as a limited preview, so it is not the
    // default. Override with GROQ_MODEL_VISIONPRIMARY.
    supportsVision: true,
    models: {
      visionPrimary: 'qwen/qwen3.8-27b',
      chatFast: 'qwen/qwen3.8-27b',
      planStructured: 'qwen/qwen3.8-27b',
      safetyCheap: 'openai/gpt-oss-20b',
      insightBatch: 'qwen/qwen3.8-27b',
    },
  },
  {
    name: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyEnv: 'OPENAI_API_KEY',
    supportsVision: true, // gpt-4o-mini
    models: {
      visionPrimary: 'gpt-4o-mini',
      chatFast: 'gpt-4o-mini',
      planStructured: 'gpt-4o',
      safetyCheap: 'gpt-4o-mini',
      insightBatch: 'gpt-4o-mini',
    },
  },
  {
    name: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    supportsVision: true, // gemini flash
    models: {
      // Stable aliases: Google retires pinned model ids (2.0-flash 404s now),
      // the *-latest aliases always resolve to the current flash generation.
      visionPrimary: 'gemini-flash-latest',
      chatFast: 'gemini-flash-latest',
      planStructured: 'gemini-flash-latest',
      safetyCheap: 'gemini-flash-lite-latest',
      insightBatch: 'gemini-flash-latest',
    },
  },
  {
    name: 'nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    baseUrlEnv: 'NVIDIA_BASE_URL',
    keyEnv: 'NVIDIA_API_KEY',
    supportsVision: true, // llama-3.2-11b-vision-instruct
    models: {
      visionPrimary: 'meta/llama-3.2-11b-vision-instruct',
      chatFast: 'meta/llama-3.2-11b-vision-instruct',
      planStructured: 'meta/llama-3.2-11b-vision-instruct',
      safetyCheap: 'meta/llama-3.2-11b-vision-instruct',
      insightBatch: 'meta/llama-3.2-11b-vision-instruct',
    },
  },
  {
    name: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    baseUrlEnv: 'OLLAMA_BASE_URL',
    keyEnv: 'OLLAMA_API_KEY',
    keyOptional: true,
    supportsVision: true, // llava
    models: {
      visionPrimary: 'llava',
      chatFast: 'llama3.1',
      planStructured: 'llama3.1',
      safetyCheap: 'llama3.1',
      insightBatch: 'llama3.1',
    },
  },
];

/**
 * Is this provider a configured dependency? Its key is set, or, for a
 * key-optional provider, its base URL is: a self-hosted Ollama named by
 * OLLAMA_BASE_URL is as real as a keyed API. A key-optional provider with
 * neither is the opportunistic localhost probe and does not count.
 *
 * The single answer for both provider loops and the boot warning, so what
 * gets retried, what marks a fallback degraded and what the warning calls
 * "configured" cannot drift apart.
 */
export function isConfigured(provider: ProviderDef): boolean {
  if (process.env[provider.keyEnv]) return true;
  return !!provider.keyOptional && !!provider.baseUrlEnv && !!process.env[provider.baseUrlEnv]?.trim();
}

export function modelFor(provider: ProviderDef, task: ModelGroup): string {
  const specificEnv = `${provider.name.toUpperCase()}_MODEL_${task.toUpperCase()}`;
  const generalEnv = `${provider.name.toUpperCase()}_MODEL`;
  return process.env[specificEnv]?.trim() || process.env[generalEnv]?.trim() || provider.models[task];
}

export const DEFAULT_TIMEOUT_MS = 20_000;
/**
 * Ceiling for chat, plans, and every lane that is not a meal photo. Callers
 * may only tighten it. A photo has its own ceiling so a vision hop can run
 * past this without stretching the chat socket.
 */
export const CHAT_DEADLINE_MS = 12_000;
/** Vision ceiling when AI_VISION_DEADLINE_MS is unset. */
export const DEFAULT_VISION_DEADLINE_MS = 20_000;
export const VISION_DEADLINE_ENV = 'AI_VISION_DEADLINE_MS';
const VISION_DEADLINE_MIN_MS = 1_000;
const VISION_DEADLINE_MAX_MS = 60_000;
/** Shorter than this and the attempt is not worth opening a socket. */
export const MIN_ATTEMPT_MS = 50;

export function visionDeadlineMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[VISION_DEADLINE_ENV]?.trim();
  if (!raw) return DEFAULT_VISION_DEADLINE_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_VISION_DEADLINE_MS;
  return Math.min(VISION_DEADLINE_MAX_MS, Math.max(VISION_DEADLINE_MIN_MS, Math.floor(parsed)));
}

/** Chat stays at 12s. visionPrimary uses the configurable photo deadline. */
export function deadlineCeilingMs(task: ModelGroup, env: NodeJS.ProcessEnv = process.env): number {
  return task === 'visionPrimary' ? visionDeadlineMs(env) : CHAT_DEADLINE_MS;
}

/**
 * Time held back for the next configured vision provider, so a Groq timeout
 * still leaves NVIDIA a full attempt inside the photo deadline.
 */
export function visionHopBudgetMs(deadlineMs: number): number {
  return Math.max(VISION_DEADLINE_MIN_MS, Math.floor(deadlineMs / 2));
}
/** Attempts after the first, per provider, for transient failures only. */
export const MAX_RETRIES_PER_PROVIDER = 2;
const BACKOFF_BASE_MS = 200;
/** A provider that fails this many calls in a row is skipped for a cooldown. */
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 60_000;
/** Hard ceiling on completion length: max_tokens is caller-supplied and bills. */
const MAX_OUTPUT_TOKENS = 4_096;
const DEFAULT_OUTPUT_TOKENS = 1_024;

/** Per ModelGroup maxTokens configuration (AI-03) */
const MODEL_GROUP_MAX_TOKENS: Record<ModelGroup, number> = {
  visionPrimary: 1024,
  chatFast: 512,
  planStructured: 4096,
  safetyCheap: 256,
  insightBatch: 2048,
};

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Carries the retry decision alongside the message so the chain can act on it. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** Server-directed wait from Retry-After, when the provider sent one. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Retry-After is either delta-seconds or an HTTP-date. Anything unparseable is
 * ignored rather than guessed at — a wrong wait is worse than the default.
 */
export function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return undefined;
}

/**
 * Equal jitter: half the exponential window plus a random half. The floor keeps
 * a genuine gap between attempts, the jitter keeps concurrent callers from
 * re-hitting a struggling provider in lockstep.
 */
export function backoffDelayMs(attempt: number): number {
  const window = BACKOFF_BASE_MS * 2 ** (attempt - 1);
  return Math.round(window / 2 + Math.random() * (window / 2));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number;
}

const circuits = new Map<string, CircuitState>();

export function circuitIsOpen(name: string): boolean {
  const state = circuits.get(name);
  return !!state && state.openUntil > Date.now();
}

export function recordProviderFailure(name: string): void {
  const state = circuits.get(name) ?? { consecutiveFailures: 0, openUntil: 0 };
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + CIRCUIT_OPEN_MS;
    // Reset the counter so the provider gets a clean set of chances once the
    // cooldown lapses rather than re-opening on its first stumble.
    state.consecutiveFailures = 0;
  }
  circuits.set(name, state);
}

export function recordProviderSuccess(name: string): void {
  circuits.delete(name);
}

/** Test/ops hook: drops all breaker state so a run starts from a clean slate. */
export function resetProviderCircuits(): void {
  circuits.clear();
}

/**
 * Pull the JSON object out of a provider response. Some providers (Gemini in
 * particular) add prose or a markdown fence even in json_object mode, so the
 * candidates run strictest first: the whole text, the text with a fence
 * stripped, then the span from the first `{` to the last `}`. Throws a
 * SyntaxError when none parses, so the caller counts it as a failed attempt.
 * Exported for tests.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim(),
    first !== -1 && last > first ? trimmed.slice(first, last + 1) : '',
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next, more permissive candidate */
    }
  }
  throw new SyntaxError('extractJson: no valid JSON object found in provider response');
}

interface OpenAiCompletion {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
}

export async function callProvider(
  provider: ProviderDef,
  task: ModelGroup,
  messages: WireMessage[],
  opts: GatewayOptions,
  /** Time this single attempt may take: the lesser of its timeout and what is left of the deadline. */
  budgetMs: number,
): Promise<{ text: string; json?: unknown; tokens: number; model: string }> {
  const key = process.env[provider.keyEnv];
  if (!key && !provider.keyOptional) throw new ProviderError(`missing ${provider.keyEnv}`, false);
  const baseUrl = (provider.baseUrlEnv && process.env[provider.baseUrlEnv]) || provider.baseUrl;
  const model = modelFor(provider, task);
  const controller = new AbortController();
  // AbortController rather than a race, so a timed-out request is actually
  // cancelled instead of left running against a socket nobody reads.
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: clampMaxTokens(opts.maxTokens, task),
    };
    if (opts.json) body.response_format = { type: 'json_object' };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Rate limits and server faults are the provider's problem and pass; a
      // 4xx is ours (bad key, bad model, bad payload) and will fail identically
      // on every retry, so it must not burn the deadline.
      const retryable = res.status === 429 || res.status >= 500;
      const retryAfterMs = parseRetryAfter(res.headers?.get?.('retry-after'));
      throw new ProviderError(`${provider.name} responded ${res.status}`, retryable, retryAfterMs);
    }
    const data = (await res.json()) as OpenAiCompletion;
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.length === 0) {
      throw new ProviderError(`${provider.name} returned an empty completion`, true);
    }
    // Parsed here so malformed JSON counts as a failed attempt and is retried —
    // a re-roll of the same prompt usually comes back well-formed.
    let json: unknown;
    if (opts.json) {
      try {
        json = extractJson(text);
      } catch {
        // Enough of the raw text to tell a safety refusal from prose from a
        // schema mismatch, without logging a whole completion.
        console.warn(`[ai-gateway] ${provider.name} returned unparseable JSON (first 300 chars):`, text.slice(0, 300));
        throw new ProviderError(`${provider.name} returned unparseable JSON`, true);
      }
    }
    return { text, json, tokens: data.usage?.total_tokens ?? estimateTokens(text), model };
  } finally {
    clearTimeout(timer);
  }
}

export function clampMaxTokens(requested: number | undefined, task: ModelGroup): number {
  const defaultForTask = MODEL_GROUP_MAX_TOKENS[task] ?? DEFAULT_OUTPUT_TOKENS;
  const wanted = requested ?? defaultForTask;
  if (!Number.isFinite(wanted)) return defaultForTask;
  return Math.max(1, Math.min(Math.floor(wanted), MAX_OUTPUT_TOKENS));
}

/**
 * Aborts and transport faults are transient by nature; a ProviderError already
 * carries its own verdict.
 */
export function classify(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const message = err instanceof Error ? err.message : 'unknown provider error';
  return new ProviderError(message, true);
}
