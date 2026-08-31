/**
 * Per-user AI memory service (memory feature Phase 1). Stores one deterministic
 * doc per user (`memory-<userId>`) in the `ai` container so the existing GDPR
 * plumbing (me/service exportUserData + purgeUser filter on userId over the
 * `ai` container) covers it with no extra wiring.
 *
 * Concurrency: the JsonStore is in-memory synchronous with an async disk flush
 * (platform/store.ts), so every read-modify-write here goes through one
 * synchronous mutateMemory() section — no awaits can interleave between the
 * read and the upsert. `version` is bumped on every write so a future
 * optimistic-concurrency check (or the Phase-2 extractor) can detect races.
 *
 * All functions take userId first (lyftr-style) so scoping can't be omitted:
 * there is no code path that touches another user's memory doc, which is also
 * why a non-owner probing a factId is indistinguishable from a missing fact.
 */
import type { MemoryFact, MemoryFactCategory, MemoryFactStatus, UserMemory } from '@aquazerofit/shared';
import {
  MEMORY_FACT_MAX_CHARS,
  MEMORY_MAX_FACTS_CONFIRMED,
  MEMORY_MAX_FACTS_SUGGESTED,
  MEMORY_REJECTED_RETENTION_DAYS,
  MEMORY_SUMMARY_MAX_CHARS,
} from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { getStore, newId } from '../../platform/store';
import { pre } from '../ai/guardrails';
import { auditDataAccess, hasConsent } from '../me/service';

/**
 * The doc carries only memory-shaped fields at the top level: ai/util.ts
 * duck-types profile/targets docs in this container by weightKg/kcalTarget,
 * so this shape must never grow such fields (see UserMemory type comment).
 */
export type MemoryDoc = UserMemory;

export const memoryId = (userId: string): string => `memory-${userId}`;

const nowIso = (): string => new Date().toISOString();

function defaultMemory(userId: string, version: number): MemoryDoc {
  return {
    id: memoryId(userId),
    type: 'userMemory',
    userId,
    summary: '',
    facts: [],
    version,
    updatedAt: nowIso(),
  };
}

/**
 * Prompt-injection hygiene: memory text (user- or model-authored) flows into a
 * system-role USER CONTEXT message, so non-whitespace C0/C1 control characters
 * (NUL, BEL, ESC/ANSI sequences, C1 block) are stripped on EVERY write path —
 * REST routes and the extraction pipeline both come through here. Whitespace
 * controls (\t \n \r \f \v) are left for the whitespace collapse to handle.
 */
function stripControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, '');
}

/** Control-char-stripped, whitespace-collapsed text; the lowercase of this is the dedupe key. */
function normaliseFactText(text: string): string {
  return stripControlChars(text).trim().replace(/\s+/g, ' ');
}

/**
 * Summary sanitisation: strip control chars (keeping \n), collapse horizontal
 * whitespace runs, and bound newline flooding — the summary is model output
 * and must stay a compact block inside the context message, never a padding
 * vector.
 */
function normaliseSummary(summary: string): string {
  return stripControlChars(summary)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Opportunistic sweep (runs on every write): rejected facts are kept only
 * MEMORY_REJECTED_RETENTION_DAYS — long enough for the Phase-2 extractor to
 * avoid re-suggesting them, short enough not to hoard declined data.
 */
function sweepExpiredRejected(facts: MemoryFact[], now: Date): MemoryFact[] {
  const cutoff = now.getTime() - MEMORY_REJECTED_RETENTION_DAYS * 24 * 3600 * 1000;
  return facts.filter(
    (f) => f.status !== 'rejected' || new Date(f.updatedAt).getTime() >= cutoff,
  );
}

/** Evict oldest-by-updatedAt within one status when its cap is exceeded. */
function enforceCap(facts: MemoryFact[], status: MemoryFactStatus, cap: number): MemoryFact[] {
  const inStatus = facts.filter((f) => f.status === status);
  if (inStatus.length <= cap) return facts;
  const doomed = new Set(
    [...inStatus]
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, inStatus.length - cap)
      .map((f) => f.id),
  );
  return facts.filter((f) => !doomed.has(f.id));
}

/**
 * Single get→mutate→upsert path for every write. Synchronous end to end (see
 * module header) so no other request can interleave between read and upsert.
 */
function mutateMemory(userId: string, mutate: (memory: MemoryDoc) => void): MemoryDoc {
  const store = getStore();
  const current = store.byId<MemoryDoc>('ai', memoryId(userId)) ?? defaultMemory(userId, 0);
  // Deep-ish copy so a thrown mutation never leaves a half-edited doc in the map.
  const next: MemoryDoc = {
    ...current,
    facts: current.facts.map((f) => ({ ...f, source: { ...f.source } })),
  };
  mutate(next);
  const now = new Date();
  next.facts = sweepExpiredRejected(next.facts, now);
  next.facts = enforceCap(next.facts, 'confirmed', MEMORY_MAX_FACTS_CONFIRMED);
  next.facts = enforceCap(next.facts, 'suggested', MEMORY_MAX_FACTS_SUGGESTED);
  next.version = current.version + 1;
  next.updatedAt = now.toISOString();
  store.upsert('ai', next);
  return next;
}

/** Lazy-create: the default doc is persisted on first read so `version` has a stable baseline. */
export function getMemory(userId: string): MemoryDoc {
  const store = getStore();
  const existing = store.byId<MemoryDoc>('ai', memoryId(userId));
  if (existing) return existing;
  const doc = defaultMemory(userId, 1);
  store.upsert('ai', doc);
  return doc;
}

export interface AddFactInput {
  text: string;
  category: MemoryFactCategory;
  /** Defaults to 'confirmed' — the REST route is the user asserting a fact directly. */
  status?: MemoryFactStatus;
  source?: MemoryFact['source'];
}

export function addFact(userId: string, input: AddFactInput): MemoryDoc {
  const text = normaliseFactText(input.text);
  // Route bodies are zod-validated; this guard covers internal callers (Phase-2 extractor).
  if (text.length === 0 || text.length > MEMORY_FACT_MAX_CHARS) {
    throw new AppError('VALIDATION_FAILED', `Fact text must be 1-${MEMORY_FACT_MAX_CHARS} characters`);
  }
  const status = input.status ?? 'confirmed';
  const source = input.source ?? { kind: 'user' as const };
  return mutateMemory(userId, (memory) => {
    const key = text.toLowerCase();
    const existing = memory.facts.find(
      (f) => f.category === input.category && normaliseFactText(f.text).toLowerCase() === key,
    );
    const now = nowIso();
    if (existing) {
      // A re-SUGGESTION (the extractor) never overrides a fact the user has
      // already resolved: it must not demote a confirmed fact back to
      // suggested, and it must not revive a rejected one (the whole point of
      // the 30-day rejected retention). It also must not refresh updatedAt —
      // repeated re-suggestions would otherwise extend that retention window
      // forever. The user path (status 'confirmed') still updates anything.
      if (status === 'suggested' && existing.status !== 'suggested') return;
      // Dedupe: re-asserting a known fact refreshes it (recency for cap
      // eviction, status revival of a rejected/suggested fact) instead of
      // duplicating the same statement.
      existing.text = text;
      existing.status = status;
      existing.source = source;
      existing.updatedAt = now;
      return;
    }
    memory.facts.push({
      id: newId('mem'),
      text,
      category: input.category,
      status,
      source,
      createdAt: now,
      updatedAt: now,
    });
  });
}

/** Own-doc lookup only: a non-owner's factId simply isn't found (404, no oracle). */
function requireFact(memory: MemoryDoc, factId: string): MemoryFact {
  const fact = memory.facts.find((f) => f.id === factId);
  if (!fact) throw new AppError('NOT_FOUND', 'Memory fact not found');
  return fact;
}

export function updateFactStatus(
  userId: string,
  factId: string,
  status: Exclude<MemoryFactStatus, 'suggested'>,
): MemoryDoc {
  return mutateMemory(userId, (memory) => {
    const fact = requireFact(memory, factId);
    fact.status = status;
    fact.updatedAt = nowIso();
  });
}

export function updateFactText(userId: string, factId: string, text: string): MemoryDoc {
  const normalised = normaliseFactText(text);
  if (normalised.length === 0 || normalised.length > MEMORY_FACT_MAX_CHARS) {
    throw new AppError('VALIDATION_FAILED', `Fact text must be 1-${MEMORY_FACT_MAX_CHARS} characters`);
  }
  return mutateMemory(userId, (memory) => {
    const fact = requireFact(memory, factId);
    fact.text = normalised;
    fact.updatedAt = nowIso();
  });
}

export function deleteFact(userId: string, factId: string): MemoryDoc {
  return mutateMemory(userId, (memory) => {
    requireFact(memory, factId); // 404 before mutating
    memory.facts = memory.facts.filter((f) => f.id !== factId);
  });
}

/** Internal API for the Phase-2 pipeline: rolling summary maintained by the extractor. */
export function setSummary(userId: string, summary: string): MemoryDoc {
  const trimmed = normaliseSummary(summary);
  if (trimmed.length > MEMORY_SUMMARY_MAX_CHARS) {
    throw new AppError('VALIDATION_FAILED', `Summary must be at most ${MEMORY_SUMMARY_MAX_CHARS} characters`);
  }
  return mutateMemory(userId, (memory) => {
    memory.summary = trimmed;
    // Refresh bookkeeping (Phase 2): the extractor regenerates the summary
    // when the confirmed count drifts MEMORY_SUMMARY_REFRESH_FACT_DELTA from
    // the count recorded here.
    memory.factsAtLastSummary = memory.facts.filter((f) => f.status === 'confirmed').length;
  });
}

/**
 * Wipe: reset to the default doc but keep bumping `version` so any concurrent
 * writer (or the Phase-2 extractor) sees the wipe rather than resurrecting
 * pre-wipe state. Audited like the other data-erasure actions.
 */
export function clearMemory(userId: string): MemoryDoc {
  const wiped = mutateMemory(userId, (memory) => {
    memory.summary = '';
    memory.facts = [];
    delete memory.factsAtLastSummary; // back to the "never summarised" baseline
  });
  auditDataAccess(userId, 'memory.cleared', {});
  return wiped;
}

/**
 * Clean internal API for the AI chat pipeline (Phase 2 injects this into the
 * model context). Returns null when the user has not consented to
 * aiPersonalisation — the consent gate applies to machine reads exactly like
 * REST reads — or when there is nothing useful to inject (no summary and no
 * confirmed facts; suggested/rejected facts never reach a prompt).
 */
export async function getMemoryForPrompt(
  userId: string,
): Promise<{ summary: string; confirmedFacts: string[] } | null> {
  if (!hasConsent(userId, 'aiPersonalisation')) return null;
  // Read-only path: do not lazy-create a doc just to report emptiness.
  const memory = getStore().byId<MemoryDoc>('ai', memoryId(userId));
  if (!memory) return null;
  const confirmedFacts: string[] = [];
  for (const fact of memory.facts) {
    if (fact.status !== 'confirmed') continue;
    const check = pre(fact.text);
    if (check.blocked) {
      console.warn('[memory] dropping blocked fact from prompt context', {
        category: check.category,
        preview: fact.text.slice(0, 60),
      });
      continue;
    }
    confirmedFacts.push(fact.text);
  }

  let summary = memory.summary;
  if (summary.length > 0) {
    const summaryCheck = pre(summary);
    if (summaryCheck.blocked) {
      console.warn('[memory] dropping blocked summary from prompt context', {
        category: summaryCheck.category,
        preview: summary.slice(0, 60),
      });
      summary = '';
    }
  }

  if (summary.length === 0 && confirmedFacts.length === 0) return null;
  return { summary, confirmedFacts };
}

/** Plain-language portion facts store grams only; refId is the foodId. */
function parsePortionGrams(text: string): number | null {
  const match = normaliseFactText(text).match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (!match) return null;
  const grams = Math.round(Number(match[1]));
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

/**
 * Last confirmed portion for [foodId], if the user corrected one before.
 * Reads only; never lazy-creates a memory doc.
 */
export function getRememberedPortionGrams(userId: string, foodId: string): number | null {
  const memory = getStore().byId<MemoryDoc>('ai', memoryId(userId));
  if (!memory) return null;
  const fact = memory.facts
    .filter(
      (f) =>
        f.category === 'preference' &&
        f.status === 'confirmed' &&
        f.source.refId === foodId,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!fact) return null;
  return parsePortionGrams(fact.text);
}

/** Persist a portion the user chose on confirm (preference facts keyed by foodId). */
export function rememberPortionCorrection(userId: string, foodId: string, grams: number): MemoryDoc {
  const rounded = Math.round(grams);
  if (rounded <= 0) {
    throw new AppError('VALIDATION_FAILED', 'Portion grams must be positive.');
  }
  const text = `${rounded} g`;
  return mutateMemory(userId, (memory) => {
    const existing = memory.facts.find(
      (f) => f.category === 'preference' && f.source.refId === foodId,
    );
    const now = nowIso();
    if (existing) {
      existing.text = text;
      existing.status = 'confirmed';
      existing.source = { kind: 'log', refId: foodId };
      existing.updatedAt = now;
      return;
    }
    memory.facts.push({
      id: newId('mem'),
      text,
      category: 'preference',
      status: 'confirmed',
      source: { kind: 'log', refId: foodId },
      createdAt: now,
      updatedAt: now,
    });
  });
}
