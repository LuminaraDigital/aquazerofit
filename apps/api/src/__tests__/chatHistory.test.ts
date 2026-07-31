/**
 * Chat history replay budget (AQF-07 §3.4): buildHistoryMessages must produce
 * chronological user/assistant messages, exclude guardrail-blocked content,
 * and truncate oldest-first against both the turn and character budgets.
 */
import { describe, expect, it } from 'vitest';
import { CHAT_HISTORY_MAX_CHARS, CHAT_HISTORY_MAX_TURNS } from '@aquazerofit/shared';
import type { ChatMessage } from '@aquazerofit/shared';
import { buildHistoryMessages } from '../modules/chat/history';

let seq = 0;
function msg(
  role: ChatMessage['role'],
  content: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  seq += 1;
  return {
    id: `cm_${seq}`,
    sessionId: 'cs_1',
    userId: 'u_1',
    type: 'chatMessage',
    role,
    content,
    guardrail: { blocked: false, category: null },
    createdAt: new Date(1_700_000_000_000 + seq * 1000).toISOString(),
    ...overrides,
  };
}

describe('buildHistoryMessages', () => {
  it('returns chronological user/assistant pairs in gateway shape', () => {
    const out = buildHistoryMessages([
      msg('assistant', 'answer one'),
      msg('user', 'question two'),
    ].reverse()); // input order must not matter
    expect(out).toEqual([
      { role: 'assistant', content: 'answer one' },
      { role: 'user', content: 'question two' },
    ]);
  });

  it('excludes guardrail-blocked messages (both the input and the refusal)', () => {
    const out = buildHistoryMessages([
      msg('user', 'safe question'),
      msg('assistant', 'safe answer'),
      msg('user', 'blocked question', { guardrail: { blocked: true, category: 'medical' } }),
      msg('assistant', 'refusal copy', { guardrail: { blocked: true, category: 'medical' } }),
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'safe question' },
      { role: 'assistant', content: 'safe answer' },
    ]);
  });

  it('keeps only the newest CHAT_HISTORY_MAX_TURNS exchanges, dropping oldest', () => {
    const prior: ChatMessage[] = [];
    for (let i = 0; i < CHAT_HISTORY_MAX_TURNS + 4; i += 1) {
      prior.push(msg('user', `q${i}`), msg('assistant', `a${i}`));
    }
    const out = buildHistoryMessages(prior);
    expect(out).toHaveLength(CHAT_HISTORY_MAX_TURNS * 2);
    expect(out[0]).toEqual({ role: 'user', content: 'q4' }); // 0..3 dropped
    expect(out[out.length - 1]).toEqual({
      role: 'assistant',
      content: `a${CHAT_HISTORY_MAX_TURNS + 3}`,
    });
  });

  it('truncates oldest-first to stay within CHAT_HISTORY_MAX_CHARS', () => {
    const big = 'x'.repeat(2500);
    const out = buildHistoryMessages([
      msg('user', big),
      msg('assistant', big),
      msg('user', big),
      msg('assistant', 'recent short answer'),
    ]);
    const total = out.reduce((s, m) => s + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(CHAT_HISTORY_MAX_CHARS);
    // Oldest dropped; the most recent messages survive.
    expect(out[out.length - 1]).toEqual({ role: 'assistant', content: 'recent short answer' });
    expect(out.length).toBeLessThan(4);
  });

  it('ignores system-role docs and empty content', () => {
    const out = buildHistoryMessages([
      msg('system', 'should never replay'),
      msg('user', ''),
      msg('user', 'real question'),
    ]);
    expect(out).toEqual([{ role: 'user', content: 'real question' }]);
  });
});
