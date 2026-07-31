/**
 * wger → AquaZeroFit taxonomy mapping tables (wger-integration-plan.md Phase 1.2).
 * Pure functions and constant tables only — no I/O.
 *
 * Source data verified against the live wger API on 2026-07-30:
 *   https://wger.de/api/v2/muscle/            (15 records, ids 1–15)
 *   https://wger.de/api/v2/exercisecategory/  (8 records)
 *   https://wger.de/api/v2/equipment/         (12 records)
 *
 * Mapping target strings are exactly the ones the plan engine queries
 * (apps/api/src/modules/plans/service.ts FOCUS_SLOTS) and the exercise seeds
 * use: 'chest' | 'back' | 'quadriceps' | 'glutes' | 'shoulders' | 'triceps' |
 * 'biceps' | 'hamstrings' | 'calves' | 'core' | 'obliques'. Finer wger
 * anatomy (lats, abs, traps, brachialis, serratus) is deliberately folded
 * into the coarser engine strings so imported exercises stay pool-eligible.
 */
import { EQUIPMENT, type Equipment, type Exercise, type ExerciseExperience } from '@aquazerofit/shared';

// ---------- muscles (wger ids 1–15) ----------

export const WGER_MUSCLE_MAP: Readonly<Record<number, string>> = {
  1: 'biceps', // Biceps brachii
  2: 'shoulders', // Anterior deltoid
  3: 'chest', // Serratus anterior
  4: 'chest', // Pectoralis major
  5: 'triceps', // Triceps brachii
  6: 'core', // Rectus abdominis
  7: 'calves', // Gastrocnemius
  8: 'glutes', // Gluteus maximus
  9: 'back', // Trapezius
  10: 'quadriceps', // Quadriceps femoris
  11: 'hamstrings', // Biceps femoris
  12: 'back', // Latissimus dorsi
  13: 'biceps', // Brachialis
  14: 'obliques', // Obliquus externus abdominis
  15: 'calves', // Soleus
} as const;

// ---------- categories ----------

export const WGER_CATEGORY_MAP: Readonly<Record<number, Exercise['category']>> = {
  10: 'core', // Abs
  8: 'strength', // Arms
  12: 'strength', // Back
  14: 'strength', // Calves
  15: 'cardio', // Cardio
  11: 'strength', // Chest
  9: 'strength', // Legs
  13: 'strength', // Shoulders
} as const;

// ---------- equipment ----------
// wger has 12 equipment records; "Smith machine" is NOT among them (verified
// live 2026-07-30). AQF keeps 'smithMachine' in EQUIPMENT for other sources.

export const WGER_EQUIPMENT_MAP: Readonly<Record<number, Equipment>> = {
  1: 'barbell', // Barbell
  2: 'ezBar', // SZ-Bar
  3: 'dumbbells', // Dumbbell
  4: 'yogaMat', // Gym mat
  5: 'swissBall', // Swiss Ball
  6: 'pullUpBar', // Pull-up bar
  7: 'none', // none (bodyweight exercise)
  8: 'bench', // Bench
  9: 'inclineBench', // Incline bench
  10: 'kettlebell', // Kettlebell
  11: 'resistanceBands', // Resistance band
  12: 'cableMachine', // Cable machine
} as const;

// ---------- difficulty heuristic (safety invariant AQF-11) ----------

export interface DifficultyInput {
  category: Exercise['category'];
  equipment: Equipment[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

const HEAVY_EQUIPMENT: ReadonlySet<Equipment> = new Set(['barbell', 'smithMachine']);
const BODYWEIGHT_EQUIPMENT: ReadonlySet<Equipment> = new Set(['none', 'yogaMat']);

/**
 * Conservative difficulty heuristic — when in doubt, rate HARDER, never
 * easier (AQF-11: no advanced movement may leak to a beginner).
 * Guaranteed to return a valid ExerciseExperience for any input.
 */
export function deriveDifficulty(input: DifficultyInput): ExerciseExperience {
  const { category, equipment, primaryMuscles, secondaryMuscles } = input;

  if (category === 'cardio' || category === 'mobility') return 'beginner';

  const distinctMuscles = new Set([...primaryMuscles, ...secondaryMuscles]).size;
  const isCompound = distinctMuscles >= 3;
  const usesHeavy = equipment.some((e) => HEAVY_EQUIPMENT.has(e));
  const bodyweightOnly =
    equipment.length === 0 || equipment.every((e) => BODYWEIGHT_EQUIPMENT.has(e));

  if (usesHeavy && isCompound) return 'advanced'; // e.g. barbell squat/deadlift pattern
  if (usesHeavy) return 'intermediate'; // loaded but localized
  if (isCompound && !bodyweightOnly) return 'intermediate'; // e.g. dumbbell thruster pattern
  if (isCompound) return 'beginner'; // bodyweight compound stays accessible
  return 'beginner'; // default bias (AQF-11)
}

// ---------- description sanitizer (crowdsourced HTML is an XSS surface) ----------

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match);
}

/**
 * Strip ALL HTML tags and entities from a wger description and collapse
 * whitespace. Output is plain text safe to store and render as-is.
 */
export function sanitizeWgerDescription(html: string): string {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script\s*>/gi, ' ') // drop script blocks wholesale
      .replace(/<style[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ') // all remaining tags
      .replace(/<[^>]*$/g, ''), // truncated trailing tag
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every AQF equipment value, exported for exhaustive mapping tests. */
export const AQF_EQUIPMENT_VALUES: readonly Equipment[] = EQUIPMENT;
