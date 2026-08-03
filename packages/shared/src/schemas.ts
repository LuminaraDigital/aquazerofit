/**
 * Shared zod validation schemas (FE-11): the same schemas validate on the
 * client for inline feedback and on the server as the authoritative check.
 */
import { z } from 'zod';
import {
  ALLERGENS,
  DIETARY_PREFERENCES,
  EQUIPMENT,
  MEMORY_FACT_CATEGORIES,
} from './types';
import { MEMORY_FACT_MAX_CHARS, RANGES } from './constants';

// ---------- auth ----------

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a digit');

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().min(1).max(60).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export const passwordResetRequestSchema = z.object({ email: z.string().email() });

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(10).max(200),
  newPassword: passwordSchema,
});

export const telegramAuthSchema = z.object({ initData: z.string().min(10) });

// ---------- profile ----------

export const profileSchema = z.object({
  weightKg: z.number().min(RANGES.weightKg.min).max(RANGES.weightKg.max),
  heightCm: z.number().min(RANGES.heightCm.min).max(RANGES.heightCm.max),
  age: z.number().int().min(RANGES.age.min).max(RANGES.age.max),
  sex: z.enum(['male', 'female', 'unspecified']).default('unspecified'),
  goal: z.enum(['lose', 'maintain', 'gain']),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'veryActive']),
  exerciseExperience: z.enum(['beginner', 'intermediate', 'advanced']),
  dietaryPreferences: z.array(z.enum(DIETARY_PREFERENCES)).default([]),
  allergies: z.array(z.enum(ALLERGENS)).default([]),
  equipment: z.array(z.enum(EQUIPMENT)).default(['none']),
  unitPreference: z.enum(['metric', 'imperial']).default('metric'),
  targetWeightKg: z
    .number()
    .min(RANGES.weightKg.min)
    .max(RANGES.weightKg.max)
    .optional(),
});
export type ProfileInput = z.infer<typeof profileSchema>;

// ---------- logging ----------

export const mealLogItemSchema = z.object({
  foodId: z.string().optional(),
  name: z.string().min(1).max(120),
  grams: z.number().positive().max(5000),
  kcal: z.number().min(0).max(10000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
});

export const createMealLogSchema = z.object({
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  items: z.array(mealLogItemSchema).min(1).max(30),
  loggedAt: z.string().datetime({ offset: true }).optional(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CreateMealLogInput = z.infer<typeof createMealLogSchema>;

export const updateMealLogSchema = createMealLogSchema.partial({
  mealType: true,
  items: true,
  localDate: true,
});

export const waterLogSchema = z.object({
  amountMl: z.number().int().min(1).max(3000),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const weightLogSchema = z.object({
  weightKg: z.number().min(RANGES.weightKg.min).max(RANGES.weightKg.max),
  note: z.string().max(300).optional(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ---------- training load field schemas (Phase 2 hard caps, AQF-11) ----------
// Safety-relevant bounds: no prompt output or client payload may produce
// absurd loads. Shared by plan, session-log and progression validation.

/** Working weight in kg (0 = bodyweight). */
export const weightKgLoadSchema = z.number().min(0).max(1000);
/** Reps in reserve, half-step granularity. */
export const rirSchema = z.number().min(0).max(9.5).multipleOf(0.5);
export const repsSchema = z.number().int().min(1).max(100);
export const setsSchema = z.number().int().min(1).max(20);
export const restSecondsSchema = z.number().int().min(0).max(900);

/** Per-set actuals logged during a session (matches shared `SetLog`). */
export const setLogSchema = z.object({
  set: z.number().int().min(1).max(20),
  reps: repsSchema,
  weightKg: weightKgLoadSchema.nullable().optional(),
  rir: rirSchema.nullable().optional(),
  completed: z.boolean(),
});
export type SetLogInput = z.infer<typeof setLogSchema>;

// ---------- vision ----------

export const confirmVisionSchema = z.object({
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(mealLogItemSchema).min(1).max(30),
});

// ---------- recommendations / plans ----------

export const mealRecommendationRequestSchema = z.object({
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const recommendationFeedbackSchema = z.object({
  feedback: z.enum(['up', 'down']),
});

export const generatePlanSchema = z.object({
  daysPerWeek: z.number().int().min(2).max(6).default(4),
  focus: z.enum(['weightLoss', 'strength', 'general']).default('general'),
});

export const completeWorkoutSchema = z.object({
  exercises: z
    .array(
      z.object({
        exerciseId: z.string(),
        setsCompleted: z.number().int().min(0).max(20),
        skipped: z.boolean().default(false),
        // Phase 2 optional actuals (target+actual logging); all optional so
        // legacy clients keep passing validation unchanged.
        weightKg: weightKgLoadSchema.nullable().optional(),
        rir: rirSchema.nullable().optional(),
        setLogs: z.array(setLogSchema).max(20).optional(),
      }),
    )
    .min(1),
  durationMinutes: z.number().int().min(1).max(300),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const swapExerciseSchema = z.object({
  exerciseId: z.string(),
});

// ---------- chat ----------

export const chatMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

// ---------- identity (PATCH /me) ----------

/**
 * Same bounds as registerSchema.displayName (1–60 chars) but trimmed first, so
 * "   " cannot become a display name via PATCH (registration falls back to the
 * email prefix instead, which PATCH has no equivalent for).
 */
export const displayNameSchema = z.string().trim().min(1).max(60);

/**
 * Loose IANA timezone check: the runtime's Intl database is the authority
 * rather than a hand-rolled list, so newly-added zones keep validating.
 */
export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid IANA timezone name (e.g. Australia/Sydney)' },
  );

export const updateIdentitySchema = z.object({
  displayName: displayNameSchema.optional(),
  timezone: timezoneSchema.optional(),
});
export type UpdateIdentityInput = z.infer<typeof updateIdentitySchema>;

// ---------- AI memory (memory feature Phase 1) ----------

export const memoryFactTextSchema = z.string().trim().min(1).max(MEMORY_FACT_MAX_CHARS);

export const addMemoryFactSchema = z.object({
  text: memoryFactTextSchema,
  category: z.enum(MEMORY_FACT_CATEGORIES),
});
export type AddMemoryFactInput = z.infer<typeof addMemoryFactSchema>;

/**
 * PATCH on a fact: confirm/reject a suggestion or edit its wording. 'suggested'
 * is deliberately not settable — only the extraction pipeline creates
 * suggestions; a user touching a fact always resolves it.
 */
export const updateMemoryFactSchema = z
  .object({
    status: z.enum(['confirmed', 'rejected']).optional(),
    text: memoryFactTextSchema.optional(),
  })
  .refine((v) => v.status !== undefined || v.text !== undefined, {
    message: 'Provide status and/or text',
  });
export type UpdateMemoryFactInput = z.infer<typeof updateMemoryFactSchema>;

// ---------- consents ----------

export const consentsSchema = z.object({
  wellnessDataProcessing: z.boolean(),
  aiPersonalisation: z.boolean(),
  anonymisedAnalytics: z.boolean(),
  reminders: z.boolean(),
});

// ---------- query helpers ----------

export const dateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const rangeQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
});

// ---------- growth ----------

export const createBuddyChallengeSchema = z.object({
  kind: z.enum(['logging_streak', 'workouts', 'meal_logs']),
  targetDays: z.number().int().min(3).max(90).default(7),
  durationDays: z.number().int().min(3).max(90).default(14),
});
export type CreateBuddyChallengeInput = z.infer<typeof createBuddyChallengeSchema>;

export const joinBuddyChallengeSchema = z.object({
  code: z
    .string()
    .min(4)
    .max(24)
    .transform((s) => s.trim().toUpperCase().replace(/\s+/g, '')),
});
export type JoinBuddyChallengeInput = z.infer<typeof joinBuddyChallengeSchema>;

/** Bounds for the unauthenticated growth-event payload (see `props` below). */
export const GROWTH_EVENT_MAX_PROPS = 12;
export const GROWTH_EVENT_MAX_KEY_CHARS = 40;
export const GROWTH_EVENT_MAX_VALUE_CHARS = 200;

export const growthEventSchema = z.object({
  name: z.enum([
    'share_opened',
    'share_copied',
    'share_native',
    'share_telegram',
    'challenge_created',
    'challenge_joined',
    'challenge_shared',
    'invite_captured',
  ]),
  /**
   * Bounded on every axis. The endpoint that accepts this is unauthenticated,
   * so an uncapped record would let any caller persist megabytes per request
   * into a container the store keeps resident in memory. Keys and values are
   * both capped, and the key count with them.
   */
  props: z
    .record(
      z.string().max(GROWTH_EVENT_MAX_KEY_CHARS),
      z.union([
        z.string().max(GROWTH_EVENT_MAX_VALUE_CHARS),
        z.number().finite(),
        z.boolean(),
        z.null(),
      ]),
    )
    .refine((r) => Object.keys(r).length <= GROWTH_EVENT_MAX_PROPS, {
      message: `At most ${GROWTH_EVENT_MAX_PROPS} properties`,
    })
    .default({}),
  attribution: z
    .object({
      ref: z.string().max(80).nullable().optional(),
      utmSource: z.string().max(80).nullable().optional(),
      utmMedium: z.string().max(80).nullable().optional(),
      utmCampaign: z.string().max(120).nullable().optional(),
      challengeCode: z.string().max(24).nullable().optional(),
    })
    .default({}),
});
export type GrowthEventInput = z.infer<typeof growthEventSchema>;
