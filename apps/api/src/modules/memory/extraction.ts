/**
 * Post-turn memory extraction + rolling-summary refresh (memory feature
 * Phase 2). Fired-and-forgotten by the chat router AFTER a successful,
 * non-blocked coach turn — it must never delay or fail the SSE response
 * (same best-effort stance as the guardrails audit write).
 *
 * Lane choice: safetyCheap. Extraction is a tiny classification/extraction
 * task with a strict-JSON contract — the 8B-class cheap models are ample, and
 * every chat turn triggers it, so it must cost as little as possible
 * (chatFast would spend a 70B-class call per turn for no quality gain).
 *
 * Consent: gated on aiPersonalisation at entry, and defence-in-depth inside
 * getMemoryForPrompt/addFact paths. Extracted facts are stored as `suggested`
 * — the user approves or rejects them in the UI; nothing here auto-confirms.
 */
import { z } from 'zod';
import {
  MEMORY_EXTRACTION_MAX_FACTS_PER_TURN,
  MEMORY_FACT_CATEGORIES,
  MEMORY_FACT_MAX_CHARS,
  MEMORY_SUMMARY_MAX_CHARS,
  MEMORY_SUMMARY_MIN_FACTS,
  MEMORY_SUMMARY_REFRESH_FACT_DELTA,
} from '@aquazerofit/shared';
import { complete } from '../ai/gateway';
import { loadPrompt } from '../ai/prompts';
import { hasConsent } from '../me/service';
import { getStore } from '../../platform/store';
import { addFact, memoryId, setSummary, type MemoryDoc } from './service';

/** zod at the boundary: the model's JSON is untrusted input like any other. */
const extractionSchema = z.object({
  facts: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(MEMORY_FACT_MAX_CHARS),
        category: z.enum(MEMORY_FACT_CATEGORIES),
      }),
    )
    .max(50), // sanity bound before the per-turn cap is applied
});

export interface TurnForExtraction {
  /** ChatMessage id of the USER message — recorded as the fact's source refId. */
  userMessageId: string;
  userMessage: string;
  assistantReply: string;
}

/**
 * Extract durable facts from one successful coach turn and stage them as
 * suggestions. Swallows every failure (parse, provider, validation) — a
 * missed memory is acceptable; a broken chat turn is not.
 */
export async function extractMemoryFromTurn(userId: string, turn: TurnForExtraction): Promise<void> {
  if (!hasConsent(userId, 'aiPersonalisation')) return;

  let parsed: z.infer<typeof extractionSchema>;
  try {
    const prompt = loadPrompt('P-10');
    const result = await complete(
      'safetyCheap',
      [
        { role: 'system', content: prompt.content },
        {
          role: 'user',
          content: `User message:\n${turn.userMessage}\n\nCoach reply:\n${turn.assistantReply}`,
        },
      ],
      {
        json: true,
        promptId: 'P-10',
        temperature: 0,
        // Grounds the deterministic mock (and mirrors the payload for eval runs).
        context: { userMessage: turn.userMessage, assistantReply: turn.assistantReply },
      },
    );
    const check = extractionSchema.safeParse(result.json);
    if (!check.success) {
      console.warn('[memory-extraction] response failed schema; skipping turn', userId);
      return;
    }
    parsed = check.data;
  } catch (err) {
    // JSON-mode parse failures surface here (gateway treats them as provider
    // errors and can land on AI_UNAVAILABLE) — skip silently, log only.
    console.warn('[memory-extraction] extraction call failed; skipping turn', err instanceof Error ? err.message : err);
    return;
  }

  // Consent re-check after the awaited model call: the user may have revoked
  // aiPersonalisation while the extraction request was in flight, and no
  // memory write may happen past a revocation.
  if (!hasConsent(userId, 'aiPersonalisation')) return;

  for (const fact of parsed.facts.slice(0, MEMORY_EXTRACTION_MAX_FACTS_PER_TURN)) {
    try {
      addFact(userId, {
        text: fact.text,
        category: fact.category,
        status: 'suggested',
        source: { kind: 'chat', refId: turn.userMessageId },
      });
    } catch (err) {
      // One bad fact never blocks the rest.
      console.warn('[memory-extraction] addFact rejected a fact', err instanceof Error ? err.message : err);
    }
  }

  await maybeRefreshSummary(userId);
}

/**
 * Regenerate the rolling summary when it has drifted from the confirmed facts:
 * confirmed count moved ≥ MEMORY_SUMMARY_REFRESH_FACT_DELTA since the last
 * summary write, OR summary empty with ≥ MEMORY_SUMMARY_MIN_FACTS confirmed.
 * Same lane, same consent gate, same best-effort stance.
 */
export async function maybeRefreshSummary(userId: string): Promise<void> {
  if (!hasConsent(userId, 'aiPersonalisation')) return;
  // Read-only probe: never lazy-create a doc just to decide "nothing to do".
  const memory = getStore().byId<MemoryDoc>('ai', memoryId(userId));
  if (!memory) return;

  const confirmed = memory.facts.filter((f) => f.status === 'confirmed').map((f) => f.text);
  const baseline = memory.factsAtLastSummary ?? 0;
  const drifted = Math.abs(confirmed.length - baseline) >= MEMORY_SUMMARY_REFRESH_FACT_DELTA;
  const bootstrap = memory.summary.length === 0 && confirmed.length >= MEMORY_SUMMARY_MIN_FACTS;
  if (!drifted && !bootstrap) return;

  // Doc version at read time: if any write lands while the summary call is in
  // flight (most importantly DELETE /me/memory — a wipe must never be
  // resurrected by a summary of pre-wipe facts), the refresh is discarded.
  const versionAtRead = memory.version;

  try {
    const prompt = loadPrompt('P-11');
    const result = await complete(
      'safetyCheap',
      [
        { role: 'system', content: prompt.content },
        {
          role: 'user',
          content: `Current summary:\n${memory.summary || '(empty)'}\n\nConfirmed facts:\n${confirmed
            .map((f) => `- ${f}`)
            .join('\n')}`,
        },
      ],
      {
        promptId: 'P-11',
        temperature: 0.2,
        context: { summary: memory.summary, confirmedFacts: confirmed },
      },
    );
    const text = result.text.trim().slice(0, MEMORY_SUMMARY_MAX_CHARS);
    if (text.length === 0) return;
    // Post-await guards: consent may have been revoked and the doc may have
    // been written (wiped, edited) while the model call was in flight — in
    // either case this stale summary must be discarded, not persisted.
    if (!hasConsent(userId, 'aiPersonalisation')) return;
    const latest = getStore().byId<MemoryDoc>('ai', memoryId(userId));
    if (!latest || latest.version !== versionAtRead) return;
    setSummary(userId, text); // records factsAtLastSummary for the next trigger check
  } catch (err) {
    console.warn('[memory-extraction] summary refresh failed', err instanceof Error ? err.message : err);
  }
}
