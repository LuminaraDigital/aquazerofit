import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Exercise, ExerciseMedia } from '@aquazerofit/shared';
import { inspectImageBytes, isSafeStoredUpstreamImage } from './imageValidation';

const MAX_ASSET_BYTES = 400 * 1024;
/**
 * Adopted upstream stills are already-mirrored wger binaries, so they are not
 * held to the 1600x900 curated master format. They are still held to a mobile
 * transfer budget — `validWgerMedia` alone would allow a 12 MB PNG onto a
 * library card.
 */
const MAX_ADOPTED_UPSTREAM_BYTES = 600 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXERCISE_ID = /^ex-[a-z0-9][a-z0-9-]{0,119}$/i;
const WGER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const WGER_MEDIA_PREFIX = '/uploads/exercises/';
const CURATED_MEDIA_PREFIX = '/uploads/exercises/curated/';
const LEGACY_PLACEHOLDER_URL = '/uploads/exercise-placeholder.svg';

type ExerciseCategory = Exercise['category'];

export interface CuratedMediaReviewInput {
  status: 'approved' | 'pending' | 'rejected';
  decisionDate: string;
  technicalReviewer: string;
  technicalReviewedAt: string;
  formSafetyReviewer: string;
  formSafetyQualification: string;
  formSafetyReviewedAt: string;
  contentLicensingReviewer: string;
  contentLicensingReviewedAt: string;
  releaseOwner: string;
  releaseReviewedAt: string;
}

export interface CuratedMediaAssetInput {
  file: string;
  kind: 'image';
  owner: string;
  creator: string;
  licence: string;
  licenceUrl?: string;
  attributionText: string;
  licenceAuthor: string;
  creationMethod: 'manual-illustration' | 'photography' | 'ai-generated' | 'ai-assisted';
  isAiGenerated: boolean;
  modelToolVersion?: string;
  promptSourceReference?: string;
  createdAt: string;
  containsIdentifiablePerson: boolean;
  consentReleaseReference?: string;
  sha256: string;
  review: CuratedMediaReviewInput;
}

export interface CuratedMediaEntryInput {
  exerciseId?: string;
  wgerUuid?: string;
  media: CuratedMediaAssetInput[];
}

export interface CuratedMediaManifestInput {
  schemaVersion: 1;
  entries: CuratedMediaEntryInput[];
}

export interface ResolvedCuratedMedia {
  media: ExerciseMedia[];
  isAiGenerated: boolean;
}

interface ResolvedCuratedEntry extends ResolvedCuratedMedia {
  exerciseId?: string;
  wgerUuid?: string;
  media: ExerciseMedia[];
  isAiGenerated: boolean;
  curatedRoot: string;
  files: Array<{ absoluteFile: string; sha256: string }>;
}

export interface CuratedMediaValidationOptions {
  curatedRoot: string;
}

export interface CuratedMediaResolutionOptions {
  exercisesRoot?: string;
  adoptedUpstream?: AdoptedUpstreamMediaRegistry;
  categoryFallbacks?: Partial<Record<ExerciseCategory, ExerciseMedia[]>>;
  categoryFallbackAiGenerated?: Partial<Record<ExerciseCategory, boolean>>;
}

const FALLBACK_CATEGORIES: ExerciseCategory[] = ['strength', 'cardio', 'core', 'mobility'];

export const DEFAULT_CATEGORY_FALLBACKS: Record<ExerciseCategory, ExerciseMedia[]> =
  readFallbackMediaManifest();

export class CuratedMediaRegistry {
  readonly size: number;
  readonly #byExerciseId = new Map<string, ResolvedCuratedEntry>();
  readonly #byWgerUuid = new Map<string, ResolvedCuratedEntry>();

  constructor(entries: ResolvedCuratedEntry[]) {
    this.size = entries.length;
    for (const entry of entries) {
      if (entry.exerciseId) this.#byExerciseId.set(entry.exerciseId, entry);
      if (entry.wgerUuid) this.#byWgerUuid.set(entry.wgerUuid, entry);
    }
  }

  findForExercise(exercise: Pick<Exercise, 'id' | 'wgerUuid'>): ResolvedCuratedMedia | undefined {
    const byId = this.#byExerciseId.get(exercise.id);
    const byUuid = exercise.wgerUuid ? this.#byWgerUuid.get(exercise.wgerUuid) : undefined;
    // Two independently-authored entries matching the same exercise are
    // ambiguous. Fail closed rather than choosing one by incidental order.
    if (byId && byUuid && byId !== byUuid) return undefined;
    const entry = byId ?? byUuid;
    if (
      !entry ||
      !entry.files.every(({ absoluteFile, sha256 }) =>
        fileStillAvailable(entry.curatedRoot, absoluteFile, sha256),
      )
    ) {
      return undefined;
    }
    return { media: entry.media, isAiGenerated: entry.isAiGenerated };
  }
}

/**
 * Seed exercises that carry no wger identity of their own but that a reviewer
 * has matched to an already-mirrored upstream image.
 *
 * This deliberately keys on the stable exercise id and does NOT write
 * `wgerUuid` onto the record: `wgerUuid` is the wger importer's upsert key, so
 * setting it would hand the seed's name, category, muscles, equipment and
 * difficulty to the next import. Media reuse must not change exercise identity.
 */
export class AdoptedUpstreamMediaRegistry {
  readonly size: number;
  readonly #byExerciseId = new Map<string, Array<{ file: string; media: ExerciseMedia }>>();

  constructor(entries: Array<{ exerciseId: string; assets: Array<{ file: string; media: ExerciseMedia }> }>) {
    this.size = entries.length;
    for (const entry of entries) this.#byExerciseId.set(entry.exerciseId, entry.assets);
  }

  /**
   * Resolves only when every referenced binary is still present, in range and
   * inside the exercises root. Fails closed to the category fallback so a wger
   * re-sync that drops a file degrades instead of serving a broken image.
   */
  findForExercise(exerciseId: string, exercisesRoot: string): ExerciseMedia[] {
    const assets = this.#byExerciseId.get(exerciseId);
    if (!assets) return [];
    const root = path.resolve(exercisesRoot);
    for (const { file } of assets) {
      if (!adoptedUpstreamFileUsable(root, file)) return [];
    }
    return assets.map(({ media }) => ({ ...media }));
  }
}

function adoptedUpstreamFileUsable(exercisesRoot: string, file: string): boolean {
  if (!safeAssetPath(file)) return false;
  if (!SUPPORTED_EXTENSIONS.has(path.posix.extname(file).toLowerCase())) return false;
  const absoluteFile = path.resolve(exercisesRoot, ...file.split('/'));
  if (!isInsideRoot(exercisesRoot, absoluteFile)) return false;
  try {
    const stat = fs.lstatSync(absoluteFile);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size <= 0 ||
      stat.size > MAX_ADOPTED_UPSTREAM_BYTES
    ) {
      return false;
    }
    return (
      isSafeStoredUpstreamImage(absoluteFile) &&
      isInsideRoot(fs.realpathSync(exercisesRoot), fs.realpathSync(absoluteFile))
    );
  } catch {
    return false;
  }
}

/**
 * Builds the registry from a reviewed exercise-id -> file mapping, taking every
 * licence field verbatim from the wger import attribution manifest. Attribution
 * is never authored here, so it cannot drift from the mirrored binaries
 * (AQF-12). An entry whose attribution is missing is dropped.
 */
export function readAdoptedUpstreamMediaRegistry(
  manifestFile = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'adopted-upstream-manifest.json',
  ),
  attributionFile = path.join(defaultExercisesRoot(), 'import-attribution.wger.json'),
): AdoptedUpstreamMediaRegistry {
  let manifest: unknown;
  let attribution: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as unknown;
    attribution = JSON.parse(fs.readFileSync(attributionFile, 'utf8')) as unknown;
  } catch {
    return new AdoptedUpstreamMediaRegistry([]);
  }
  if (
    !isPlainObject(manifest) ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.entries) ||
    !isPlainObject(attribution) ||
    !Array.isArray(attribution.images)
  ) {
    return new AdoptedUpstreamMediaRegistry([]);
  }

  const attributionByFile = new Map<string, Record<string, unknown>>();
  for (const image of attribution.images) {
    if (isPlainObject(image) && typeof image.file === 'string') {
      attributionByFile.set(image.file, image);
    }
  }

  const seen = new Set<string>();
  const entries: Array<{
    exerciseId: string;
    assets: Array<{ file: string; media: ExerciseMedia }>;
  }> = [];

  for (const raw of manifest.entries) {
    if (!isPlainObject(raw)) continue;
    const exerciseId = typeof raw.exerciseId === 'string' ? raw.exerciseId.trim() : '';
    const wgerUuid = typeof raw.wgerUuid === 'string' ? raw.wgerUuid.trim() : '';
    if (!EXERCISE_ID.test(exerciseId) || !WGER_UUID.test(wgerUuid)) continue;
    if (seen.has(exerciseId)) continue;
    if (!Array.isArray(raw.files) || raw.files.length === 0 || raw.files.length > 2) continue;

    const assets: Array<{ file: string; media: ExerciseMedia }> = [];
    for (const candidate of raw.files) {
      if (typeof candidate !== 'string') break;
      const file = candidate.trim();
      // The mapping must name a file the import manifest already attributes,
      // inside the directory of the wger exercise it claims to come from.
      const record = attributionByFile.get(`exercises/${file}`);
      if (!record || record.wgerUuid !== wgerUuid) break;
      if (!file.startsWith(`${wgerUuid}/`)) break;
      const licenceAuthor =
        typeof record.licenceAuthor === 'string' && record.licenceAuthor.trim().length > 0
          ? record.licenceAuthor.trim()
          : '';
      const licence = typeof record.licence === 'string' ? record.licence.trim() : '';
      if (!licence || !licenceAuthor) break;
      const licenceUrl = typeof record.licenceUrl === 'string' ? record.licenceUrl.trim() : '';
      assets.push({
        file,
        media: {
          kind: 'image',
          url: `${WGER_MEDIA_PREFIX}${file}`,
          source: 'wger',
          licence,
          licenceAuthor,
          ...(licenceUrl ? { licenceUrl } : {}),
          attributionText: `© ${licenceAuthor}`,
          isAiGenerated: record.isAiGenerated === true,
        },
      });
    }
    if (assets.length !== raw.files.length) continue;
    seen.add(exerciseId);
    entries.push({ exerciseId, assets });
  }

  return new AdoptedUpstreamMediaRegistry(entries);
}

export const DEFAULT_ADOPTED_UPSTREAM_MEDIA: AdoptedUpstreamMediaRegistry =
  readAdoptedUpstreamMediaRegistry();

function defaultExercisesRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', 'assets', 'exercises');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, errors: string[]): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string`);
    return '';
  }
  return value.trim();
}

function optionalHttpsUrl(value: unknown, field: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined;
  const raw = requiredString(value, field, errors);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') {
      errors.push(`${field} must use HTTPS`);
      return undefined;
    }
    return parsed.toString();
  } catch {
    errors.push(`${field} must be a valid URL`);
    return undefined;
  }
}

function safeAssetPath(file: string): boolean {
  if (
    file.length === 0 ||
    file.length > 240 ||
    file.includes('\\') ||
    file.includes('\0') ||
    path.posix.isAbsolute(file) ||
    /^[a-z][a-z0-9+.-]*:/i.test(file)
  ) {
    return false;
  }
  const normalized = path.posix.normalize(file);
  return (
    normalized === file &&
    file.split('/').every(
      (segment) =>
        segment !== '.' &&
        segment !== '..' &&
        /^[a-z0-9][a-z0-9._-]*$/i.test(segment),
    )
  );
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function hashFile(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fileStillAvailable(root: string, file: string, expectedSha256: string): boolean {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_ASSET_BYTES) {
      return false;
    }
    return (
      isInsideRoot(fs.realpathSync(root), fs.realpathSync(file)) &&
      hashFile(file) === expectedSha256
    );
  } catch {
    return false;
  }
}

function validateAsset(
  raw: unknown,
  location: string,
  curatedRoot: string,
  seenFiles: Set<string>,
  errors: string[],
): ResolvedCuratedEntry['media'][number] & {
  isAiGenerated: boolean;
  absoluteFile: string;
  sha256: string;
} | null {
  if (!isPlainObject(raw)) {
    errors.push(`${location} must be an object`);
    return null;
  }

  const file = requiredString(raw.file, `${location}.file`, errors);
  const owner = requiredString(raw.owner, `${location}.owner`, errors);
  const creator = requiredString(raw.creator, `${location}.creator`, errors);
  const licence = requiredString(raw.licence, `${location}.licence`, errors);
  const attributionText = requiredString(raw.attributionText, `${location}.attributionText`, errors);
  const licenceAuthor = requiredString(raw.licenceAuthor, `${location}.licenceAuthor`, errors);
  const licenceUrl = optionalHttpsUrl(raw.licenceUrl, `${location}.licenceUrl`, errors);
  const creationMethod = raw.creationMethod;
  const isAiGenerated = raw.isAiGenerated;
  const sha256 = requiredString(raw.sha256, `${location}.sha256`, errors).toLowerCase();
  const createdAt = requiredString(raw.createdAt, `${location}.createdAt`, errors);
  const review = raw.review;

  if (raw.kind !== 'image') errors.push(`${location}.kind must be "image"`);
  if (
    creationMethod !== 'manual-illustration' &&
    creationMethod !== 'photography' &&
    creationMethod !== 'ai-generated' &&
    creationMethod !== 'ai-assisted'
  ) {
    errors.push(`${location}.creationMethod is unsupported`);
  }
  if (typeof isAiGenerated !== 'boolean') {
    errors.push(`${location}.isAiGenerated must be a boolean`);
  } else if (
    (creationMethod === 'ai-generated' || creationMethod === 'ai-assisted') !== isAiGenerated
  ) {
    errors.push(`${location} has inconsistent AI provenance`);
  }
  if (isAiGenerated === true) {
    requiredString(raw.modelToolVersion, `${location}.modelToolVersion`, errors);
    requiredString(raw.promptSourceReference, `${location}.promptSourceReference`, errors);
  }
  if (raw.containsIdentifiablePerson !== true && raw.containsIdentifiablePerson !== false) {
    errors.push(`${location}.containsIdentifiablePerson must be a boolean`);
  } else if (raw.containsIdentifiablePerson) {
    requiredString(raw.consentReleaseReference, `${location}.consentReleaseReference`, errors);
  }
  if (!SHA256.test(sha256)) errors.push(`${location}.sha256 must be a SHA-256 hex digest`);
  if (licence !== 'AquaZeroFit proprietary') {
    if (!licenceUrl) errors.push(`${location}.licenceUrl is required for third-party media`);
  }
  if (!isCalendarDate(createdAt)) errors.push(`${location}.createdAt must be a valid YYYY-MM-DD date`);

  if (!isPlainObject(review)) {
    errors.push(`${location}.review must be complete`);
  } else {
    if (review.status !== 'approved') errors.push(`${location}.review status must be approved`);
    const reviewStrings = [
      'technicalReviewer',
      'formSafetyReviewer',
      'formSafetyQualification',
      'contentLicensingReviewer',
      'releaseOwner',
    ] as const;
    for (const field of reviewStrings) {
      requiredString(review[field], `${location}.review.${field}`, errors);
    }
    const reviewDates = [
      'decisionDate',
      'technicalReviewedAt',
      'formSafetyReviewedAt',
      'contentLicensingReviewedAt',
      'releaseReviewedAt',
    ] as const;
    for (const field of reviewDates) {
      const date = requiredString(review[field], `${location}.review.${field}`, errors);
      if (!isCalendarDate(date)) {
        errors.push(`${location}.review.${field} must be a valid YYYY-MM-DD date`);
      }
    }
  }

  if (!safeAssetPath(file)) {
    errors.push(`${location}.file contains an unsafe path`);
    return null;
  }
  const extension = path.posix.extname(file).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    errors.push(`${location}.file uses an unsupported format`);
  }
  if (seenFiles.has(file)) errors.push(`${location}.file duplicates another asset`);
  seenFiles.add(file);

  const absoluteFile = path.resolve(curatedRoot, ...file.split('/'));
  if (!isInsideRoot(curatedRoot, absoluteFile)) {
    errors.push(`${location}.file escapes the curated root`);
    return null;
  }
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(absoluteFile);
  } catch {
    errors.push(`${location}.file is missing`);
    return null;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    errors.push(`${location}.file must be a regular file`);
    return null;
  }
  try {
    const realRoot = fs.realpathSync(curatedRoot);
    const realFile = fs.realpathSync(absoluteFile);
    if (!isInsideRoot(realRoot, realFile)) {
      errors.push(`${location}.file resolves outside the curated root`);
      return null;
    }
  } catch {
    errors.push(`${location}.file could not be securely resolved`);
    return null;
  }
  if (stat.size <= 0 || stat.size > MAX_ASSET_BYTES) {
    errors.push(`${location}.file size must be between 1 and ${MAX_ASSET_BYTES} bytes`);
  }
  if (stat.size > 0 && stat.size <= MAX_ASSET_BYTES && SUPPORTED_EXTENSIONS.has(extension)) {
    const inspected = inspectImageBytes(fs.readFileSync(absoluteFile));
    const expectedMime =
      extension === '.webp'
        ? 'image/webp'
        : extension === '.png'
          ? 'image/png'
          : 'image/jpeg';
    if (!inspected || inspected.mime !== expectedMime) {
      errors.push(`${location}.file content does not match its image format`);
    } else if (inspected.width !== 1600 || inspected.height !== 900) {
      errors.push(`${location}.file must be exactly 1600x900 pixels`);
    }
  }
  if (
    stat.size > 0 &&
    stat.size <= MAX_ASSET_BYTES &&
    SHA256.test(sha256) &&
    hashFile(absoluteFile) !== sha256
  ) {
    errors.push(`${location}.sha256 does not match the reviewed binary`);
  }

  // Only reviewed, validated public provenance crosses the API boundary.
  // Internal review identities, prompt references and file hashes stay private.
  void owner;
  void creator;
  return {
    kind: 'image',
    url: `${CURATED_MEDIA_PREFIX}${file}`,
    source: 'aquazerofit',
    licence,
    licenceAuthor,
    ...(licenceUrl ? { licenceUrl } : {}),
    attributionText,
    isAiGenerated: isAiGenerated === true,
    absoluteFile,
    sha256,
  };
}

export function validateCuratedMediaManifest(
  input: unknown,
  options: CuratedMediaValidationOptions,
): CuratedMediaRegistry {
  const errors: string[] = [];
  if (!isPlainObject(input)) throw new Error('Curated media manifest must be an object');
  if (input.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(input.entries)) {
    throw new Error('Curated media manifest entries must be an array');
  }
  if (input.entries.length > 10_000) {
    throw new Error('Curated media manifest exceeds the 10,000 entry limit');
  }

  const curatedRoot = path.resolve(options.curatedRoot);
  const seenTargets = new Set<string>();
  const seenFiles = new Set<string>();
  const resolvedEntries: ResolvedCuratedEntry[] = [];

  input.entries.forEach((rawEntry, entryIndex) => {
    const location = `entries[${entryIndex}]`;
    if (!isPlainObject(rawEntry)) {
      errors.push(`${location} must be an object`);
      return;
    }
    const exerciseId = typeof rawEntry.exerciseId === 'string' ? rawEntry.exerciseId.trim() : '';
    const wgerUuid = typeof rawEntry.wgerUuid === 'string' ? rawEntry.wgerUuid.trim() : '';
    if ((exerciseId ? 1 : 0) + (wgerUuid ? 1 : 0) !== 1) {
      errors.push(`${location} must contain exactly one stable exerciseId or wgerUuid`);
    }
    if (exerciseId && !EXERCISE_ID.test(exerciseId)) {
      errors.push(`${location}.exerciseId is not a stable exercise identifier`);
    }
    if (wgerUuid && !WGER_UUID.test(wgerUuid)) {
      errors.push(`${location}.wgerUuid must be a UUID`);
    }
    const target = exerciseId ? `exercise:${exerciseId}` : `wger:${wgerUuid}`;
    if (seenTargets.has(target)) errors.push(`${location} is a duplicate primary assignment`);
    seenTargets.add(target);

    if (!Array.isArray(rawEntry.media) || rawEntry.media.length === 0 || rawEntry.media.length > 2) {
      errors.push(`${location}.media must contain one or two assets`);
      return;
    }
    const assets = rawEntry.media
      .map((asset, assetIndex) =>
        validateAsset(asset, `${location}.media[${assetIndex}]`, curatedRoot, seenFiles, errors),
      )
      .filter((asset): asset is NonNullable<typeof asset> => asset !== null);
    if (assets.length === rawEntry.media.length && (exerciseId || wgerUuid)) {
      resolvedEntries.push({
        exerciseId: exerciseId || undefined,
        wgerUuid: wgerUuid || undefined,
        media: assets.map(
          ({ absoluteFile: _absoluteFile, sha256: _sha256, ...media }) =>
            media,
        ),
        isAiGenerated: assets.some((asset) => asset.isAiGenerated),
        curatedRoot,
        files: assets.map((asset) => ({
          absoluteFile: asset.absoluteFile,
          sha256: asset.sha256,
        })),
      });
    }
  });

  if (errors.length > 0) {
    throw new Error(`Invalid curated media manifest:\n- ${errors.join('\n- ')}`);
  }
  return new CuratedMediaRegistry(resolvedEntries);
}

function validWgerMedia(
  exercise: Exercise,
  exercisesRoot: string,
): ExerciseMedia[] {
  if (!exercise.wgerUuid) return [];
  const expectedPrefix = `${WGER_MEDIA_PREFIX}${exercise.wgerUuid}/`;
  return exercise.media.filter((item) => {
    if (item.kind !== 'image' || !item.url.startsWith(expectedPrefix)) return false;
    const relativeFile = item.url.slice(WGER_MEDIA_PREFIX.length);
    if (!safeAssetPath(relativeFile)) return false;
    const absoluteFile = path.resolve(exercisesRoot, ...relativeFile.split('/'));
    if (!isInsideRoot(exercisesRoot, absoluteFile)) return false;
    try {
      const stat = fs.lstatSync(absoluteFile);
      if (!stat.isFile() || stat.isSymbolicLink() || !isSafeStoredUpstreamImage(absoluteFile)) {
        return false;
      }
      const realRoot = fs.realpathSync(exercisesRoot);
      const realFile = fs.realpathSync(absoluteFile);
      return isInsideRoot(realRoot, realFile);
    } catch {
      return false;
    }
  });
}

function validLocalExerciseMedia(
  media: ExerciseMedia[],
  exercisesRoot: string,
): ExerciseMedia[] {
  return media.filter((item) => {
    if (item.kind !== 'image' || !item.url.startsWith(WGER_MEDIA_PREFIX)) return false;
    const relativeFile = item.url.slice(WGER_MEDIA_PREFIX.length);
    if (!safeAssetPath(relativeFile)) return false;
    const absoluteFile = path.resolve(exercisesRoot, ...relativeFile.split('/'));
    if (!isInsideRoot(exercisesRoot, absoluteFile)) return false;
    try {
      const stat = fs.lstatSync(absoluteFile);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size <= 0 ||
        stat.size > MAX_ASSET_BYTES
      ) {
        return false;
      }
      const extension = path.extname(absoluteFile).toLowerCase();
      return (
        SUPPORTED_EXTENSIONS.has(extension) &&
        isSafeStoredUpstreamImage(absoluteFile) &&
        isInsideRoot(fs.realpathSync(exercisesRoot), fs.realpathSync(absoluteFile))
      );
    } catch {
      return false;
    }
  });
}

export function applyCuratedMediaToExercise(
  exercise: Exercise,
  registry: CuratedMediaRegistry,
  options: CuratedMediaResolutionOptions = {},
): Exercise {
  const exercisesRoot = path.resolve(options.exercisesRoot ?? defaultExercisesRoot());
  const upstream = validWgerMedia(exercise, exercisesRoot);
  if (upstream.length > 0) {
    return upstream.length === exercise.media.length ? exercise : { ...exercise, media: upstream };
  }

  // A record's own upstream media always wins; adopted media only fills a gap.
  const adopted = (options.adoptedUpstream ?? DEFAULT_ADOPTED_UPSTREAM_MEDIA).findForExercise(
    exercise.id,
    exercisesRoot,
  );
  if (adopted.length > 0) {
    return {
      ...exercise,
      media: adopted,
      isAiGeneratedMedia: adopted.some((item) => item.isAiGenerated) || undefined,
    };
  }

  const curated = registry.findForExercise(exercise);
  if (curated) {
    return {
      ...exercise,
      media: curated.media.map((item) => ({ ...item })),
      isAiGeneratedMedia: curated.isAiGenerated || undefined,
    };
  }

  const configuredFallbacks = options.categoryFallbacks ?? DEFAULT_CATEGORY_FALLBACKS;
  const categoryFallback = validLocalExerciseMedia(
    configuredFallbacks[exercise.category] ?? [],
    exercisesRoot,
  );
  if (categoryFallback.length > 0) {
    const isDefaultFallback = options.categoryFallbacks === undefined;
    const isAiGenerated =
      options.categoryFallbackAiGenerated?.[exercise.category] ?? isDefaultFallback;
    return {
      ...exercise,
      media: categoryFallback.map((item) => ({ ...item })),
      isAiGeneratedMedia: isAiGenerated || undefined,
    };
  }

  const existing = validLocalExerciseMedia(
    exercise.media.filter((item) => item.url !== LEGACY_PLACEHOLDER_URL),
    exercisesRoot,
  );
  return existing.length > 0
    ? { ...exercise, media: existing }
    : { ...exercise, media: [], isAiGeneratedMedia: undefined };
}

export function readCuratedMediaRegistry(
  manifestFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'curated-manifest.json'),
  curatedRoot = path.join(defaultExercisesRoot(), 'curated'),
): CuratedMediaRegistry {
  const parsed = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as unknown;
  return validateCuratedMediaManifest(parsed, { curatedRoot });
}

export function readFallbackMediaManifest(
  manifestFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fallback-manifest.json'),
  fallbackRoot = path.join(defaultExercisesRoot(), 'fallbacks'),
): Record<ExerciseCategory, ExerciseMedia[]> {
  let input: unknown;
  try {
    input = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `Unable to load private fallback media manifest: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
  if (!isPlainObject(input)) throw new Error('Fallback media manifest must be an object');

  const errors: string[] = [];
  if (input.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (
    input.purpose !==
    'Decorative category fallback artwork; never exercise-form instruction'
  ) {
    errors.push('purpose must identify decorative, non-instructional fallback artwork');
  }
  const owner = requiredString(input.owner, 'owner', errors);
  requiredString(input.creator, 'creator', errors);
  const createdAt = requiredString(input.createdAt, 'createdAt', errors);
  if (!isCalendarDate(createdAt)) errors.push('createdAt must be a valid YYYY-MM-DD date');
  const creationMethod = requiredString(input.creationMethod, 'creationMethod', errors);
  const isAiGenerated =
    creationMethod === 'ai-generated' || creationMethod === 'ai-assisted';
  if (
    creationMethod !== 'manual-illustration' &&
    creationMethod !== 'photography' &&
    !isAiGenerated
  ) {
    errors.push('creationMethod is unsupported');
  }
  if (isAiGenerated) {
    requiredString(input.modelToolVersion, 'modelToolVersion', errors);
    requiredString(input.promptSourceReference, 'promptSourceReference', errors);
  }
  const licence = requiredString(input.licence, 'licence', errors);

  if (!isPlainObject(input.review)) {
    errors.push('review must be complete');
  } else {
    if (input.review.status !== 'approved-for-decorative-fallback-use') {
      errors.push('review.status must approve decorative fallback use');
    }
    const reviewedAt = requiredString(input.review.reviewedAt, 'review.reviewedAt', errors);
    if (!isCalendarDate(reviewedAt)) {
      errors.push('review.reviewedAt must be a valid YYYY-MM-DD date');
    }
    requiredString(input.review.reviewedBy, 'review.reviewedBy', errors);
    requiredString(input.review.reason, 'review.reason', errors);
    if (input.review.formSafetyReviewRequired !== false) {
      errors.push('review.formSafetyReviewRequired must be false for decorative fallbacks');
    }
  }

  if (!Array.isArray(input.assets) || input.assets.length !== FALLBACK_CATEGORIES.length) {
    throw new Error(
      `Invalid fallback media manifest:\n- assets must contain exactly ${FALLBACK_CATEGORIES.length} entries`,
    );
  }

  const resolvedRoot = path.resolve(fallbackRoot);
  let realRoot = '';
  try {
    realRoot = fs.realpathSync(resolvedRoot);
  } catch {
    errors.push('fallback asset root is missing or inaccessible');
  }
  const seenCategories = new Set<ExerciseCategory>();
  const mediaByCategory: Partial<Record<ExerciseCategory, ExerciseMedia[]>> = {};

  input.assets.forEach((asset, index) => {
    const location = `assets[${index}]`;
    if (!isPlainObject(asset)) {
      errors.push(`${location} must be an object`);
      return;
    }
    const category =
      typeof asset.category === 'string' && FALLBACK_CATEGORIES.includes(asset.category as ExerciseCategory)
        ? (asset.category as ExerciseCategory)
        : null;
    if (!category) {
      errors.push(`${location}.category is unsupported`);
      return;
    }
    if (seenCategories.has(category)) errors.push(`${location}.category is duplicated`);
    seenCategories.add(category);

    const file = requiredString(asset.file, `${location}.file`, errors);
    if (file !== `${category}.webp` || !safeAssetPath(file) || file.includes('/')) {
      errors.push(`${location}.file must be ${category}.webp`);
      return;
    }
    if (asset.width !== 1600 || asset.height !== 900) {
      errors.push(`${location} dimensions must be exactly 1600x900`);
    }
    if (
      !Number.isInteger(asset.bytes) ||
      (asset.bytes as number) <= 0 ||
      (asset.bytes as number) > MAX_ASSET_BYTES
    ) {
      errors.push(`${location}.bytes is outside the allowed size`);
    }
    const sha256 = requiredString(asset.sha256, `${location}.sha256`, errors).toLowerCase();
    if (!SHA256.test(sha256)) errors.push(`${location}.sha256 must be a SHA-256 digest`);

    const absoluteFile = path.resolve(resolvedRoot, file);
    if (!isInsideRoot(resolvedRoot, absoluteFile)) {
      errors.push(`${location}.file escapes the fallback root`);
      return;
    }
    try {
      const stat = fs.lstatSync(absoluteFile);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        errors.push(`${location}.file must be a regular file`);
        return;
      }
      if (realRoot && !isInsideRoot(realRoot, fs.realpathSync(absoluteFile))) {
        errors.push(`${location}.file resolves outside the fallback root`);
        return;
      }
      if (stat.size !== asset.bytes) errors.push(`${location}.bytes does not match the binary`);
      const buffer = fs.readFileSync(absoluteFile);
      const inspected = inspectImageBytes(buffer);
      if (
        !inspected ||
        inspected.mime !== 'image/webp' ||
        inspected.width !== asset.width ||
        inspected.height !== asset.height ||
        inspected.width !== 1600 ||
        inspected.height !== 900
      ) {
        errors.push(`${location} binary format or dimensions do not match the manifest`);
      }
      if (SHA256.test(sha256) && hashFile(absoluteFile) !== sha256) {
        errors.push(`${location}.sha256 does not match the binary`);
      }
    } catch {
      errors.push(`${location}.file is missing or unreadable`);
      return;
    }

    mediaByCategory[category] = [
      {
        kind: 'image',
        url: `/uploads/exercises/fallbacks/${file}`,
        source: 'aquazerofit',
        licence,
        licenceAuthor: owner,
        attributionText: `© ${owner}`,
        isAiGenerated,
      },
    ];
  });

  for (const category of FALLBACK_CATEGORIES) {
    if (!seenCategories.has(category)) errors.push(`missing ${category} fallback assignment`);
  }
  if (errors.length > 0) {
    throw new Error(`Invalid fallback media manifest:\n- ${errors.join('\n- ')}`);
  }
  return mediaByCategory as Record<ExerciseCategory, ExerciseMedia[]>;
}
