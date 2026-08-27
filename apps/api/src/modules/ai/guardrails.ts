/**
 * Guardrails per AQF-10 P-09 / AQF-11 §3–4.
 *
 * pre(text)  — input classifier over the closed set
 *              safe | medical | crisis | extremeDiet | outOfScope, with
 *              jailbreak-framing detection layered on top.
 * post(text) — output filter + NumericRules.check (kcal floor, macro sanity).
 *
 * Deliberately dependency-light: classification is pure (testable without the
 * platform); the audit write is a best-effort fire-and-forget dynamic import so
 * eval runners can execute this module in isolation.
 *
 * Priority order on conflicts: crisis > medical > extremeDiet > outOfScope.
 * A crisis signal always wins — a user in distress must never receive diet
 * content in that turn (AQF-11 §4).
 */
import { crisisSignpostFor, KCAL_FLOOR } from '@aquazerofit/shared';
import type { SafetyCategory } from '@aquazerofit/shared';

// ---------------------------------------------------------------------------
// Pattern bank (AQF-10 §3.1 adversarial coverage)
// ---------------------------------------------------------------------------

const CRISIS_PATTERNS: RegExp[] = [
  // self-harm / suicidal language
  /\b(kill(ing)?\s+myself|suicid\w*|end(ing)?\s+(my|it\s+all)\s*(life)?|self[-\s]?harm|harm(ing)?\s+myself|hurt(ing)?\s+myself|cut(ting)?\s+myself|don'?t\s+want\s+to\s+(live|be\s+alive|exist)|no\s+reason\s+to\s+(live|go\s+on)|better\s+off\s+dead|want(ed)?\s+to\s+die|not\s+worth\s+living)\b/i,
  // eating-disorder indicators (AQF-11 §4: signpost, no calorie/restriction content)
  /\b(hate\s+(my|this)\s+body|disgust(ed)?\s+(by|with)\s+my\s+body|punish\s+myself\s+for\s+eating|feel\s+(so\s+)?guilty\s+(after|about|when)\s+eating|terrified\s+of\s+(food|eating|gaining)|can'?t\s+stop\s+(binge?ing|bingeing)|binge\s+and\s+purge|deserve\s+to\s+eat|afraid\s+to\s+eat)\b/i,
];

const MEDICAL_PATTERNS: RegExp[] = [
  /\b(diagnos\w+|prescri\w+|medicat\w+|dosage|dose\s+of|\d+\s*mg\b|milligrams?)\b/i,
  /\b(blood\s+(test|work|panel|pressure|sugar)|lab\s+(results?|work)|test\s+results?|scan\s+results?|x[-\s]?ray|biopsy)\b/i,
  /\b(do\s+i\s+have\s+(diabetes|cancer|hypothyroid\w*|pcos|anaemia|anemia|a\s+\w+\s*(condition|disorder|disease)))\b/i,
  /\b(insulin|metformin|ozempic|semaglutide|wegovy|mounjaro|statins?|antibiotics?|ibuprofen|paracetamol|levothyroxine)\b/i,
  /\b(symptoms?\s+of|is\s+(this|it)\s+(a\s+)?(symptom|sign)\s+of|treat(ment)?\s+(for|my)\s+\w+|cure\s+(for|my)\b|clinical\s+nutrition|medical\s+advice)\b/i,
  /\b(rehab\w*|recovery\s+plan)\b[\s\S]{0,30}\b(injur\w+|tears?|torn|surgery|acl|mcl|fracture)\b|\bpost[-\s]?surgery\b/i,
  /\b(thyroid|cholesterol\s+(levels?|reading)|hba1c|blood\s+glucose\s+reading)\b/i,
];

const EXTREME_DIET_PATTERNS: RegExp[] = [
  // prolonged fasting
  /\b((water|dry)\s+fast\w*|fast(ing)?\s+for\s+(\d+|a|one|two|three|four|five|six|seven|several|multiple)\s+(days?|weeks?)|not\s+eat(ing)?\s+(anything\s+)?for\s+(\d+|a|two|three|several)\s+days?|(stop|quit)\s+eating\s+(entirely|completely|altogether)|(eat|eating)\s+nothing\s+(for|all)\b|one\s+meal\s+every\s+(two|three|\d+)\s+days)\b/i,
  // purging behaviours
  /\b(purg(e|ing)|mak(e|ing)\s+myself\s+(throw\s+up|vomit|sick)|throw(ing)?\s+up\s+(after|my)\s+(meals?|eating|food)|vomit(ing)?\s+(after\s+eating|to\s+lose)|laxatives?\b|diuretics?\s+(to|for)\s+(lose|weight)|diet\s+pills?\b|spit(ting)?\s+out\s+food)\b/i,
  // crash-diet phrasing
  /\b(crash\s+diet|starv\w+|zero[-\s]?calorie\s+diet|dehydrat\w+\s+(to|for)\s+(lose|cut|weight)|sweat\s+out\s+the\s+weight|lose\s+\d+\s*kg\s+in\s+(a|one|\d+)\s+(week|days?))\b/i,
];

const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /\b(legal\s+advice|lawyer|solicitor|lawsuit|sue\s+(my|them|someone)|contract\s+(law|dispute)|visa\s+application|immigration)\b/i,
  /\b(invest\w*|stocks?|shares?|etfs?|crypto\w*|bitcoin|superannuation|mortgage|tax(es|\s+return)?|financial\s+advice|pay\s+off\s+(my\s+)?debt)\b/i,
  // mental-health treatment (signpost, not treat — AQF-11 §1)
  /\b(therap(y|ist)|counsell?(ing|or)|psychiatrist|psychologist|antidepressants?|anxiety\s+(medication|treatment)|depression\s+(treatment|medication)|treat\s+my\s+(depression|anxiety|adhd))\b/i,
];

const JAILBREAK_PATTERNS: RegExp[] = [
  /\b(ignore|forget|disregard|bypass|override)\b[\s\S]{0,40}\b(instructions?|rules?|guidelines?|restrictions?|polic(y|ies)|guardrails?|system\s+prompt)\b/i,
  /\b(pretend\s+(to\s+be|you'?re|you\s+are)|role[-\s]?play(ing)?\s+as|act\s+as\s+(if\s+you|an?\s+)|you\s+are\s+now\s+(a|an|in)|imagine\s+you\s+(are|were)\s+(a|an)\b)\b/i,
  /\b(developer\s+mode|dan\s+mode|jailbreak|no\s+(safety\s+)?(restrictions|filters|limits)|without\s+(any\s+)?(restrictions|filters|limitations|rules)|unfiltered\s+(answer|response|mode))\b/i,
  /\b(hypothetical(ly)?|for\s+a\s+(story|novel|screenplay|movie|fictional?\s+\w+)|in\s+a\s+fictional\s+world|purely\s+academic|just\s+curious,?\s+asking\s+for\s+a\s+friend)\b[\s\S]{0,80}\b(dosage|medication|diagnos\w+|starv\w+|purge|fast(ing)?\s+for|below\s+\d+\s*(kcal|calories))\b/i,
  /\b(what\s+(is|are)\s+(your|the)\s+system\s+prompt|reveal\s+your\s+(prompt|instructions)|repeat\s+your\s+instructions)\b/i,
];

/** Sub-floor calorie targets, e.g. "can I eat 600 calories a day". */
const SUBFLOOR_INPUT = /\b([1-9]\d{2})\s*(?:k?cal(?:orie)?s?|calory)\b/gi;
const SUBFLOOR_CONTEXT = /\b(eat|eating|diet|meal|plan|target|limit|only|survive|stick\s+to|cut\s+to|drop\s+to|day|daily|per\s+day|goal|aim)\b/i;

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  category: SafetyCategory;
  jailbreak: boolean;
  matched: string[];
}

function findMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    p.lastIndex = 0;
    const m = p.exec(text);
    if (m) return m[0];
  }
  return null;
}

function hasSubFloorTarget(text: string): boolean {
  SUBFLOOR_INPUT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SUBFLOOR_INPUT.exec(text)) !== null) {
    const n = Number(m[1]);
    if (n > 0 && n < KCAL_FLOOR.unspecified && SUBFLOOR_CONTEXT.test(text)) return true;
  }
  return false;
}

/** Pure classifier — no I/O, usable from tests and eval runners. */
export function classify(text: string): ClassificationResult {
  const matched: string[] = [];
  const jailbreakHit = findMatch(text, JAILBREAK_PATTERNS);
  const jailbreak = jailbreakHit !== null;
  if (jailbreakHit) matched.push(jailbreakHit);

  const crisis = findMatch(text, CRISIS_PATTERNS);
  if (crisis) {
    matched.push(crisis);
    return { category: 'crisis', jailbreak, matched };
  }
  const medical = findMatch(text, MEDICAL_PATTERNS);
  if (medical) {
    matched.push(medical);
    return { category: 'medical', jailbreak, matched };
  }
  const extreme = findMatch(text, EXTREME_DIET_PATTERNS);
  if (extreme) {
    matched.push(extreme);
    return { category: 'extremeDiet', jailbreak, matched };
  }
  if (hasSubFloorTarget(text)) {
    matched.push('sub-floor calorie target');
    return { category: 'extremeDiet', jailbreak, matched };
  }
  const oos = findMatch(text, OUT_OF_SCOPE_PATTERNS);
  if (oos) {
    matched.push(oos);
    return { category: 'outOfScope', jailbreak, matched };
  }
  // A pure instruction-override attempt with no unsafe payload is still
  // refused: the assistant never renegotiates its scope.
  if (jailbreak) {
    return { category: 'outOfScope', jailbreak, matched };
  }
  return { category: 'safe', jailbreak: false, matched };
}

// ---------------------------------------------------------------------------
// Supportive refusal copy (AQF-11 §4 — warm, no method content, signposted)
// ---------------------------------------------------------------------------

const MEDICAL_SIGNPOST =
  'I can’t help with medical questions like diagnosis, medication, dosages or test results — that’s important enough that it deserves a real professional. A GP or an Accredited Practising Dietitian can give you advice that’s safe for your specific situation. I’m always here for everyday nutrition, hydration and training support.';

const EXTREME_DIET_SIGNPOST = `I can’t support that — very low intakes, prolonged fasting or purging can cause real harm, and AquaZeroFit never recommends eating below ${KCAL_FLOOR.unspecified} kcal a day. If food or eating feels stressful right now, the Butterfly Foundation National Helpline (1800 33 4673) is a kind, judgement-free place to talk. I’d be glad to help you build a safe, sustainable plan instead — just say the word.`;

const OUT_OF_SCOPE_SIGNPOST =
  'That’s outside what I can help with — I stick to everyday wellness: nutrition, hydration, movement and progress. For legal, financial or mental-health treatment questions, a qualified professional is the right person to ask. Happy to help with your wellness goals any time.';

/**
 * `locale` is the caller's Accept-Language string (see platform/locale.ts).
 * Only the crisis branch reads it: that is the one refusal whose usefulness
 * depends on the number in it being dialable from where the user is. Omitted,
 * it yields the AU wording the product shipped with.
 */
export function refusalMessageFor(category: SafetyCategory, locale?: string): string {
  switch (category) {
    case 'crisis':
      return crisisSignpostFor(locale);
    case 'medical':
      return MEDICAL_SIGNPOST;
    case 'extremeDiet':
      return EXTREME_DIET_SIGNPOST;
    case 'outOfScope':
      return OUT_OF_SCOPE_SIGNPOST;
    default:
      return OUT_OF_SCOPE_SIGNPOST;
  }
}

// ---------------------------------------------------------------------------
// Audit (best-effort, fire-and-forget; the platform store is imported lazily
// so pure classification keeps working in isolated eval/test runs)
// ---------------------------------------------------------------------------

interface GuardrailAudit {
  userId: string;
  stage: 'pre' | 'post';
  category: SafetyCategory;
  jailbreak?: boolean;
  matched?: string[];
  reason?: string;
}

async function writeGuardrailAudit(event: GuardrailAudit): Promise<void> {
  try {
    const { store } = await import('../../platform/store');
    const container = store.container('audit') as unknown as {
      upsert(doc: Record<string, unknown>): unknown;
    };
    await container.upsert({
      id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userId: event.userId,
      type: 'guardrailTrigger',
      action: event.stage === 'pre' ? 'inputBlocked' : 'outputBlocked',
      detail: {
        category: event.category,
        jailbreak: event.jailbreak ?? false,
        matched: event.matched ?? [],
        reason: event.reason ?? null,
      },
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Audit is best-effort here; the platform error handler logs elsewhere.
  }
}

// ---------------------------------------------------------------------------
// pre / post
// ---------------------------------------------------------------------------

export interface GuardrailDecision {
  blocked: boolean;
  category: SafetyCategory;
  jailbreak: boolean;
  /** Supportive signpost to show the user when blocked; null when safe. */
  message: string | null;
}

export function pre(text: string, ctx?: { userId?: string; locale?: string }): GuardrailDecision {
  const result = classify(text);
  if (result.category === 'safe') {
    return { blocked: false, category: 'safe', jailbreak: false, message: null };
  }
  void writeGuardrailAudit({
    userId: ctx?.userId ?? 'anonymous',
    stage: 'pre',
    category: result.category,
    jailbreak: result.jailbreak,
    matched: result.matched,
  });
  return {
    blocked: true,
    category: result.category,
    jailbreak: result.jailbreak,
    message: refusalMessageFor(result.category, ctx?.locale),
  };
}

// ---- preAsync: optional LLM second stage (P-09 safetyCheap lane) ----

/** Minimum message length before the LLM classifier may run (regex stays authoritative below this). */
const LLM_SAFETY_LENGTH_THRESHOLD = 80;

/** Broad health/diet signals that warrant an LLM pass when regex says safe. */
const HEALTH_DIET_HEURISTIC =
  /\b(thyroid|diabetes|medication|dosage|prescri|diagnos|symptom|blood\s+test|fast(ing)?|purge|suicid|self[-\s]?harm|eating\s+disorder|calorie\s+deficit)\b/i;

const VALID_SAFETY_CATEGORIES = new Set<SafetyCategory>([
  'safe',
  'medical',
  'crisis',
  'extremeDiet',
  'outOfScope',
]);

export interface PreAsyncOptions {
  userId?: string;
  /** Accept-Language of the request, so a crisis signpost names a local line. */
  locale?: string;
  /** Force the LLM classifier even when config/heuristics would skip it (tests). */
  forceLlm?: boolean;
  /** Skip the LLM classifier entirely (tests). */
  skipLlm?: boolean;
}

async function shouldRunLlmClassifier(text: string, opts?: PreAsyncOptions): Promise<boolean> {
  if (opts?.skipLlm) return false;
  if (opts?.forceLlm) return true;
  const { config } = await import('../../platform/config');
  if (!config.enableLlmSafety) return false;
  return text.length > LLM_SAFETY_LENGTH_THRESHOLD || HEALTH_DIET_HEURISTIC.test(text);
}

function parseClassifierCategory(result: { json?: unknown; text: string }): SafetyCategory | null {
  let raw: unknown = result.json;
  if (raw === undefined) {
    try {
      raw = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && raw !== null && 'category' in raw) {
    const cat = (raw as { category: unknown }).category;
    if (typeof cat === 'string' && VALID_SAFETY_CATEGORIES.has(cat as SafetyCategory)) {
      return cat as SafetyCategory;
    }
  }
  return null;
}

/**
 * Async input guardrail: runs sync pre() first, then optionally calls the P-09
 * safetyCheap lane when config.enableLlmSafety is on and the message is long or
 * health-adjacent. Classifier errors fail open to the regex result so chat keeps
 * working offline; crisis-like content is still caught by sync pre().
 */
export async function preAsync(text: string, opts?: PreAsyncOptions): Promise<GuardrailDecision> {
  const syncResult = pre(text, opts);
  if (syncResult.blocked) return syncResult;

  const runLlm = await shouldRunLlmClassifier(text, opts);
  if (!runLlm) return syncResult;

  try {
    const { complete } = await import('./gateway');
    const { loadPrompt } = await import('./prompts');
    const systemPrompt = loadPrompt('P-09');
    const result = await complete(
      'safetyCheap',
      [
        {
          role: 'system',
          content:
            systemPrompt.content ||
            'Classify the user message into exactly one safety category as JSON.',
        },
        { role: 'user', content: text },
      ],
      { json: true, promptId: 'P-09', maxTokens: 64, deadlineMs: 5_000 },
    );

    const category = parseClassifierCategory(result);
    if (!category || category === 'safe') return syncResult;

    const syncClass = classify(text);
    void writeGuardrailAudit({
      userId: opts?.userId ?? 'anonymous',
      stage: 'pre',
      category,
      jailbreak: syncClass.jailbreak,
      matched: [`llm:${category}`, ...syncClass.matched],
    });
    return {
      blocked: true,
      category,
      jailbreak: syncClass.jailbreak,
      message: refusalMessageFor(category, opts?.locale),
    };
  } catch (err) {
    console.warn(
      '[guardrails] LLM safety classifier unavailable, using regex result',
      err instanceof Error ? err.message : err,
    );
    return syncResult;
  }
}

// ---- NumericRules: rules a language model cannot be trusted to respect ----

export interface NumericRuleViolation {
  rule: 'kcalFloor' | 'macroSanity';
  detail: string;
}

// The kcal floor must catch a model *prescribing* a sub-floor intake without
// firing on the app's own arithmetic. Reporting a remaining budget ("you have
// around 1135 kcal left") is normal any time a user has eaten more than
// target - floor, i.e. most evenings; treating it as advice replaced a routine
// answer with the eating-disorder signpost (see the regression cases in
// guardrails.test.ts). So the triggers are split by force.

/** Directive phrasing: unconditionally advice, whatever the surrounding text. */
const KCAL_DIRECTIVE =
  /\b(?:aim\s+for|target|eat|stick\s+to|limit\s+(?:yourself\s+)?to|reduce\s+(?:intake\s+)?to|drop\s+to|only\s+eat|cap\s+(?:it\s+)?at)\b[^.\n]{0,40}?\b(\d{3,4})\s*(?:k?cal(?:orie)?s?|calory)\b/gi;

/**
 * Hedges. "around 900 kcal a day" is still advice, but "around 1135 kcal left"
 * is a budget readout, so a hedge only counts when its sentence is not
 * reporting what remains.
 */
const KCAL_HEDGE =
  /\b(?:around|about)\b[^.\n]{0,40}?\b(\d{3,4})\s*(?:k?cal(?:orie)?s?|calory)\b/gi;

/** Remaining-budget phrasing that makes a hedged figure a readout, not advice. */
const REMAINING_BUDGET = /\b(?:left|remaining|remains|leftover|to\s+go|leaves?\s+you)\b/i;

/** The sentence containing `index`, used to judge a hedge in context. */
function sentenceAround(text: string, index: number): string {
  const start = Math.max(...['.', '\n', '!', '?'].map((c) => text.lastIndexOf(c, index)), -1) + 1;
  const ends = ['.', '\n', '!', '?']
    .map((c) => text.indexOf(c, index))
    .filter((i) => i !== -1);
  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start, end);
}
const MACRO_CLAIM = /\b(\d{2,5})\s*g(?:rams)?\s+(?:of\s+)?(protein|carbs?|carbohydrates?|fat)\b/gi;

const MACRO_MAX: Record<string, number> = { protein: 400, carbs: 1200, fat: 350 };

export const NumericRules = {
  check(text: string): { ok: boolean; violations: NumericRuleViolation[] } {
    const violations: NumericRuleViolation[] = [];

    const flagged = new Set<number>();
    const flagKcal = (m: RegExpExecArray) => {
      const kcal = Number(m[1]);
      if (kcal <= 0 || kcal >= KCAL_FLOOR.unspecified || flagged.has(m.index)) return;
      flagged.add(m.index);
      violations.push({
        rule: 'kcalFloor',
        detail: `advised intake ${kcal} kcal is below the ${KCAL_FLOOR.unspecified} kcal safety floor`,
      });
    };

    KCAL_DIRECTIVE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = KCAL_DIRECTIVE.exec(text)) !== null) flagKcal(m);

    KCAL_HEDGE.lastIndex = 0;
    while ((m = KCAL_HEDGE.exec(text)) !== null) {
      if (REMAINING_BUDGET.test(sentenceAround(text, m.index))) continue;
      flagKcal(m);
    }

    MACRO_CLAIM.lastIndex = 0;
    while ((m = MACRO_CLAIM.exec(text)) !== null) {
      const grams = Number(m[1]);
      const macro = m[2].toLowerCase().startsWith('carb')
        ? 'carbs'
        : m[2].toLowerCase().startsWith('fat')
          ? 'fat'
          : 'protein';
      if (grams > (MACRO_MAX[macro] ?? 1000)) {
        violations.push({
          rule: 'macroSanity',
          detail: `${grams} g ${macro} exceeds the sanity ceiling of ${MACRO_MAX[macro]} g`,
        });
      }
    }

    return { ok: violations.length === 0, violations };
  },
};

/** Output patterns that must never reach the user regardless of provider. */
const OUTPUT_MEDICAL_PATTERNS: RegExp[] = [
  /\b(you\s+should\s+(take|increase|decrease|stop\s+taking)\b[\s\S]{0,40}\b(mg|medication|dose|tablets?))\b/i,
  /\b(i\s+diagnose|your\s+diagnosis\s+is|you\s+(likely\s+)?have\s+(diabetes|cancer|hypothyroidism|pcos))\b/i,
  /\b(you\s+(likely\s+)?have\s+(a\s+)?thyroid\s+(issue|problem|condition|disorder)|thyroid\s+(issue|problem|condition|disorder)\s+(is|looks|suggests|indicates))\b/i,
];

const OUTPUT_EXTREME_PATTERNS: RegExp[] = [
  /\b((try|do)\s+a\s+(water|dry)\s+fast|skip\s+meals\s+to\s+lose|purg(e|ing)\s+(is|can\s+be)\s+(effective|helpful)|make\s+yourself\s+(sick|throw\s+up|vomit))\b/i,
  /\b(water\s+only\s+for\s+(\d+|a|one|two|three|four|five|six|twelve|twenty|twenty-four|24)\s+(hours?|hrs?))\b/i,
];

export interface PostResult {
  blocked: boolean;
  category: SafetyCategory;
  reason: string | null;
  /** Numeric violations found even when not blocking (logged upstream). */
  violations: NumericRuleViolation[];
}

export function post(text: string, ctx?: { userId?: string }): PostResult {
  const medicalHit = findMatch(text, OUTPUT_MEDICAL_PATTERNS);
  const extremeHit = findMatch(text, OUTPUT_EXTREME_PATTERNS);
  const patternHit = medicalHit ?? extremeHit;
  const numeric = NumericRules.check(text);

  if (!patternHit && numeric.ok) {
    return { blocked: false, category: 'safe', reason: null, violations: [] };
  }

  const reason = patternHit
    ? `output pattern: ${patternHit}`
    : numeric.violations.map((v) => v.detail).join('; ');
  const category: SafetyCategory = medicalHit ? 'medical' : 'extremeDiet';

  void writeGuardrailAudit({
    userId: ctx?.userId ?? 'anonymous',
    stage: 'post',
    category,
    reason,
  });
  return { blocked: true, category, reason, violations: numeric.violations };
}
