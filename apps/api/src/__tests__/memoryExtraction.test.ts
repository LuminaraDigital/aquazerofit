/**
 * Memory extraction pipeline (memory feature Phase 2): the post-turn extractor
 * stages SUGGESTED facts via addFact under the aiPersonalisation consent gate,
 * survives malformed model output, caps facts per turn, and refreshes the
 * rolling summary on the documented triggers. The gateway is mocked at the
 * module seam so responses are fully controlled.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMORY_SUMMARY_REFRESH_FACT_DELTA } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-extraction-'));
process.env.AZF_DATA_DIR = dataDir;

vi.mock('../modules/ai/gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/ai/gateway')>();
  return { ...actual, complete: vi.fn() };
});

const { complete } = await import('../modules/ai/gateway');
const { extractMemoryFromTurn, maybeRefreshSummary } = await import('../modules/memory/extraction');
const { addFact, clearMemory, memoryId, setSummary } = await import('../modules/memory/service');
const { saveConsents } = await import('../modules/me/service');
const { getStore } = await import('../platform/store');
import type { UserMemory } from '@aquazerofit/shared';

const completeMock = vi.mocked(complete);

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

beforeEach(() => {
  completeMock.mockReset();
});

let userSeq = 0;
function newUser(consent: boolean): string {
  userSeq += 1;
  const userId = `u_extract_${userSeq}`;
  saveConsents(userId, {
    wellnessDataProcessing: false,
    aiPersonalisation: consent,
    anonymisedAnalytics: false,
    reminders: false,
  });
  return userId;
}

function gatewayJson(json: unknown) {
  return {
    text: JSON.stringify(json),
    json,
    meta: { provider: 'mock', model: 'mock-safetyCheap', promptVersion: 'P-10@1.0.0', generatedAt: new Date().toISOString() },
  };
}

const memoryOf = (userId: string) => getStore().byId<UserMemory>('ai', memoryId(userId));

const TURN = {
  userMessageId: 'cm_test_1',
  userMessage: 'I am vegetarian and I hate burpees',
  assistantReply: 'Noted — plenty of great meat-free protein options and burpee-free conditioning!',
};

describe('extractMemoryFromTurn', () => {
  it('stages extracted facts as suggested (never confirmed) with a chat source', async () => {
    const userId = newUser(true);
    completeMock.mockResolvedValue(
      gatewayJson({
        facts: [
          { text: 'Is vegetarian', category: 'constraint' },
          { text: 'Dislikes burpees', category: 'preference' },
        ],
      }),
    );

    await extractMemoryFromTurn(userId, TURN);

    // Extraction call went to the cheap lane with the P-10 override.
    expect(completeMock).toHaveBeenCalledTimes(1);
    const [lane, messages, opts] = completeMock.mock.calls[0]!;
    expect(lane).toBe('safetyCheap');
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.content).toContain(TURN.userMessage);
    expect(opts).toMatchObject({ json: true, promptId: 'P-10' });

    const memory = memoryOf(userId)!;
    expect(memory.facts).toHaveLength(2);
    for (const fact of memory.facts) {
      expect(fact.status).toBe('suggested');
      expect(fact.source).toEqual({ kind: 'chat', refId: 'cm_test_1' });
    }
    expect(memory.facts.map((f) => f.text)).toEqual(['Is vegetarian', 'Dislikes burpees']);
  });

  it('writes nothing and never calls the model without aiPersonalisation consent', async () => {
    const userId = newUser(false);
    await extractMemoryFromTurn(userId, TURN);
    expect(completeMock).not.toHaveBeenCalled();
    expect(memoryOf(userId)).toBeUndefined();
  });

  it('skips silently (no crash, no write) on malformed model JSON', async () => {
    const userId = newUser(true);
    completeMock.mockResolvedValue({
      text: 'sorry, here are your facts: vegetarian!!',
      json: { unexpected: 'shape' },
      meta: { provider: 'groq', model: 'x', promptVersion: 'P-10@1.0.0', generatedAt: new Date().toISOString() },
    });
    await expect(extractMemoryFromTurn(userId, TURN)).resolves.toBeUndefined();
    expect(memoryOf(userId)).toBeUndefined();
  });

  it('skips silently when the gateway itself rejects', async () => {
    const userId = newUser(true);
    completeMock.mockRejectedValue(new Error('AI_UNAVAILABLE'));
    await expect(extractMemoryFromTurn(userId, TURN)).resolves.toBeUndefined();
    expect(memoryOf(userId)).toBeUndefined();
  });

  it('caps staged facts at 3 per turn', async () => {
    const userId = newUser(true);
    completeMock.mockResolvedValue(
      gatewayJson({
        facts: [
          { text: 'Fact one', category: 'context' },
          { text: 'Fact two', category: 'context' },
          { text: 'Fact three', category: 'context' },
          { text: 'Fact four', category: 'context' },
          { text: 'Fact five', category: 'context' },
        ],
      }),
    );
    await extractMemoryFromTurn(userId, TURN);
    const memory = memoryOf(userId)!;
    expect(memory.facts).toHaveLength(3);
    expect(memory.facts.map((f) => f.text)).toEqual(['Fact one', 'Fact two', 'Fact three']);
  });
});

describe('maybeRefreshSummary', () => {
  function confirmFacts(userId: string, count: number, offset = 0): void {
    for (let i = 0; i < count; i += 1) {
      addFact(userId, { text: `Confirmed fact ${offset + i}`, category: 'context', status: 'confirmed' });
    }
  }

  it('bootstraps an empty summary once 3 confirmed facts exist, recording the baseline', async () => {
    const userId = newUser(true);
    confirmFacts(userId, 3);
    completeMock.mockResolvedValue({
      text: 'Compact profile summary.',
      json: undefined,
      meta: { provider: 'mock', model: 'mock-safetyCheap', promptVersion: 'P-11@1.0.0', generatedAt: new Date().toISOString() },
    });

    await maybeRefreshSummary(userId);

    expect(completeMock).toHaveBeenCalledTimes(1);
    const [, , opts] = completeMock.mock.calls[0]!;
    expect(opts).toMatchObject({ promptId: 'P-11' });
    const memory = memoryOf(userId)!;
    expect(memory.summary).toBe('Compact profile summary.');
    expect(memory.factsAtLastSummary).toBe(3);
  });

  it('does nothing while the confirmed count stays within the refresh delta', async () => {
    const userId = newUser(true);
    confirmFacts(userId, 3);
    setSummary(userId, 'Existing summary.'); // baseline = 3
    confirmFacts(userId, MEMORY_SUMMARY_REFRESH_FACT_DELTA - 1, 100); // drift of 4 < 5

    await maybeRefreshSummary(userId);
    expect(completeMock).not.toHaveBeenCalled();

    confirmFacts(userId, 1, 200); // drift now = delta
    completeMock.mockResolvedValue({
      text: 'Refreshed summary.',
      json: undefined,
      meta: { provider: 'mock', model: 'mock-safetyCheap', promptVersion: 'P-11@1.0.0', generatedAt: new Date().toISOString() },
    });
    await maybeRefreshSummary(userId);
    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(memoryOf(userId)!.summary).toBe('Refreshed summary.');
  });

  it('never refreshes without consent', async () => {
    const userId = newUser(false);
    await maybeRefreshSummary(userId);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('discards an in-flight summary when the memory is wiped mid-call (wipe must never be resurrected)', async () => {
    const userId = newUser(true);
    confirmFacts(userId, 3);

    // Deferred gateway response: the wipe lands while the "model call" is pending.
    let resolveComplete!: (v: Awaited<ReturnType<typeof complete>>) => void;
    completeMock.mockReturnValue(
      new Promise((resolve) => {
        resolveComplete = resolve;
      }),
    );

    const refresh = maybeRefreshSummary(userId);
    clearMemory(userId); // DELETE /me/memory during the awaited call
    resolveComplete({
      text: 'Summary of the pre-wipe facts (must be discarded).',
      json: undefined,
      meta: { provider: 'mock', model: 'mock-safetyCheap', promptVersion: 'P-11@1.0.0', generatedAt: new Date().toISOString() },
    });
    await refresh;

    const memory = memoryOf(userId)!;
    expect(memory.summary).toBe('');
    expect(memory.facts).toHaveLength(0);
  });

  it('discards an in-flight summary when consent is revoked mid-call', async () => {
    const userId = newUser(true);
    confirmFacts(userId, 3);

    let resolveComplete!: (v: Awaited<ReturnType<typeof complete>>) => void;
    completeMock.mockReturnValue(
      new Promise((resolve) => {
        resolveComplete = resolve;
      }),
    );
    const refresh = maybeRefreshSummary(userId);
    saveConsents(userId, {
      wellnessDataProcessing: false,
      aiPersonalisation: false,
      anonymisedAnalytics: false,
      reminders: false,
    });
    resolveComplete({
      text: 'Late summary (must be discarded).',
      json: undefined,
      meta: { provider: 'mock', model: 'mock-safetyCheap', promptVersion: 'P-11@1.0.0', generatedAt: new Date().toISOString() },
    });
    await refresh;
    expect(memoryOf(userId)!.summary).toBe('');
  });
});

describe('re-suggestion never overrides a user decision (addFact status rules)', () => {
  it('a suggested duplicate never demotes a confirmed fact', () => {
    const userId = newUser(true);
    addFact(userId, { text: 'Is vegetarian', category: 'constraint', status: 'confirmed' });

    addFact(userId, { text: '  is   VEGETARIAN ', category: 'constraint', status: 'suggested', source: { kind: 'chat', refId: 'cm_x' } });

    const memory = memoryOf(userId)!;
    expect(memory.facts).toHaveLength(1);
    expect(memory.facts[0]!.status).toBe('confirmed');
    expect(memory.facts[0]!.source).toEqual({ kind: 'user' });
  });

  it('a suggested duplicate never revives a rejected fact, and does not extend its retention clock', () => {
    const userId = newUser(true);
    const withFact = addFact(userId, { text: 'Runs marathons', category: 'context', status: 'confirmed' });
    const factId = withFact.facts[0]!.id;
    // User rejects it.
    const store = getStore();
    const doc = memoryOf(userId)!;
    doc.facts.find((f) => f.id === factId)!.status = 'rejected';
    const rejectedAt = doc.facts.find((f) => f.id === factId)!.updatedAt;
    store.upsert('ai', doc);

    addFact(userId, { text: 'Runs marathons', category: 'context', status: 'suggested', source: { kind: 'chat', refId: 'cm_y' } });

    const after = memoryOf(userId)!;
    const fact = after.facts.find((f) => f.id === factId)!;
    expect(fact.status).toBe('rejected');
    // updatedAt untouched: repeated re-suggestions must not extend the
    // 30-day rejected retention window forever.
    expect(fact.updatedAt).toBe(rejectedAt);
  });

  it('the user path (confirmed) still revives a rejected fact explicitly', () => {
    const userId = newUser(true);
    const withFact = addFact(userId, { text: 'Swims on Fridays', category: 'preference', status: 'confirmed' });
    const factId = withFact.facts[0]!.id;
    const doc = memoryOf(userId)!;
    doc.facts.find((f) => f.id === factId)!.status = 'rejected';
    getStore().upsert('ai', doc);

    addFact(userId, { text: 'Swims on Fridays', category: 'preference', status: 'confirmed', source: { kind: 'user' } });
    expect(memoryOf(userId)!.facts.find((f) => f.id === factId)!.status).toBe('confirmed');
  });
});

describe('mid-flight consent revocation during fact extraction', () => {
  it('writes no facts when consent is revoked while the extraction call is pending', async () => {
    const userId = newUser(true);
    let resolveComplete!: (v: Awaited<ReturnType<typeof complete>>) => void;
    completeMock.mockReturnValue(
      new Promise((resolve) => {
        resolveComplete = resolve;
      }),
    );

    const extraction = extractMemoryFromTurn(userId, TURN);
    saveConsents(userId, {
      wellnessDataProcessing: false,
      aiPersonalisation: false,
      anonymisedAnalytics: false,
      reminders: false,
    });
    resolveComplete(gatewayJson({ facts: [{ text: 'Is vegetarian', category: 'constraint' }] }));
    await extraction;

    expect(memoryOf(userId)).toBeUndefined();
  });
});

describe('summary sanitisation (setSummary write path)', () => {
  it('strips control characters and bounds newline flooding', () => {
    const userId = newUser(true);
    const bell = String.fromCharCode(7);
    const esc = String.fromCharCode(27);
    setSummary(userId, `Line one${bell} with noise${esc}[2J\n\n\n\n\n\nLine   two`);
    const memory = memoryOf(userId)!;
    expect(memory.summary).toBe('Line one with noise[2J\n\nLine two');
  });
});
