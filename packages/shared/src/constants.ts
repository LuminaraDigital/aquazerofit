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
  /**
   * One swap suggestion on the planStructured lane. Priced at 1 rather than
   * near planGeneration because it reasons over a single slot, not a week —
   * and because it is charged only on the branch that actually calls the
   * model: a swap served from the deterministic variation group is free.
   */
  exerciseSwap: 1,
  /**
   * The fact-extraction pass that runs after a coach turn, plus its amortised
   * rolling-summary refresh. Charged separately from chatTurn rather than
   * folded into it, because it runs only for accounts with aiPersonalisation
   * consent on — pricing it into every turn would bill the users who opted
   * out for a model call their consent setting prevents.
   */
  memoryExtraction: 1,
} as const;
export type CreditTask = keyof typeof CREDIT_COSTS;

/**
 * The free daily allowance — and the actual paywall.
 *
 * Ten credits is three meal-photo scans, or ten coach messages, or two AI
 * training plans. That is deliberately enough to experience every feature and
 * not enough to live on, which is the shape that converts: nothing is removed
 * from the free tier, so the app never has to take something away from
 * somebody who already had it, and the limit a user meets is one they can see
 * coming and fix.
 *
 * It was 50, which at three scans a day is a fortnight of AI for every signup
 * on an unfunded product, and gave a paying user nothing to buy.
 */
export const FREE_TIER_DAILY_CREDITS = 10;

/**
 * The paid daily allowance. Fifteen times the free tier.
 *
 * Sized against the margin rather than against a round number. A chat turn on
 * the 70B lane costs roughly $0.0015 all-in, so a subscriber who genuinely
 * spent this every day for a month runs to about $7 — against a $9.99
 * subscription that nets nearer $8.49 after the store's cut. That is thin but
 * positive. At the 300 this started as, the same user costs about $14 and the
 * plan loses money on precisely the people most likely to buy it: a cap only
 * matters for the heaviest users, so it has to be set where the heaviest user
 * is still profitable, not where the median one is.
 *
 * Deliberately the conservative direction of travel. Raising a published
 * allowance is a pleasant announcement; lowering one is a broken promise, and
 * the users who notice are the subscribers.
 *
 * Not the only ceiling: this bounds one account, and the deployment-level
 * AZF_DAILY_TOKEN_BUDGET bounds the aggregate. Neither substitutes for the
 * other — a thousand well-behaved subscribers are still a bill nobody capped.
 */
export const PREMIUM_TIER_DAILY_CREDITS = 150;

/** Daily allowance for a tier. The single source both the grant and the UI read. */
export function dailyCreditsFor(tier: 'free' | 'premium'): number {
  return tier === 'premium' ? PREMIUM_TIER_DAILY_CREDITS : FREE_TIER_DAILY_CREDITS;
}

/**
 * Ceiling on a carried-over balance.
 *
 * Unspent credits carry over, and the balance is a plain fold with no upper
 * bound — so an account that opened the plan screen daily for a month without
 * spending banked a month of grants and could then discharge the lot in one
 * sitting, throttled only by the per-minute lane. The daily grant is what
 * bounds cost per user per day; without a ceiling it bounded nothing but the
 * long-run average.
 *
 * Two days' worth: enough that skipping a day is not punished, not enough to
 * stockpile. The grant tops up TOWARD this figure and never past it.
 */
export function maxBankedCreditsFor(tier: 'free' | 'premium'): number {
  return dailyCreditsFor(tier) * 2;
}

/**
 * Kept as the free-tier figure because that is what every existing caller
 * meant by it. New code should ask `maxBankedCreditsFor(tier)` — a premium
 * account clamped to the free ceiling would lose most of what it bought on the
 * first day it did not spend.
 */
export const MAX_BANKED_CREDITS = maxBankedCreditsFor('free');

/**
 * Consistency model (recovery-aware streak, AQF-11 §6 weight-neutral copy).
 *
 * GRACE is why a missed day does not reset the run: the documented harm is not
 * the gap itself but the punishment displayed for it. One absorbed day turns
 * "you broke it" into "you are still going", which is both kinder and true.
 */
export const CONSISTENCY_WINDOW_DAYS = 28;
export const CONSISTENCY_GRACE_DAYS = 1;
/** Run length at which `building` becomes `steady`. */
export const CONSISTENCY_STEADY_DAYS = 7;

/** Trailing period a progress insight describes. */
export const INSIGHT_PERIOD_DAYS = 7;
/** Minimum active days in the period before an insight is worth generating. */
export const INSIGHT_MIN_ACTIVE_DAYS = 2;

/**
 * Readiness bands (Protect / Maintain / Progress) and the working-volume
 * multiplier each applies. Protect deliberately reduces load rather than
 * holding a user to a plan built for a week they did not have.
 */
export const READINESS_PROTECT_MAX_SCORE = 39;
export const READINESS_MAINTAIN_MAX_SCORE = 74;
export const READINESS_VOLUME_MULTIPLIER = {
  protect: 0.6,
  maintain: 1,
  progress: 1.1,
} as const;

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
 * most MEMORY_EXTRACTION_MAX_FACTS_PER_TURN facts (suggested status - never
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
 * oldest-first so total history text stays under CHAT_HISTORY_MAX_CHARS -
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
 * the running application is how this obligation is discharged - a fork that
 * removes it, or points it at an unmodified upstream, is in violation.
 * Deployments running modified source MUST repoint this at their own repository.
 */
export const SOURCE_CODE_URL = 'https://github.com/LuminaraDigital/aquazerofit';

/**
 * Crisis signposting (AQF-11 §4).
 *
 * The refusal itself is the same everywhere — what changes is the number at
 * the end of it. A person in Manchester told to ring an Australian landline
 * has been given a refusal dressed as help, which is worse than a refusal, and
 * Play's health-content policy reads it the same way.
 *
 * The map is deliberately small and factual: national, free, staffed lines
 * only. Anything not listed gets the directory rather than a guess, because a
 * wrong number is the one failure mode this feature exists to prevent.
 */
const CRISIS_LEAD =
  'It sounds like you may be going through something serious. AquaZeroFit is not able to help with this, but you deserve real support: please reach out to a healthcare professional, or ';

export interface CrisisHelpline {
  /** How the service is named to the user. */
  name: string;
  /** The number to dial, formatted as that country writes it. */
  phone: string;
  /** Country label shown in parentheses. */
  region: string;
}

/** ISO 3166-1 alpha-2 region → national crisis line. */
export const CRISIS_HELPLINES: Readonly<Record<string, CrisisHelpline>> = {
  AU: { name: 'Lifeline', phone: '13 11 14', region: 'Australia' },
  US: { name: 'the 988 Suicide & Crisis Lifeline', phone: '988', region: 'United States' },
  CA: { name: 'the 988 Suicide & Crisis Helpline', phone: '988', region: 'Canada' },
  GB: { name: 'Samaritans', phone: '116 123', region: 'United Kingdom' },
  IE: { name: 'Samaritans', phone: '116 123', region: 'Ireland' },
  NZ: { name: 'Need to talk?', phone: '1737', region: 'New Zealand' },
  IN: { name: 'Tele-MANAS', phone: '14416', region: 'India' },
} as const;

/** Where an unmapped region is sent: a maintained, country-aware directory. */
export const CRISIS_HELPLINE_DIRECTORY_URL = 'https://findahelpline.com';

/** Region used when the caller told us nothing — the product's home market. */
export const CRISIS_DEFAULT_REGION = 'AU';

/**
 * Pull the ISO 3166-1 alpha-2 region out of a locale-ish string.
 *
 * Accepts everything a client might actually send: a BCP 47 tag (`en-AU`), a
 * POSIX-flavoured one (`en_GB`), a tag carrying a script subtag
 * (`zh-Hant-TW`), and a whole Accept-Language header with quality values
 * (`en-GB,en;q=0.9`). Case and separator are irrelevant.
 *
 * Tags are scanned in the order sent — browsers order Accept-Language by
 * descending preference — and the first region subtag found wins. Returns null
 * when there is no region to find, which is a different answer from "a region
 * we have no line for": the first falls back to AU, the second to the
 * directory.
 */
export function regionFromLocale(locale: string | null | undefined): string | null {
  if (typeof locale !== 'string' || locale.trim() === '') return null;

  for (const entry of locale.split(',')) {
    // Drop the q-value, normalise the POSIX underscore.
    const tag = entry.split(';')[0]!.trim().replace(/_/g, '-');
    if (tag === '' || tag === '*') continue;

    // subtags[0] is the language; a 2-alpha subtag after it is the region.
    // 4-alpha is a script (Hant), 3-alpha an extlang, 5+ a variant.
    const subtags = tag.split('-').slice(1);
    for (const subtag of subtags) {
      if (/^[A-Za-z]{2}$/.test(subtag)) return subtag.toUpperCase();
    }
  }
  return null;
}

/** The helpline for a locale, or null when its region is not one we map. */
export function crisisHelplineFor(locale: string | null | undefined): CrisisHelpline | null {
  const region = regionFromLocale(locale) ?? CRISIS_DEFAULT_REGION;
  return CRISIS_HELPLINES[region] ?? null;
}

/**
 * The crisis refusal, pointed at the caller's own country.
 *
 * No region (or an unparseable locale) yields the AU wording byte-for-byte —
 * `CRISIS_SIGNPOST` below is defined as this function's output for exactly
 * that reason, so the two can never drift.
 */
export function crisisSignpostFor(locale: string | null | undefined): string {
  const helpline = crisisHelplineFor(locale);
  if (!helpline) {
    return `${CRISIS_LEAD}find a crisis line in your country at ${CRISIS_HELPLINE_DIRECTORY_URL}.`;
  }
  return `${CRISIS_LEAD}contact ${helpline.name} on ${helpline.phone} (${helpline.region}) or your local crisis service.`;
}

/**
 * Unlocalised signpost, kept for back-compat with call sites that have no
 * locale to hand (the marketing and support pages, which are served from an
 * AU-registered product). Identical to `crisisSignpostFor(undefined)`.
 */
export const CRISIS_SIGNPOST = crisisSignpostFor(undefined);

/**
 * Aqua character kit (growth P0). The hero character is Akin with interactive
 * poses (idle / guard / lift). The AZ monogram (`/logo.png`) stays the brand mark.
 */
export const AKIN_POSES = ['idle', 'guard', 'lift'] as const;
export type AkinPose = (typeof AKIN_POSES)[number];

export const AQUA_CHARACTER = {
  id: 'akin',
  name: 'Akin',
  title: 'Coach Akin',
  tagline: 'Measured days. Grounded coaching.',
  /** Default full-body pose (idle / standing). */
  characterUrl: '/akin-idle.jpg',
  /** Alias kept for older call sites; same as idle. */
  markUrl: '/akin-idle.jpg',
  markUrl2x: '/akin-idle.jpg',
  /** AZ monogram for app chrome / wordmark pairing. */
  brandMarkUrl: '/logo.png',
  /** Pose sheet for interactive Akin stage. */
  poses: {
    idle: { url: '/akin-idle.jpg', label: 'Ready', hint: 'Standing by' },
    guard: { url: '/akin-guard.jpg', label: 'Guard', hint: 'Training focus' },
    lift: { url: '/akin-lift.jpg', label: 'Lift', hint: 'Strength work' },
  },
  /** True once enough poses exist for sticker / share loops. */
  stickerReady: true,
  catchphrases: [
    'Logged. Not guessed.',
    'Maths in the open.',
    'One meal. One win.',
    'Show up. Stay kind.',
    'Progress you can recompute.',
  ],
} as const;

/** Max members in a buddy huddle (private accountability, not a public feed). */
export const BUDDY_CHALLENGE_MAX_MEMBERS = 4;
export const BUDDY_CHALLENGE_CODE_PREFIX = 'AQUA';

/**
 * Growth telemetry retention. The events endpoint is unauthenticated, so
 * without a ceiling the audit container grows without bound — these records
 * answer "did the invite loop work", a question that expires. Swept on boot
 * and every 6 hours alongside the deletion sweep.
 */
export const GROWTH_EVENT_RETENTION_DAYS = 180;
