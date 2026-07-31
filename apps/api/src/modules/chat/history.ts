/**
 * Conversation-history replay for the streaming turn (AQF-07 §3.4). Prior
 * ChatMessage docs already persist in the `ai` container; this module turns
 * them into gateway messages so the coach is no longer stateless.
 *
 * Budget (shared constants): at most CHAT_HISTORY_MAX_TURNS user/assistant
 * exchanges (2 messages per turn) and CHAT_HISTORY_MAX_CHARS total content
 * characters, truncated OLDEST-first — the most recent exchanges are the ones
 * that matter for continuity, and prompt cost stays bounded for long sessions.
 *
 * Guardrail-blocked messages (blocked inputs AND the refusal replies that
 * answered them) are excluded: refused content must never re-enter model
 * context on a later turn (AQF-11 §3).
 */
import { CHAT_HISTORY_MAX_TURNS, CHAT_HISTORY_MAX_CHARS } from '@aquazerofit/shared';
import type { ChatMessage } from '@aquazerofit/shared';
import type { GatewayMessage } from '../ai/gateway';

/**
 * Build the replayable history from a session's prior messages (the current
 * user message must NOT be included — the router appends it separately).
 * Input order does not matter; output is chronological.
 */
export function buildHistoryMessages(prior: ChatMessage[]): GatewayMessage[] {
  const eligible = prior
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        m.guardrail?.blocked !== true &&
        typeof m.content === 'string' &&
        m.content.length > 0,
    )
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  // Newest CHAT_HISTORY_MAX_TURNS exchanges (a turn ≈ user + assistant).
  let kept = eligible.slice(-CHAT_HISTORY_MAX_TURNS * 2);

  // Char budget: drop the oldest message until the total fits.
  let total = kept.reduce((s, m) => s + m.content.length, 0);
  while (kept.length > 0 && total > CHAT_HISTORY_MAX_CHARS) {
    total -= (kept[0] as ChatMessage).content.length;
    kept = kept.slice(1);
  }

  return kept.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
}
