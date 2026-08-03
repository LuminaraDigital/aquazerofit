/**
 * AquaZeroFit shared domain types.
 * Mirrors AQF-06 Data Model and Database Schema v2.0.
 * Entities are documents in Cosmos-style containers; the local dev store
 * uses the same shapes so the model is portable (see AQF-04 storage strategy).
 */

// ---------- Enums / controlled vocabularies ----------

export type Sex = 'male' | 'female' | 'unspecified';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
export type ExerciseExperience = 'beginner' | 'intermediate' | 'advanced';
export type UnitPreference = 'metric' | 'imperial';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type UserRole = 'user' | 'admin';
export type UserTier = 'free' | 'premium';

export const DIETARY_PREFERENCES = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'halal',
  'kosher',
  'glutenFree',
  'dairyFree',
  'lowCarb',
  'highProtein',
] as const;
export type DietaryPreference = (typeof DIETARY_PREFERENCES)[number];

export const ALLERGENS = [
  'peanuts',
  'treeNuts',
  'milk',
  'eggs',
  'fish',
  'shellfish',
  'soy',
  'wheat',
  'sesame',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const EQUIPMENT = [
  'none',
  'dumbbells',
  'resistanceBands',
  'kettlebell',
  'pullUpBar',
  'bench',
  'yogaMat',
  'jumpRope',
  // wger integration (Phase 1): values appended only — never reorder or rename
  // the entries above; persisted profiles reference them.
  'barbell',
  'ezBar',
  'cableMachine',
  'smithMachine',
  'swissBall',
  'inclineBench',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

// ---------- users container ----------

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  tier: UserTier;
  displayName: string;
  tgId?: number; // unique when present (Telegram link)
  tgUsername?: string;
  timezone?: string; // IANA name (e.g. 'Australia/Sydney'); optional, set via PATCH /me
  createdAt: string;
  deletionRequestedAt?: string | null;
}

export interface ConsentState {
  wellnessDataProcessing: boolean;
  aiPersonalisation: boolean;
  anonymisedAnalytics: boolean;
  reminders: boolean;
  updatedAt: string;
}

// ---------- profiles container ----------

export interface WellnessProfile {
  userId: string;
  weightKg: number; // 30–300, canonical kg
  heightCm: number; // 100–250, canonical cm
  age: number; // 16–100
  sex: Sex;
  goal: Goal;
  activityLevel: ActivityLevel;
  exerciseExperience: ExerciseExperience;
  dietaryPreferences: DietaryPreference[];
  allergies: Allergen[];
  equipment: Equipment[];
  unitPreference: UnitPreference;
  targetWeightKg?: number;
  updatedAt: string;
}

export interface DerivedTargets {
  userId: string;
  bmr: number;
  tdee: number;
  kcalTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  clamped: boolean;
  clampReason: string | null;
  computedAt: string;
  formulaVersion: string;
}

// ---------- content container ----------

export interface FoodNutrients {
  kcal: number; // per 100 g
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Food {
  id: string;
  type: 'food';
  name: string;
  brand?: string;
  category: string;
  per100g: FoodNutrients;
  commonServings: { label: string; grams: number }[];
  allergens: Allergen[];
  source: string; // dataset identifier per AQF-12
  licence: string;
  // wger/OFF ingestion (Phase 4): optional enrichment fields.
  barcode?: string; // OFF `code` / EAN-13 when known
  nutriscore?: 'a' | 'b' | 'c' | 'd' | 'e';
  isVegan?: boolean;
  isVegetarian?: boolean;
  sourceUrl?: string; // provenance link (e.g. OFF product page)
}

export interface RecipeIngredient {
  foodId?: string;
  name: string;
  quantity: string;
  grams: number;
}

export interface Recipe {
  id: string;
  type: 'recipe';
  name: string;
  description: string;
  imageUrl?: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  perServing: FoodNutrients;
  ingredients: RecipeIngredient[];
  method: string[];
  tags: string[];
  suitableFor: DietaryPreference[];
  allergens: Allergen[];
  source: string;
  licence: string;
}

export interface ExerciseMedia {
  kind: 'image' | 'video';
  url: string;
  caption?: string;
  /** Pixel-level provenance. Optional so existing wger/API consumers remain compatible. */
  source?: 'wger' | 'aquazerofit';
  licence?: string;
  licenceAuthor?: string;
  licenceUrl?: string;
  attributionText?: string;
  isAiGenerated?: boolean;
}

export interface Exercise {
  id: string;
  type: 'exercise';
  name: string;
  description: string;
  category: 'strength' | 'cardio' | 'mobility' | 'core';
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: Equipment[];
  difficulty: ExerciseExperience;
  media: ExerciseMedia[];
  // Attribution fields are never stripped (AQF-12 obligation).
  licence: string;
  licenceAuthor: string;
  sourceId: string;
  // wger integration (Phase 1): provenance + variation metadata.
  wgerUuid?: string; // wger exercise base UUID — the stable upsert key (never the integer id)
  variationGroup?: string | null; // wger variation_group UUID; exercises sharing it are interchangeable
  licenceUrl?: string; // deed URL of the record's own CC licence
  isAiGeneratedMedia?: boolean; // wger image.is_ai_generated flag
}

/** wger licence reference (https://wger.de/api/v2/license/) — kept for attribution rendering. */
export interface WgerLicence {
  id: number;
  shortName: string; // e.g. 'CC-BY-SA 3'
  fullName: string;
  url: string;
}

export interface AchievementDefinition {
  id: string;
  type: 'achievementDefinition';
  name: string;
  description: string;
  icon: string;
  rule:
    | { kind: 'streak'; days: number }
    | { kind: 'weightLoss'; kg: number }
    | { kind: 'workoutsCompleted'; count: number }
    | { kind: 'mealsLogged'; count: number }
    | { kind: 'firstAction'; action: 'mealLog' | 'weightLog' | 'workout' | 'profile' };
}

// ---------- logs container ----------

export interface MealLogItem {
  foodId?: string;
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealLog {
  id: string;
  userId: string;
  type: 'mealLog';
  mealType: MealType;
  items: MealLogItem[];
  totalKcal: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  source: 'manual' | 'photo' | 'recommendation';
  visionJobId?: string;
  loggedAt: string; // ISO UTC
  localDate: string; // YYYY-MM-DD in the user's timezone
}

export interface WaterLog {
  id: string;
  userId: string;
  type: 'waterLog';
  amountMl: number;
  loggedAt: string;
  localDate: string;
}

export interface WeightLog {
  id: string;
  userId: string;
  type: 'weightLog';
  weightKg: number;
  note?: string;
  loggedAt: string;
  localDate: string; // one canonical entry per user per local date (upsert)
}

// ---------- plans container ----------

export interface SlotEntry {
  id: string;
  exerciseId: string;
  sets: number;
  reps: number;
  restSeconds: number;
  notes?: string;
  // Phase 2 (wger training-engine patterns): load/RIR targets and rep ranges.
  weightKg?: number | null; // null = bodyweight / not prescribed
  rir?: number | null; // reps in reserve target (0–9.5, step 0.5)
  repsMax?: number | null; // when set, `reps`..`repsMax` is a rep range
}

export interface PlanSlot {
  order: number;
  entries: SlotEntry[];
}

export interface PlanDay {
  order: number; // 1..7
  focus: string; // e.g. 'Full Body Strength', 'Rest', 'Cardio'
  isRest: boolean;
  slots: PlanSlot[];
  // Phase 2: when true the day only advances once its session has logged sets
  // (wger `need_logs_to_advance` schedule-drift pattern).
  needLogsToAdvance?: boolean;
}

export interface ProgressionRule {
  slotEntryId: string;
  kind: 'weight' | 'reps' | 'sets' | 'rest' | 'rir';
  iteration: number;
  value: number;
  // Phase 2 (wger progression-as-data patterns). All optional — a rule without
  // them keeps the legacy behaviour: `value` is the absolute target.
  op?: 'add' | 'subtract' | 'replace'; // absent = legacy absolute-value behaviour
  step?: 'abs' | 'percent'; // default 'abs'; 'percent' interprets value as a %
  repeat?: boolean; // re-apply this rule on every later iteration
  requires?: ('weight' | 'reps' | 'sets' | 'rest' | 'rir')[]; // autoregulation:
  // apply only when the previous iteration's logs met these targets
}

export interface TrainingPlan {
  id: string;
  userId: string;
  type: 'trainingPlan';
  name: string;
  startDate: string;
  endDate: string | null;
  currentIteration: number;
  days: PlanDay[];
  progressionRules: ProgressionRule[];
  generatedBy: AiMetadata | null;
  createdAt: string;
}

/** Per-set actuals (Phase 2): history survives plan edits and feeds drift analysis. */
export interface SetLog {
  set: number; // 1-based set number within the exercise
  reps: number;
  weightKg?: number | null;
  rir?: number | null;
  completed: boolean;
}

export interface SessionExercise {
  exerciseId: string;
  name: string;
  setsPlanned: number;
  setsCompleted: number;
  reps: number;
  restSeconds: number;
  skipped: boolean;
  // Phase 2: targets captured at plan resolution time (log target AND actual).
  targetWeightKg?: number | null;
  targetReps?: number | null;
  targetRir?: number | null;
  // Actuals (exercise-level rollup; per-set detail in setLogs).
  weightKg?: number | null;
  rir?: number | null;
  setLogs?: SetLog[];
}

export interface WorkoutSession {
  id: string;
  userId: string;
  type: 'workoutSession';
  planId: string | null;
  planDayOrder: number | null;
  focus: string;
  exercises: SessionExercise[];
  status: 'pending' | 'inProgress' | 'completed' | 'skipped';
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  kcalBurned: number | null;
  localDate: string;
}

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

// ---------- ledger container ----------

export interface CreditTransaction {
  id: string;
  userId: string;
  type: 'creditTransaction';
  kind: 'grant' | 'reserve' | 'commit' | 'release' | 'purchase';
  amount: number; // positive for grant/release/purchase, negative for commit
  reservationId?: string;
  reason: string;
  createdAt: string;
}

// ---------- audit container ----------

export interface AuditEvent {
  id: string;
  userId: string;
  type: 'authEvent' | 'dataAccessEvent' | 'guardrailTrigger';
  action: string;
  detail?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

// ---------- progress / analytics DTOs ----------

export interface DailyNutrition {
  date: string;
  kcalTarget: number;
  kcalConsumed: number;
  kcalBurned: number;
  kcalNet: number;
  kcalRemaining: number;
  proteinG: { consumed: number; target: number };
  carbsG: { consumed: number; target: number };
  fatG: { consumed: number; target: number };
  waterMl: { consumed: number; target: number };
  meals: Record<MealType, MealLog[]>;
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface ProgressSummary {
  currentWeightKg: number | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  weightSeries: TrendPoint[];
  streakDays: number;
  workoutsCompleted: number;
  totalKcalBurned: number;
  achievements: { definition: AchievementDefinition; earnedAt: string | null }[];
}

// ---------- auth DTOs ----------

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  tier: UserTier;
  emailVerified: boolean;
  hasProfile: boolean;
  telegramLinked: boolean;
  timezone?: string; // IANA name; optional, set via PATCH /me
  createdAt: string;
}

// ---------- growth: buddy challenges + share telemetry ----------

export const BUDDY_CHALLENGE_KINDS = ['logging_streak', 'workouts', 'meal_logs'] as const;
export type BuddyChallengeKind = (typeof BUDDY_CHALLENGE_KINDS)[number];

export const BUDDY_CHALLENGE_STATUSES = ['open', 'active', 'completed', 'expired'] as const;
export type BuddyChallengeStatus = (typeof BUDDY_CHALLENGE_STATUSES)[number];

export interface BuddyChallengeMember {
  userId: string;
  displayName: string;
  joinedAt: string;
  /** Distinct qualifying local dates counted toward the challenge target. */
  progressDays: number;
}

export interface BuddyChallenge {
  type: 'buddyChallenge';
  id: string;
  code: string;
  kind: BuddyChallengeKind;
  /** Days of qualifying activity required to win. */
  targetDays: number;
  /** Calendar length of the challenge window. */
  durationDays: number;
  status: BuddyChallengeStatus;
  createdBy: string;
  members: BuddyChallengeMember[];
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
}

export const GROWTH_EVENT_NAMES = [
  'share_opened',
  'share_copied',
  'share_native',
  'share_telegram',
  'challenge_created',
  'challenge_joined',
  'challenge_shared',
  'invite_captured',
] as const;
export type GrowthEventName = (typeof GROWTH_EVENT_NAMES)[number];

export interface GrowthEvent {
  type: 'growthEvent';
  id: string;
  userId: string | null;
  name: GrowthEventName;
  /** Free-form context (share kind, challenge code, channel). */
  props: Record<string, string | number | boolean | null>;
  /** Attribution snapshot captured on the client at event time. */
  attribution: {
    ref: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    challengeCode: string | null;
  };
  createdAt: string;
}
