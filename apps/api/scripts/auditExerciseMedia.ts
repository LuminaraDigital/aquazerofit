/**
 * Read-only exercise-media coverage audit.
 *
 * The audit accepts exercise records as values, reads local assets for
 * existence/duplicate checks, and returns an in-memory report. It never opens
 * the application store and never writes manifests, records, or asset files.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Exercise, WellnessProfile } from '@aquazerofit/shared';
import { exercisesSeed } from '../src/data/seeds/exercises';
import { buildPlan } from '../src/modules/plans/service';

const LEGACY_PLACEHOLDER_URL = '/uploads/exercise-placeholder.svg';
const WGER_PREFIX = '/uploads/exercises/';
const CURATED_PREFIX = '/uploads/exercises/curated/';
const FALLBACK_PREFIX = '/uploads/exercises/fallbacks/';

type MediaStatus =
  | 'validWger'
  | 'curated'
  | 'categoryFallback'
  | 'legacyPlaceholder'
  | 'missing'
  | 'missingFile'
  | 'external';
type PriorityTier = 'tier0' | 'tier1' | 'tier2';

export interface ExerciseMediaAuditOptions {
  assetsRoot: string;
  tier0ExerciseIds?: ReadonlySet<string>;
  tier1ExerciseIds?: ReadonlySet<string>;
}

export interface ExerciseMediaAuditReport {
  generatedAt: string;
  totalExercises: number;
  countsByMediaStatus: Record<MediaStatus, number>;
  countsByCategory: Partial<Record<Exercise['category'], number>>;
  countsByPriorityTier: Record<PriorityTier, number>;
  exercises: {
    id: string;
    name: string;
    category: Exercise['category'];
    mediaStatus: MediaStatus;
    priorityTier: PriorityTier;
    mediaUrls: string[];
  }[];
  missingLocalFiles: {
    exerciseId: string;
    url: string;
    expectedPath: string;
  }[];
  invalidLocalReferences: {
    exerciseId: string;
    url: string;
    reason: string;
  }[];
  duplicateAssetReferences: {
    url: string;
    exerciseIds: string[];
  }[];
  duplicateAssetContent: {
    sha256: string;
    urls: string[];
  }[];
}

const PLAN_SLOT_COVERAGE: ReadonlyArray<{
  category?: Exercise['category'];
  muscle?: string;
}> = [
  { muscle: 'chest' },
  { muscle: 'back' },
  { muscle: 'quadriceps' },
  { muscle: 'glutes' },
  { category: 'core' },
  { muscle: 'shoulders' },
  { muscle: 'triceps' },
  { muscle: 'biceps' },
  { muscle: 'hamstrings' },
  { muscle: 'calves' },
  { category: 'cardio' },
];

/**
 * Tier 1 is deliberately broad: every beginner movement eligible for one of
 * the current plan focus slots is a candidate. This avoids prematurely
 * selecting bespoke art before product/form review.
 */
export function derivePriorityTiers(
  exercises: Exercise[],
  tier0ExerciseIds: ReadonlySet<string>,
): {
  tier0ExerciseIds: Set<string>;
  tier1ExerciseIds: Set<string>;
} {
  const knownIds = new Set(exercises.map((exercise) => exercise.id));
  const tier0 = new Set([...tier0ExerciseIds].filter((id) => knownIds.has(id)));
  const tier1 = new Set(
    exercises
      .filter(
        (exercise) =>
          !tier0.has(exercise.id) &&
          exercise.difficulty === 'beginner' &&
          PLAN_SLOT_COVERAGE.some((slot) =>
            slot.category
              ? exercise.category === slot.category
              : exercise.category !== 'mobility' &&
                (exercise.primaryMuscles.includes(slot.muscle!) ||
                  exercise.secondaryMuscles.includes(slot.muscle!)),
          ),
      )
      .map((exercise) => exercise.id),
  );
  return { tier0ExerciseIds: tier0, tier1ExerciseIds: tier1 };
}

function localAssetPath(
  url: string,
  assetsRoot: string,
): { path: string | null; reason?: string } {
  if (!url.startsWith('/uploads/')) return { path: null };
  if (url.includes('?') || url.includes('#')) {
    return { path: null, reason: 'query strings and fragments are not valid local asset references' };
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    return { path: null, reason: 'URL contains invalid percent encoding' };
  }
  if (decoded !== url) {
    return { path: null, reason: 'percent-encoded local asset paths are not accepted' };
  }
  const relative = decoded.slice('/uploads/'.length).replaceAll('/', path.sep);
  const root = path.resolve(assetsRoot);
  const resolved = path.resolve(root, relative);
  const rootPrefix = `${root}${path.sep}`.toLocaleLowerCase();
  if (
    resolved.toLocaleLowerCase() !== root.toLocaleLowerCase() &&
    !resolved.toLocaleLowerCase().startsWith(rootPrefix)
  ) {
    return { path: null, reason: 'local asset path escapes the configured assets root' };
  }
  return { path: resolved };
}

function isWithinRoot(file: string, root: string): boolean {
  const normalizedRoot = path.resolve(root).toLocaleLowerCase();
  const normalizedFile = path.resolve(file).toLocaleLowerCase();
  return (
    normalizedFile === normalizedRoot ||
    normalizedFile.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

function classifyExercise(
  exercise: Exercise,
  assetsRoot: string,
  missingLocalFiles: ExerciseMediaAuditReport['missingLocalFiles'],
  invalidLocalReferences: ExerciseMediaAuditReport['invalidLocalReferences'],
  validLocalFiles: Map<string, string>,
): MediaStatus {
  if (exercise.media.length === 0) return 'missing';

  let sawMissingFile = false;
  let sawWger = false;
  let sawCurated = false;
  let sawFallback = false;
  let sawPlaceholder = false;
  let sawExternal = false;

  for (const media of exercise.media) {
    const resolved = localAssetPath(media.url, assetsRoot);
    if (!media.url.startsWith('/uploads/')) {
      sawExternal = true;
      continue;
    }
    if (!resolved.path) {
      sawMissingFile = true;
      invalidLocalReferences.push({
        exerciseId: exercise.id,
        url: media.url,
        reason: resolved.reason ?? 'invalid local asset reference',
      });
      continue;
    }
    if (!fs.existsSync(resolved.path) || !fs.statSync(resolved.path).isFile()) {
      sawMissingFile = true;
      missingLocalFiles.push({
        exerciseId: exercise.id,
        url: media.url,
        expectedPath: resolved.path,
      });
      continue;
    }
    const realRoot = fs.realpathSync(assetsRoot);
    const realFile = fs.realpathSync(resolved.path);
    if (!isWithinRoot(realFile, realRoot)) {
      sawMissingFile = true;
      invalidLocalReferences.push({
        exerciseId: exercise.id,
        url: media.url,
        reason: 'resolved asset path escapes the configured assets root',
      });
      continue;
    }
    validLocalFiles.set(media.url, realFile);
    if (media.url === LEGACY_PLACEHOLDER_URL) sawPlaceholder = true;
    else if (media.url.startsWith(FALLBACK_PREFIX)) sawFallback = true;
    else if (media.url.startsWith(CURATED_PREFIX)) sawCurated = true;
    else if (media.url.startsWith(WGER_PREFIX)) sawWger = true;
    else sawExternal = true;
  }

  if (sawMissingFile && !sawWger && !sawCurated && !sawFallback && !sawPlaceholder) {
    return 'missingFile';
  }
  if (sawWger) return 'validWger';
  if (sawCurated) return 'curated';
  if (sawFallback) return 'categoryFallback';
  if (sawPlaceholder) return 'legacyPlaceholder';
  if (sawMissingFile) return 'missingFile';
  return sawExternal ? 'external' : 'missing';
}

export function auditExerciseMedia(
  exercises: Exercise[],
  options: ExerciseMediaAuditOptions,
): ExerciseMediaAuditReport {
  const priority = derivePriorityTiers(
    exercises,
    options.tier0ExerciseIds ?? new Set<string>(),
  );
  if (options.tier1ExerciseIds) {
    priority.tier1ExerciseIds = new Set(
      [...options.tier1ExerciseIds].filter(
        (id) => !priority.tier0ExerciseIds.has(id) && exercises.some((item) => item.id === id),
      ),
    );
  }

  const countsByMediaStatus: Record<MediaStatus, number> = {
    validWger: 0,
    curated: 0,
    categoryFallback: 0,
    legacyPlaceholder: 0,
    missing: 0,
    missingFile: 0,
    external: 0,
  };
  const countsByCategory: ExerciseMediaAuditReport['countsByCategory'] = {};
  const countsByPriorityTier: Record<PriorityTier, number> = {
    tier0: 0,
    tier1: 0,
    tier2: 0,
  };
  const missingLocalFiles: ExerciseMediaAuditReport['missingLocalFiles'] = [];
  const invalidLocalReferences: ExerciseMediaAuditReport['invalidLocalReferences'] = [];
  const validLocalFiles = new Map<string, string>();
  const references = new Map<string, Set<string>>();

  const exerciseReports = exercises
    .map((exercise) => {
      for (const media of exercise.media) {
        const exerciseIds = references.get(media.url) ?? new Set<string>();
        exerciseIds.add(exercise.id);
        references.set(media.url, exerciseIds);
      }
      const mediaStatus = classifyExercise(
        exercise,
        options.assetsRoot,
        missingLocalFiles,
        invalidLocalReferences,
        validLocalFiles,
      );
      const priorityTier: PriorityTier = priority.tier0ExerciseIds.has(exercise.id)
        ? 'tier0'
        : priority.tier1ExerciseIds.has(exercise.id)
          ? 'tier1'
          : 'tier2';
      countsByMediaStatus[mediaStatus] += 1;
      countsByCategory[exercise.category] = (countsByCategory[exercise.category] ?? 0) + 1;
      countsByPriorityTier[priorityTier] += 1;
      return {
        id: exercise.id,
        name: exercise.name,
        category: exercise.category,
        mediaStatus,
        priorityTier,
        mediaUrls: exercise.media.map((media) => media.url),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const hashes = new Map<string, string[]>();
  for (const [url, file] of validLocalFiles) {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    hashes.set(digest, [...(hashes.get(digest) ?? []), url]);
  }

  return {
    generatedAt: new Date().toISOString(),
    totalExercises: exercises.length,
    countsByMediaStatus,
    countsByCategory,
    countsByPriorityTier,
    exercises: exerciseReports,
    missingLocalFiles: missingLocalFiles.sort((a, b) => a.url.localeCompare(b.url)),
    invalidLocalReferences: invalidLocalReferences.sort((a, b) => a.url.localeCompare(b.url)),
    duplicateAssetReferences: [...references.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([url, ids]) => ({ url, exerciseIds: [...ids].sort() }))
      .sort((a, b) => a.url.localeCompare(b.url)),
    duplicateAssetContent: [...hashes.entries()]
      .filter(([, urls]) => urls.length > 1)
      .map(([sha256, urls]) => ({ sha256, urls: urls.sort() }))
      .sort((a, b) => a.sha256.localeCompare(b.sha256)),
  };
}

export function formatMediaAuditMarkdown(report: ExerciseMediaAuditReport): string {
  const table = report.exercises
    .map(
      (exercise) =>
        `| ${exercise.id} | ${exercise.name.replaceAll('|', '\\|')} | ${exercise.category} | ${exercise.priorityTier} | ${exercise.mediaStatus} |`,
    )
    .join('\n');
  const missing =
    report.missingLocalFiles.length === 0
      ? '- None.'
      : report.missingLocalFiles
          .map((item) => `- \`${item.exerciseId}\`: \`${item.url}\``)
          .join('\n');
  const duplicateReferences =
    report.duplicateAssetReferences.length === 0
      ? '- None.'
      : report.duplicateAssetReferences
          .map(
            (item) =>
              `- \`${item.url}\` is referenced by ${item.exerciseIds.map((id) => `\`${id}\``).join(', ')}.`,
          )
          .join('\n');
  const duplicateContent =
    report.duplicateAssetContent.length === 0
      ? '- None.'
      : report.duplicateAssetContent
          .map(
            (item) =>
              `- SHA-256 \`${item.sha256}\`: ${item.urls.map((url) => `\`${url}\``).join(', ')}.`,
          )
          .join('\n');
  return `# Workout Media Coverage Baseline

Generated: ${report.generatedAt}

This is a read-only inventory. Tier 0 is the deterministic current/demo guided-workout plan; Tier 1 is the conservative set of remaining beginner exercises eligible for a current plan focus slot.

## Summary

- Total exercises: ${report.totalExercises}
- Media status: ${Object.entries(report.countsByMediaStatus)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')}
- Category: ${Object.entries(report.countsByCategory)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')}
- Priority: ${Object.entries(report.countsByPriorityTier)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')}
- Duplicate references: ${report.duplicateAssetReferences.length}
- Byte-identical referenced asset groups: ${report.duplicateAssetContent.length}

## Missing local files

${missing}

## Duplicate asset references

${duplicateReferences}

## Byte-identical referenced assets

${duplicateContent}

## Exercise inventory

| ID | Exercise | Category | Priority | Media status |
| --- | --- | --- | --- | --- |
${table}
`;
}

function defaultAssetsRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');
}

function demoTier0ExerciseIds(exercises: Exercise[]): Set<string> {
  const profile: WellnessProfile = {
    userId: 'usr-demo',
    weightKg: 85.6,
    heightCm: 178,
    age: 34,
    sex: 'male',
    goal: 'lose',
    activityLevel: 'moderate',
    exerciseExperience: 'intermediate',
    dietaryPreferences: ['highProtein'],
    allergies: ['shellfish'],
    equipment: ['dumbbells', 'yogaMat', 'resistanceBands'],
    unitPreference: 'metric',
    targetWeightKg: 78,
    updatedAt: '2026-01-01T08:00:00.000Z',
  };
  const plan = buildPlan({
    userId: profile.userId,
    profile,
    exercises,
    daysPerWeek: 4,
    focus: 'general',
    startDate: '2026-01-01',
    now: new Date('2026-01-01T08:00:00.000Z'),
  });
  return new Set(
    plan.days.flatMap((day) =>
      day.slots.flatMap((slot) => slot.entries.map((entry) => entry.exerciseId)),
    ),
  );
}

function readInput(file: string): Exercise[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records =
    Array.isArray(parsed) ? parsed : (parsed as { exercises?: unknown } | null)?.exercises;
  if (!Array.isArray(records)) {
    throw new Error('Audit input must be an exercise array or an object with an exercises array');
  }
  return records.filter(
    (record): record is Exercise =>
      typeof record === 'object' &&
      record !== null &&
      (record as { type?: unknown }).type === 'exercise',
  );
}

function runCli(): void {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');
  const inputFile = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
  if (inputIndex >= 0 && !inputFile) throw new Error('--input requires a JSON file path');
  const exercises = inputFile ? readInput(path.resolve(inputFile)) : exercisesSeed;
  const report = auditExerciseMedia(exercises, {
    assetsRoot: defaultAssetsRoot(),
    tier0ExerciseIds: demoTier0ExerciseIds(exercises),
  });
  process.stdout.write(
    args.includes('--json')
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatMediaAuditMarkdown(report),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
