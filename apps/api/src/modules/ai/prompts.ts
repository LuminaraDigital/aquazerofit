/**
 * Versioned prompt file loader (AQF-10 §1: every prompt is a versioned file in
 * the repository, never an inline string). Files live under /prompts at the
 * repo root; resolution walks upward from this module so it works regardless
 * of the process working directory.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelGroup } from '@aquazerofit/shared';

export type PromptId =
  | 'P-01'
  | 'P-02'
  | 'P-03'
  | 'P-04'
  | 'P-05'
  | 'P-06'
  | 'P-07'
  | 'P-08'
  | 'P-09'
  | 'P-10'
  | 'P-11';

const PROMPT_FILES: Record<PromptId, string> = {
  'P-01': 'P-01-meal-photo-analysis.md',
  'P-02': 'P-02-meal-recommendation.md',
  'P-03': 'P-03-meal-plan.md',
  'P-04': 'P-04-recipe-generation.md',
  'P-05': 'P-05-training-plan.md',
  'P-06': 'P-06-workout-adjustment.md',
  'P-07': 'P-07-assistant-system.md',
  'P-08': 'P-08-progress-insight.md',
  'P-09': 'P-09-safety-classifier.md',
  'P-10': 'P-10-memory-extraction.md',
  'P-11': 'P-11-memory-summary.md',
};

/** Default prompt per logical lane; call sites may override. */
const LANE_PROMPT: Record<ModelGroup, PromptId> = {
  visionPrimary: 'P-01',
  chatFast: 'P-07',
  planStructured: 'P-02',
  safetyCheap: 'P-09',
  insightBatch: 'P-08',
};

let cachedDir: string | null = null;

function promptsDir(): string {
  if (cachedDir) return cachedDir;
  const envDir = process.env.PROMPTS_DIR;
  if (envDir && existsSync(path.join(envDir, PROMPT_FILES['P-07']))) {
    cachedDir = envDir;
    return cachedDir;
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, 'prompts');
    if (existsSync(path.join(candidate, PROMPT_FILES['P-07']))) {
      cachedDir = candidate;
      return cachedDir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Last resort: repo root relative to apps/api/src/modules/ai
  cachedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..', 'prompts');
  return cachedDir;
}

export interface PromptFile {
  id: PromptId;
  version: string;
  content: string;
}

const cache = new Map<PromptId, PromptFile>();

export function loadPrompt(id: PromptId): PromptFile {
  const hit = cache.get(id);
  if (hit) return hit;
  let content = '';
  try {
    content = readFileSync(path.join(promptsDir(), PROMPT_FILES[id]), 'utf8');
  } catch {
    content = '';
  }
  const versionMatch = /^\s*[-*]?\s*Version:\s*([\w.\-]+)/im.exec(content);
  const file: PromptFile = {
    id,
    version: versionMatch?.[1] ?? '1.0.0',
    content,
  };
  cache.set(id, file);
  return file;
}

export function promptIdFor(task: ModelGroup): PromptId {
  return LANE_PROMPT[task];
}

/** "P-07@1.0.0" — recorded in AiMetadata and telemetry for every call. */
export function promptVersionFor(task: ModelGroup, override?: PromptId): string {
  const id = override ?? promptIdFor(task);
  const file = loadPrompt(id);
  return `${id}@${file.version}`;
}

/** Persona hints the offline mock engine borrows from P-07. */
export function personaHints(): { name: string; tone: string } {
  const p07 = loadPrompt('P-07');
  const nameMatch = /Persona(?:\s+name)?:\s*['"“]?([\w ]+?)['"”]?\s*$/im.exec(p07.content);
  const toneMatch = /Tone:\s*(.+)$/im.exec(p07.content);
  return {
    name: nameMatch?.[1]?.trim() || 'Aqua Coach',
    tone: toneMatch?.[1]?.trim() || 'warm, encouraging, plain-spoken, never shaming',
  };
}
