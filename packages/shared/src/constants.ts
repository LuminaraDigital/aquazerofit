/**
 * Normative constants per AQF-09 §2.2 TargetCalculator and AQF-06 validation rules.
 * These values are safety-relevant; changes require an ADR (see AQF-05).
 */

export const FORMULA_VERSION = 'mifflin-stjeor-v1';

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
} as const;

/** kcal floors: recommendation engine never proposes intake below these (FR-031). */
export const KCAL_FLOOR = {
  female: 1200,
  male: 1500,
  unspecified: 1200,
} as const;

/** Weekly target loss bounds as a fraction of bodyweight (AQF-09 §2.2). */
export const WEEKLY_LOSS_FRACTION = { min: 0.005, max: 0.01 } as const;

/** Approximate kcal per kg of bodyweight change. */
export const KCAL_PER_KG = 7700;

/** Protein grams per kg of bodyweight by goal. */
export const PROTEIN_G_PER_KG = {
  lose: 2.0,
  maintain: 1.6,
  gain: 2.2,
} as const;

/** Fat supplies at least this fraction of kcal. */
export const FAT_KCAL_FRACTION_MIN = 0.2;

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Daily water target: ml per kg bodyweight, clamped to a sensible band. */
export const WATER_ML_PER_KG = 33;
export const WATER_ML_MIN = 1500;
export const WATER_ML_MAX = 4000;

/** Biometric safe ranges (AQF-06 §3.1). */
export const RANGES = {
  weightKg: { min: 30, max: 300 },
  heightCm: { min: 100, max: 250 },
  age: { min: 16, max: 100 },
} as const;

/** Pagination (AQF-07 §1). */
export const MAX_PAGE_LIMIT = 100;

/** Meal photo constraints (FR-012). */
export const MEAL_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const MEAL_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/heic'] as const;

/** Telegram launch data freshness window in seconds (AQF-09 §2.1). */
export const TG_AUTH_MAX_AGE_SECONDS = 600;

/** Credit costs per AI task (business record; gateway budget is the hard ceiling). */
export const CREDIT_COSTS = {
  chatTurn: 1,
  mealPhoto: 3,
  mealRecommendation: 2,
  planGeneration: 5,
  recipeGeneration: 2,
  progressInsight: 1,
} as const;
export type CreditTask = keyof typeof CREDIT_COSTS;

export const FREE_TIER_DAILY_CREDITS = 50;

/** Logical model groups (AQF-09 §2.3): app code never names real providers. */
export const MODEL_GROUPS = {
  visionPrimary: 'visionPrimary',
  chatFast: 'chatFast',
  planStructured: 'planStructured',
  safetyCheap: 'safetyCheap',
  insightBatch: 'insightBatch',
} as const;
export type ModelGroup = keyof typeof MODEL_GROUPS;

/**
 * AI memory bounds (memory feature Phase 1). Caps are enforced on every write:
 * when exceeded, the oldest facts by updatedAt are evicted; rejected facts are
 * retained only MEMORY_REJECTED_RETENTION_DAYS (swept opportunistically on
 * write) so the extractor can avoid re-suggesting them without hoarding data.
 */
export const MEMORY_MAX_FACTS_CONFIRMED = 60;
export const MEMORY_MAX_FACTS_SUGGESTED = 20;
export const MEMORY_FACT_MAX_CHARS = 280;
export const MEMORY_SUMMARY_MAX_CHARS = 1200;
export const MEMORY_REJECTED_RETENTION_DAYS = 30;

/**
 * Memory extraction (memory feature Phase 2). Every coach turn may suggest at
 * most MEMORY_EXTRACTION_MAX_FACTS_PER_TURN facts (suggested status — never
 * auto-confirmed). The rolling summary is regenerated when the confirmed-fact
 * count has moved by MEMORY_SUMMARY_REFRESH_FACT_DELTA since the last summary
 * write, or when the summary is empty and MEMORY_SUMMARY_MIN_FACTS confirmed
 * facts exist.
 */
export const MEMORY_EXTRACTION_MAX_FACTS_PER_TURN = 3;
export const MEMORY_SUMMARY_REFRESH_FACT_DELTA = 5;
export const MEMORY_SUMMARY_MIN_FACTS = 3;

/**
 * Chat history replay budget (AQF-07 §3.4 streaming turn). The coach receives
 * the last CHAT_HISTORY_MAX_TURNS user/assistant exchanges, truncated
 * oldest-first so total history text stays under CHAT_HISTORY_MAX_CHARS —
 * bounded prompt cost regardless of session length.
 */
export const CHAT_HISTORY_MAX_TURNS = 12;
export const CHAT_HISTORY_MAX_CHARS = 6000;

/** Persistent wellness disclaimer (AQF-11): product boundary, not decoration. */
export const WELLNESS_DISCLAIMER =
  'AquaZeroFit provides general wellness and fitness support only. It does not provide medical diagnosis, treatment or professional healthcare advice.';

/**
 * AGPL-3.0 §13 network-use clause. Because AquaZeroFit is offered to users over
 * a network, every deployment must offer those users the corresponding source
 * of the version they are interacting with. A reachable "Source code" link in
 * the running application is how this obligation is discharged — a fork that
 * removes it, or points it at an unmodified upstream, is in violation.
 * Deployments running modified source MUST repoint this at their own repository.
 */
export const SOURCE_CODE_URL = 'https://github.com/LuminaraDigital/aquazerofit';

export const CRISIS_SIGNPOST =
  'It sounds like you may be going through something serious. AquaZeroFit is not able to help with this, but you deserve real support: please reach out to a healthcare professional, or contact Lifeline on 13 11 14 (Australia) or your local crisis service.';
