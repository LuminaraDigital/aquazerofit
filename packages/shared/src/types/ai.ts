/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

import type { MealType } from './enums';

// ---------- ai container ----------

/**
 * Per-user AI memory (memory feature Phase 1). One deterministic doc per user
 * (`memory-<userId>`) in the `ai` container so GDPR export/purge cover it for
 * free (see me/service USER_SCOPED_CONTAINERS). The doc is consent-gated:
 * both reads and writes require aiPersonalisation.
 */
export const MEMORY_FACT_CATEGORIES = [
  'preference',
  'constraint',
  'goal',
  'milestone',
  'context',
] as const;
export type MemoryFactCategory = (typeof MEMORY_FACT_CATEGORIES)[number];

/**
 * suggested — extracted by AI, awaiting user confirmation;
 * confirmed — asserted or accepted by the user (eligible for prompt injection);
 * rejected  — declined by the user; retained briefly so the extractor can
 *             avoid re-suggesting it, then swept (MEMORY_REJECTED_RETENTION_DAYS).
 */
export type MemoryFactStatus = 'suggested' | 'confirmed' | 'rejected';

export interface MemoryFact {
  id: string; // mem-<random>
  text: string; // <= MEMORY_FACT_MAX_CHARS, plain language
  category: MemoryFactCategory;
  status: MemoryFactStatus;
  source: { kind: 'chat' | 'log' | 'profile' | 'user'; refId?: string };
  createdAt: string;
  updatedAt: string;
}

export interface UserMemory {
  id: string; // memory-<userId> (deterministic, one per user)
  // Discriminator is load-bearing: ai/util.ts duck-types profile/targets docs,
  // so memory must never carry weightKg/kcalTarget-shaped fields at top level.
  type: 'userMemory';
  userId: string;
  summary: string; // rolling summary, <= MEMORY_SUMMARY_MAX_CHARS, injected into chat
  facts: MemoryFact[];
  version: number; // incremented on every write (optimistic concurrency)
  /**
   * Confirmed-fact count at the moment the summary was last written (memory
   * feature Phase 2). The extractor regenerates the summary when the live
   * count drifts ≥ MEMORY_SUMMARY_REFRESH_FACT_DELTA from this. Optional so
   * Phase-1 docs need no migration; absent means "never summarised".
   */
  factsAtLastSummary?: number;
  updatedAt: string;
}

export interface AiMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  confidence?: number;
  generatedAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  type: 'chatSession';
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatToolCall {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  type: 'chatMessage';
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ChatToolCall[];
  guardrail?: { blocked: boolean; category: SafetyCategory | null };
  ai?: AiMetadata;
  reported?: boolean;
  createdAt: string;
}

export type SafetyCategory = 'safe' | 'medical' | 'crisis' | 'extremeDiet' | 'outOfScope';

export interface VisionPrediction {
  name: string;
  foodId?: string;
  estimatedGrams: number;
  confidence: number; // 0..1
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface VisionJob {
  id: string;
  userId: string;
  type: 'cvJob';
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'confirmed';
  imagePath: string;
  mealType: MealType;
  predictions: VisionPrediction[];
  ai: AiMetadata | null;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface MealRecommendation {
  id: string;
  userId: string;
  type: 'recommendation';
  name: string;
  description: string;
  mealType: MealType;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  ingredients: string[];
  rationale: string;
  ai: AiMetadata;
  feedback?: 'up' | 'down' | null;
  loggedMealId?: string | null;
  createdAt: string;
}
