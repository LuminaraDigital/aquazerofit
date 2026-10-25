/**
 * AIGateway (AQF-09 §2.3). Application code knows only logical model groups
 * (visionPrimary, chatFast, planStructured, safetyCheap, insightBatch) — real
 * providers, fallback chains and timeouts live here and nowhere else.
 *
 * Provider chain: any OpenAI-compatible endpoint whose key is present in the
 * environment (Groq, then Gemini), each with a hard timeout; on failure the
 * chain falls through and finally lands on the deterministic mock engine so
 * every AI feature keeps working offline (AQF-10 principle 5: any AI feature
 * can fail without taking a core user journey with it).
 *
 * Resilience layer around that chain:
 *  - retries with jittered backoff for transient failures (429 / 5xx / network),
 *  - a per-provider circuit breaker so a provider that is down stops costing
 *    every subsequent request its timeout,
 *  - one overall deadline for the whole call, because the per-provider timeout
 *    multiplied by the chain length is not a latency the caller can survive
 *    (chat streams the answer over an already-open SSE socket),
 *  - a `degraded` flag on the result, because silently serving mock template
 *    text as a genuine model answer is worse than saying nothing.
 *
 * Every call — real or mock, success or failure — is logged via logAiCall.
 *
 * ADDING (OR REMOVING) A PROVIDER — onboarding checklist:
 *  1. Wire it in PROVIDERS (providerChain.ts): env key, base URL, model map
 *     per lane, timeout.
 *  2. Keep the legal disclosure in sync. The Privacy notice names the live
 *     providers via `aiProviders` in apps/web/src/pages/legal/operator.tsx —
 *     update that list for every deployment that turns the new key on.
 *  3. Re-verify each provider's data-handling terms (training-use defaults,
 *     retention, sub-processors) and set `aiProvidersVerifiedOn` in
 *     operator.tsx to the date you checked. Terms drift; an undated claim
 *     about them silently rots into a misstatement.
 *  Skipping 2–3 ships a privacy notice that misdescribes where user data
 *  goes, which is a legal defect, not a cosmetic one.
 */
import { AppError } from '../../platform/errors';
import { config } from '../../platform/config';
import { logAiCall } from '../../platform/telemetry';
import type { AiMetadata, ModelGroup } from '@aquazerofit/shared';
import { mockComplete, type MockMessage } from './providers/mock';
import { budgetExhausted, recordSuppressed } from '../../platform/aiBudget';
import { promptVersionFor, type PromptId } from './prompts';
import {
  PROVIDERS,
  anyProviderConfigured,
  callProvider,
  estimateTokens,
  modelFor,
  openProviderStream,
  sleep,
  walkChain,
  type ChainAttempt,
  type ChainMiss,
} from './providerChain';
import { validateOutputForInjection, withContextMessage } from './untrustedContext';

// Re-exported so callers and tests keep importing them from the gateway.
export {
  CHAT_DEADLINE_MS,
  DEFAULT_VISION_DEADLINE_MS,
  VISION_DEADLINE_ENV,
  deadlineCeilingMs,
  extractJson,
  resetProviderCircuits,
  visionDeadlineMs,
  visionHopBudgetMs,
} from './providerChain';

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GatewayOptions {
  /** Ask for a JSON object response and parse it. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /**
   * Budget for the whole call including every fallback hop. Callers may only
   * tighten it. Chat and the other text lanes cap at CHAT_DEADLINE_MS.
   * visionPrimary caps at the vision deadline (AI_VISION_DEADLINE_MS, default
   * 20s) so a photo can outlive the 12s chat ceiling.
   */
  deadlineMs?: number;
  /** Grounding data for the deterministic mock engine. */
  context?: Record<string, unknown>;
  /** Override the default prompt file for this lane (recorded in metadata). */
  promptId?: PromptId;
  /**
   * Selected coach persona. Real providers already carry the voice in their
   * system messages; the offline engine cannot read a prompt, so it needs the
   * id explicitly or every keyless deployment answers in one generic voice no
   * matter which character the user picked.
   */
  coachId?: string;
  /**
   * Base64 data URLs (`data:image/jpeg;base64,...`) attached to the LAST user
   * message as OpenAI-style `image_url` content parts, so vision-capable
   * providers actually receive the pixels. Only providers flagged
   * `supportsVision` are tried. The mock never sees them (it grounds on
   * opts.context), so the keyless path is unchanged.
   */
  images?: string[];
}

/** OpenAI-compatible multimodal content part (text or inline image). */
export type WireContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** What actually goes on the wire to a real provider: content may be parts. */
export interface WireMessage {
  role: GatewayMessage['role'];
  content: string | WireContentPart[];
}

/**
 * Attach images to the last user message as multimodal content parts. With no
 * user message the images are dropped rather than invented into a synthetic
 * turn — a system-only payload is a caller bug.
 */
export function withImageParts(messages: GatewayMessage[], images: string[] | undefined): WireMessage[] {
  if (!images?.length) return messages;
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  if (lastUser === -1) return messages;
  return messages.map((m, i) =>
    i === lastUser
      ? {
          role: m.role,
          content: [
            { type: 'text' as const, text: m.content },
            ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        }
      : m,
  );
}

/**
 * Why a result came from the offline engine instead of a real model.
 * `no_provider`: production with no configured provider at all, so no model
 * was ever going to answer.
 */
export type DegradedReason = 'provider_failure' | 'deadline_exceeded' | 'budget_exhausted' | 'no_provider';

/**
 * Additive extension of AiMetadata. Optional so existing callers (and the eval
 * runner's stub results) keep compiling; the gateway always sets `degraded`.
 */
export interface GatewayMeta extends AiMetadata {
  /**
   * True when the caller is holding template output from the offline engine
   * after real providers were tried and failed, or in production when none is
   * configured. False on the keyless path in development and tests, where the
   * mock IS the product. Callers that bill credits or present the text as a
   * model answer must branch on this.
   */
  degraded?: boolean;
  degradedReason?: DegradedReason;
}

export interface GatewayResult {
  text: string;
  json?: unknown;
  meta: GatewayMeta;
}

/**
 * Whether an answer the offline engine is about to give is degraded, and why.
 * One function for complete() and stream(), so the two cannot drift on what
 * the paid lanes bill.
 *
 * Budget first: past the operator's ceiling no provider was asked at all, and
 * the user must not be charged for the operator's limit.
 *
 * Production with no configured provider is degraded too. The keyless path
 * exists so development, the test suite and the eval runner work with zero
 * keys, and there the template output IS the product. A production
 * deployment sells the product as AI-powered, and every paid lane commits
 * credits for whatever is not flagged here, so a missing key used to bill
 * paying users full price for template text. Flagging it sends every lane down
 * the release path it already has for a provider outage. NODE_ENV=production
 * covers staging too, whose credits are the same product currency. The text
 * itself is untouched: only the billing verdict changes.
 *
 * Pure: the caller passes `isProduction` in, so the rule is tested as a table
 * rather than by flipping the process environment.
 */
export function offlineVerdict(state: {
  realProviderInPlay: boolean;
  budgetStopped: boolean;
  deadlineExceeded: boolean;
  isProduction: boolean;
}): { degraded: boolean; degradedReason?: DegradedReason } {
  if (state.budgetStopped) return { degraded: true, degradedReason: 'budget_exhausted' };
  if (state.realProviderInPlay) {
    return { degraded: true, degradedReason: state.deadlineExceeded ? 'deadline_exceeded' : 'provider_failure' };
  }
  if (state.isProduction) return { degraded: true, degradedReason: 'no_provider' };
  return { degraded: false };
}

/**
 * One structured line at boot when a production process has no configured AI
 * provider. Advisory, not fatal: the offline engine keeps every journey
 * working and offlineVerdict stops anything it says from being billed. But
 * from the outside that deployment looks healthy - every request succeeds,
 * every answer reads fluently - and the only symptom is that no model is
 * answering anyone, so without this line nobody finds out.
 *
 * Asks anyProviderConfigured, the same question the chain walk asks, so a
 * self-hosted Ollama named by OLLAMA_BASE_URL is not reported missing.
 * Called once, from index.ts.
 */
export function warnIfNoAiProviderConfigured(): void {
  if (!config.isProduction) return;
  if (anyProviderConfigured()) return;
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({
      t: new Date().toISOString(),
      kind: 'event',
      name: 'ai_provider_unconfigured',
      detail:
        `No AI provider is configured (${PROVIDERS.map((provider) => provider.keyEnv).join(', ')}, ` +
        'or OLLAMA_BASE_URL). ' +
        'Every AI lane answers from the offline template engine; those answers are marked degraded ' +
        '(no_provider) and are never billed.',
    }),
  );
}

/** What complete() and stream() both work out before the chain, and need after it. */
interface PreparedCall {
  task: ModelGroup;
  messages: GatewayMessage[];
  opts: GatewayOptions;
  promptVersion: string;
  /**
   * Real providers receive the grounding context as an explicit system-role
   * message; the mock keeps receiving it via MockOptions so its deterministic
   * output (seeded on raw messages + context values) is byte-identical.
   */
  providerMessages: GatewayMessage[];
  promptTokens: number;
}

function prepare(task: ModelGroup, messages: GatewayMessage[], opts: GatewayOptions): PreparedCall {
  const promptVersion = promptVersionFor(task, opts.promptId);
  const providerMessages = withContextMessage(messages, opts.context);
  const promptTokens = estimateTokens(providerMessages.map((m) => m.content).join('\n'));
  return { task, messages, opts, promptVersion, providerMessages, promptTokens };
}

/** AI-01: flag, never alter, an answer that reads like the model obeyed or leaked the context. */
function flagInjection(text: string, provider: string, model: string, task: ModelGroup): void {
  const validation = validateOutputForInjection(text);
  if (!validation.safe) {
    console.warn('[ai-gateway] Output validation flagged potential injection', {
      provider,
      model,
      reason: validation.reason,
      task,
    });
  }
}

/** A real provider's answer, checked and logged. Never degraded. */
function providerAnswer(
  call: PreparedCall,
  answer: { provider: string; model: string; started: number; text: string; json?: unknown; tokens: number },
): GatewayResult {
  const { provider, model, text } = answer;
  flagInjection(text, provider, model, call.task);
  logAiCall({
    provider,
    model,
    promptVersion: call.promptVersion,
    latencyMs: Date.now() - answer.started,
    tokens: { prompt: call.promptTokens, total: answer.tokens },
    guardrail: { blocked: false },
    task: call.task,
  });
  return {
    text,
    json: answer.json,
    meta: { provider, model, promptVersion: call.promptVersion, generatedAt: new Date().toISOString(), degraded: false },
  };
}

/**
 * The deterministic offline engine's answer, for complete() and stream()
 * alike: the product must work with zero keys. It is never retried and never
 * timed out, because the eval runner and test suite depend on its output
 * being byte-identical. A throw here is the one failure the gateway surfaces,
 * as AI_UNAVAILABLE.
 */
function offlineAnswer(
  { task, messages, opts, promptVersion, promptTokens }: PreparedCall,
  verdict: { degraded: boolean; degradedReason?: DegradedReason },
): GatewayResult {
  const started = Date.now();
  try {
    const result = mockComplete(task, messages as MockMessage[], {
      context: opts.context,
      promptId: opts.promptId,
      coachId: opts.coachId,
    });
    logAiCall({
      provider: 'mock',
      model: `mock-${task}`,
      promptVersion,
      latencyMs: Date.now() - started,
      tokens: { prompt: promptTokens, total: promptTokens + estimateTokens(result.text) },
      guardrail: { blocked: false },
      task,
    });
    // AI-01: Output validation for mock responses too (for consistency)
    flagInjection(result.text, 'mock', `mock-${task}`, task);
    return {
      text: result.text,
      json: result.json,
      meta: {
        provider: 'mock',
        model: `mock-${task}`,
        promptVersion,
        generatedAt: new Date().toISOString(),
        ...verdict,
      },
    };
  } catch (err) {
    logAiCall({
      provider: 'mock',
      model: `mock-${task}`,
      promptVersion,
      latencyMs: Date.now() - started,
      tokens: { prompt: promptTokens },
      task: `${task}:mockError`,
    });
    // Error hygiene: internals go to the server log only; the client-facing
    // envelope carries no err.message/cause.
    console.error('[ai-gateway] terminal fallback failed', task, err);
    throw new AppError('AI_UNAVAILABLE', 'The AI service is temporarily unavailable.', { task });
  }
}

/**
 * The provider chain for one call, then the offline engine if it produced no
 * answer. Yields whatever the attempt yields.
 *
 * The deployment-wide kill switch sits in front of the chain: past the day's
 * token budget the chain is not entered at all and the offline engine answers
 * instead — which every caller already handles, because it is the same path a
 * total provider outage takes. The app keeps working; the spending stops. Both
 * lanes come through here because chat streams over an already-open SSE
 * socket and is the highest-volume lane in the product: a budget that covered
 * only the non-streaming path would be watching the smaller half of the spend.
 */
async function* route(
  call: PreparedCall,
  hasImages: boolean,
  attempt: ChainAttempt<GatewayResult>,
): AsyncGenerator<string, { result: GatewayResult; offline: boolean }, undefined> {
  const budgetStopped = budgetExhausted();
  if (budgetStopped) recordSuppressed();
  const outcome: { answer: GatewayResult } | ChainMiss = budgetStopped
    ? { realProviderInPlay: false, deadlineExceeded: false }
    : yield* walkChain(
        {
          task: call.task,
          hasImages,
          deadlineMs: call.opts.deadlineMs,
          timeoutMs: call.opts.timeoutMs,
          onFailure: (provider, failure, latencyMs) =>
            logAiCall({
              provider: provider.name,
              model: modelFor(provider, call.task),
              promptVersion: call.promptVersion,
              latencyMs,
              tokens: { prompt: call.promptTokens },
              task: `${call.task}:providerError:${failure.message.slice(0, 80)}`,
            }),
        },
        attempt,
      );
  if ('answer' in outcome) return { result: outcome.answer, offline: false };
  const verdict = offlineVerdict({ ...outcome, budgetStopped, isProduction: config.isProduction });
  return { result: offlineAnswer(call, verdict), offline: true };
}

/**
 * Route a completion through the fallback chain for the given logical lane.
 * Never rejects for provider trouble — the mock engine is the terminal
 * fallback. Only truly unexpected internal failures surface, and callers wrap
 * those as AI_UNAVAILABLE (503) with a manual-path message.
 *
 * The whole chain shares one deadline. Chat waits at most CHAT_DEADLINE_MS.
 * A meal photo waits at most the vision deadline, which defaults higher so a
 * second provider can still run. Check `meta.degraded` before treating the
 * text as a genuine model answer.
 */
export async function complete(
  task: ModelGroup,
  messages: GatewayMessage[],
  opts: GatewayOptions = {},
): Promise<GatewayResult> {
  const call = prepare(task, messages, opts);
  // Image bytes are not counted toward prompt tokens; only the text is estimated.
  const wireMessages = withImageParts(call.providerMessages, opts.images);
  // This lane's attempts never yield, so the walk runs straight to its result.
  const walk = route(call, !!opts.images?.length, async function* (provider, budgetMs) {
    const started = Date.now();
    const { text, json, tokens, model } = await callProvider(provider, task, wireMessages, opts, budgetMs);
    return providerAnswer(call, { provider: provider.name, model, started, text, json, tokens });
  });
  let step = await walk.next();
  while (!step.done) step = await walk.next();
  return step.value.result;
}

export interface StreamOptions extends GatewayOptions {
  /** Called for each token chunk received from the stream */
  onToken?: (token: string) => void;
  /** Called when the stream completes */
  onComplete?: (text: string) => void;
  /** Called if the stream errors */
  onError?: (error: Error) => void;
}

/**
 * Stream a completion through the fallback chain using real SSE.
 * Returns an async iterable that yields token chunks; its return value is the
 * GatewayResult, `meta.degraded` included. Falls back to the mock engine if
 * all providers fail. No image parts are sent on this lane, so no provider is
 * skipped for want of vision.
 */
export async function* stream(
  task: ModelGroup,
  messages: GatewayMessage[],
  opts: StreamOptions = {},
): AsyncGenerator<string, GatewayResult, undefined> {
  const call = prepare(task, messages, opts);
  const { result, offline } = yield* route(call, false, async function* (provider, budgetMs) {
    const started = Date.now();
    let text = '';
    for await (const token of openProviderStream(provider, task, call.providerMessages, opts, budgetMs)) {
      text += token;
      opts.onToken?.(token);
      yield token;
    }
    const model = modelFor(provider, task);
    const answer = providerAnswer(call, { provider: provider.name, model, started, text, tokens: estimateTokens(text) });
    opts.onComplete?.(text);
    return answer;
  });
  if (offline) {
    // The offline engine's answer, streamed word by word so it reads the same
    // way a provider's does.
    for (const word of result.text.split(/(\s+)/).filter((w) => w.length > 0)) {
      opts.onToken?.(word);
      yield word;
      await sleep(10); // Small delay for mock streaming feel
    }
    opts.onComplete?.(result.text);
  }
  return result;
}
