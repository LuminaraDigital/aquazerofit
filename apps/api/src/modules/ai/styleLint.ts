/**
 * Post-generation style lint (P-07 §Style rules) — measurement, never a block.
 *
 * The system prompt asks the model to avoid em dashes and a list of AI-slop
 * filler words, but a prompt is advisory: a model update or a provider swap
 * can silently stop honouring it. This check runs over every coach reply after
 * the safety filter and logs matches, so the team can watch violation
 * frequency per prompt and tighten things when a model drifts. It deliberately
 * does not replace the reply — swallowing a good answer over a word choice
 * would be a worse product failure than the word itself.
 *
 * Scope: model-generated text only. Code-authored copy (guardrail refusal
 * signposts, UI strings) never passes through here.
 */

export const EM_DASH = '—';

/**
 * Banned filler vocabulary, mirrored from prompts/P-07 §Style rules. Keep the
 * two lists in sync: the prompt is what the model reads, this is what the
 * measurement reads.
 */
export const SLOP_WORDS: readonly string[] = [
  'delve',
  'embark',
  'unleash',
  'unlock',
  'supercharge',
  'game-changer',
  'revolutionize',
  'revolutionise',
  'cutting-edge',
  'seamless',
  'holistic',
  'synergy',
  'empower',
  'harness',
  'leverage',
  'robust',
  'transformative',
  'tapestry',
  'testament',
  'journey',
  'landscape',
  'realm',
  'pivotal',
  'vibrant',
  'bustling',
  'furthermore',
  'moreover',
  'additionally',
];

// One regex per word, compiled once. The suffix class catches inflections
// (delves, delving, empowered, leveraging — including e-drop forms); the
// hyphen class also matches spaced variants ("game changer").
const SLOP_PATTERNS: ReadonlyArray<{ word: string; pattern: RegExp }> = SLOP_WORDS.map((word) => {
  const escaped = word.replace(/-/g, '[-\\s]');
  const stem = escaped.endsWith('e') ? escaped.slice(0, -1) : escaped;
  return { word, pattern: new RegExp(`\\b${stem}(?:e|s|es|d|ed|ing|ly)?\\b`, 'i') };
});

export interface StyleFindings {
  emDashCount: number;
  /** Distinct banned words found, named by their canonical list entry. */
  slopWords: string[];
}

/** Pure check — no I/O, usable from tests and eval runners. */
export function lintStyle(text: string): StyleFindings {
  const emDashCount = text.split(EM_DASH).length - 1;
  const slopWords = SLOP_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ word }) => word,
  );
  return { emDashCount, slopWords };
}

/**
 * Log-and-return wrapper for the response path. Warning only — the reply
 * still reaches the user; the log line is the monitoring signal. No user id
 * and no reply text in the log: counts and matched words are enough to trend.
 */
export function warnOnStyle(
  text: string,
  ctx: { promptId?: string; provider?: string } = {},
): StyleFindings {
  const findings = lintStyle(text);
  if (findings.emDashCount > 0 || findings.slopWords.length > 0) {
    console.warn(
      '[styleLint] banned style in model output',
      JSON.stringify({
        promptId: ctx.promptId ?? 'P-07',
        provider: ctx.provider ?? 'unknown',
        emDashes: findings.emDashCount,
        slopWords: findings.slopWords,
      }),
    );
  }
  return findings;
}
