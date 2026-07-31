/**
 * zod schemas for the wger API v2.6 payloads consumed by the ETL mirror
 * (see wger-integration-plan.md §3). Shapes verified against the live
 * https://wger.de API on 2026-07-30.
 *
 * Design rules:
 * - Lenient at the edges: unknown keys are stripped by zod, and optional
 *   fields stay optional — wger has shipped breaking changes without
 *   deprecation windows (2.5), so the ETL must tolerate extra fields.
 * - Decimal values arrive as strings (Django Decimal serialization) and are
 *   coerced to numbers here; nulls are preserved (OFF data is sparse).
 * - UUIDs, never integer IDs, are the stable identity of imported records.
 */
import { z } from 'zod';

// ---------- reference objects ----------

export const wgerLicenceSchema = z.object({
  id: z.number().int(),
  short_name: z.string(),
  full_name: z.string(),
  url: z.string(),
});
export type WgerLicencePayload = z.infer<typeof wgerLicenceSchema>;

export const wgerCategorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
});
export type WgerCategory = z.infer<typeof wgerCategorySchema>;

export const wgerMuscleSchema = z.object({
  id: z.number().int().min(1).max(15),
  name: z.string(),
  name_en: z.string().default(''), // empty for Serratus/Trapezius/Brachialis/Obliquus/Soleus
  is_front: z.boolean(),
});
export type WgerMuscle = z.infer<typeof wgerMuscleSchema>;

export const wgerEquipmentSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});
export type WgerEquipment = z.infer<typeof wgerEquipmentSchema>;

// ---------- exerciseinfo sub-objects ----------

export const wgerExerciseImageSchema = z.object({
  id: z.number().int(),
  uuid: z.string().uuid(),
  image: z.string(), // absolute URL on wger.de — mirror locally, never hotlink
  thumbnails: z.record(z.string(), z.string()).optional(), // { small, medium, ... }
  is_main: z.boolean(),
  style: z.string(), // '1' | '2' | '3' — serialized enum on wger's side
  license: z.number().int(), // wger licence id (per-record; never assume a blanket one)
  license_author: z.string().default(''), // may be '' on legacy images (documented gray zone)
  is_ai_generated: z.boolean().optional(),
});
export type WgerExerciseImage = z.infer<typeof wgerExerciseImageSchema>;

export const wgerExerciseVideoSchema = z.object({
  id: z.number().int(),
  uuid: z.string().uuid(),
  video: z.string(), // absolute URL
  license: z.number().int(),
  license_author: z.string().default(''),
});
export type WgerExerciseVideo = z.infer<typeof wgerExerciseVideoSchema>;

export const wgerExerciseTranslationSchema = z.object({
  id: z.number().int(),
  language: z.number().int(), // wger language id (2 = English)
  name: z.string(),
  description: z.string(), // crowdsourced HTML — MUST be sanitized before use
  aliases: z.array(z.object({ alias: z.string() }).passthrough()).optional(),
  license: z.number().int(),
  license_author: z.string().default(''),
});
export type WgerExerciseTranslation = z.infer<typeof wgerExerciseTranslationSchema>;

// ---------- exerciseinfo (bulk export path: one call per exercise) ----------

export const wgerExerciseInfoSchema = z.object({
  id: z.number().int(),
  uuid: z.string().uuid(),
  category: wgerCategorySchema,
  muscles: z.array(wgerMuscleSchema),
  muscles_secondary: z.array(wgerMuscleSchema),
  equipment: z.array(wgerEquipmentSchema),
  images: z.array(wgerExerciseImageSchema),
  videos: z.array(wgerExerciseVideoSchema),
  translations: z.array(wgerExerciseTranslationSchema),
  variation_group: z.string().uuid().nullable(), // UUID string, NOT a number
  license_author: z.string().default(''),
  last_update_global: z.string(), // incremental sync cursor
});
export type WgerExerciseInfo = z.infer<typeof wgerExerciseInfoSchema>;

// ---------- deletion-log (incremental sync) ----------

export const wgerDeletionLogEntrySchema = z.object({
  model_type: z.string(), // e.g. 'base' | 'translation' | 'image'
  uuid: z.string().uuid(),
  replaced_by: z.string().uuid().nullable(),
  timestamp: z.string(),
});
export type WgerDeletionLogEntry = z.infer<typeof wgerDeletionLogEntrySchema>;

// ---------- ingredient / Open Food Facts ----------

/** Decimal-as-string → number, preserving null (OFF fields are often missing). */
const decimalOrNull = z
  .union([z.string(), z.number()])
  .nullable()
  .transform((v) => (v === null || v === '' ? null : Number(v)));

export const wgerIngredientWeightUnitSchema = z.object({
  id: z.number().int().optional(),
  amount: z.union([z.string(), z.number()]).transform(Number), // e.g. "1.000"
  unit: z.object({ id: z.number().int(), name: z.string() }).optional(),
  grams: z.number(),
});
export type WgerIngredientWeightUnit = z.infer<typeof wgerIngredientWeightUnitSchema>;

/**
 * Minimal shape for OFF/wger ingredient ingestion. wger mirrors OFF but
 * DISCARDS allergen fields — allergens_tags/traces_tags are populated only
 * when ingesting OFF directly (JSONL dump or product API), never via wger.
 */
export const wgerOffIngredientSchema = z.object({
  id: z.number().int().optional(), // absent when ingesting OFF directly
  uuid: z.string().uuid().optional(),
  code: z.string().nullable(), // barcode (EAN-13 etc.)
  name: z.string(),
  brand: z.string().optional(),
  source_name: z.string().optional(), // e.g. 'Open Food Facts'
  source_url: z.string().optional(),
  energy: z.number(), // kcal per 100 g
  protein: decimalOrNull, // g per 100 g
  carbohydrates: decimalOrNull,
  carbohydrates_sugar: decimalOrNull,
  fat: decimalOrNull,
  fat_saturated: decimalOrNull,
  fiber: decimalOrNull,
  sodium: decimalOrNull, // g per 100 g
  nutriscore: z.enum(['a', 'b', 'c', 'd', 'e']).nullable().optional(),
  is_vegan: z.boolean().nullable(),
  is_vegetarian: z.boolean().nullable(),
  allergens_tags: z.array(z.string()).optional(), // OFF direct only, best-effort
  traces_tags: z.array(z.string()).optional(), // OFF direct only, best-effort
  weight_units: z.array(wgerIngredientWeightUnitSchema).default([]), // serving sizes
  license_author: z.string().default('').optional(),
});
export type WgerOffIngredient = z.infer<typeof wgerOffIngredientSchema>;

/** Generic paginated list envelope shared by all wger v2 list endpoints. */
export const wgerPaginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    count: z.number().int(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(item),
  });
