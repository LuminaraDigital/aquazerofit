/**
 * wger exercise ETL core (wger-integration-plan.md Phase 1.4).
 *
 * Crawls the public wger API v2 `exerciseinfo` bulk-export endpoint, validates
 * every record with the shared zod schema, maps the wger taxonomy through
 * ./mappings, and upserts Exercise documents into the `content` container
 * keyed by the stable wger UUID (never integer ids). Exercise images are
 * mirrored into apps/api/assets/exercises/<wgerUuid>/ (served via /uploads) —
 * hotlinking is prohibited. Per-image attribution is written to the sidecar
 * manifest assets/exercises/import-attribution.wger.json.
 *
 * Legacy fake seed records (sourceId `wger-1xx`) are retired: a record whose
 * name matches an imported exercise is adopted (the imported data keeps the
 * legacy id so existing plan references survive); unmatched fakes are
 * deleted.
 *
 * Incremental mode (--incremental / { incremental: true }): records whose
 * last_update_global predates the previous run are skipped, and the wger
 * deletion-log is replayed to remove locally deleted bases.
 *
 * Politeness (plan compliance checklist): ~600 ms spacing between API calls,
 * 429/Retry-After honoured with exponential backoff, images at ~250 ms.
 * Consumed by the CLI (apps/api/scripts/wgerImport.ts) and by
 * POST /admin/exercises/import.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  wgerDeletionLogEntrySchema,
  wgerExerciseInfoSchema,
  wgerLicenceSchema,
  wgerPaginatedSchema,
  type Exercise,
  type ExerciseMedia,
  type WgerExerciseInfo,
} from '@aquazerofit/shared';
import { getStore, type JsonStore } from '../../platform/store';
import {
  applyCuratedMediaToExercise,
  readCuratedMediaRegistry,
  type CuratedMediaRegistry,
  type CuratedMediaResolutionOptions,
} from '../media/curatedMedia';
import {
  isSafeStoredUpstreamImage,
  MAX_UPSTREAM_IMAGE_BYTES,
  validateUpstreamImageBytes,
} from '../media/imageValidation';
import {
  deriveDifficulty,
  sanitizeWgerDescription,
  WGER_CATEGORY_MAP,
  WGER_EQUIPMENT_MAP,
  WGER_MUSCLE_MAP,
} from './mappings';

const WGER_API_BASE = 'https://wger.de/api/v2';
/** Identifying User-Agent — polite clients announce themselves. */
const USER_AGENT = 'AquaZeroFit-ETL/1.0 (+https://aquazero.fit; contact: dev@aquazero.fit)';
const ENGLISH_LANGUAGE_ID = 2;
const PAGE_LIMIT = 200;
const API_MIN_INTERVAL_MS = 600;
const IMAGE_MIN_INTERVAL_MS = 250;
const MAX_RETRIES = 5;
const REQUEST_TIMEOUT_MS = 30_000;
const WGER_ALLOWED_HOSTS = new Set(['wger.de']);
const LEGACY_SEED_SOURCE = /^wger-1\d{2}$/;
const PLACEHOLDER_MEDIA: ExerciseMedia[] = [
  { kind: 'image', url: '/uploads/exercise-placeholder.svg' },
];
/** Best-effort attribution for legacy records with an empty author (plan §2.2 gray zone). */
const FALLBACK_AUTHOR = 'wger community contributors';
const curatedMediaRegistry = readCuratedMediaRegistry();

// ---------- types ----------

export interface WgerImportStats {
  mode: 'full' | 'incremental';
  state: 'running' | 'completed' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  /** wger server version from the OpenAPI schema (version pinning, plan §2.7). */
  wgerVersion: string;
  pages: number;
  fetched: number;
  created: number;
  updated: number;
  skippedStale: number;
  schemaRejected: number;
  retiredLegacy: number;
  retiredLegacyIds: string[];
  deletedViaLog: number;
  imagesMirrored: number;
  imagesSkippedExisting: number;
  imagesFailed: number;
  exercisesWithoutMuscles: number;
  errors: string[];
}

interface WgerLicenceInfo {
  shortName: string;
  fullName: string;
  url: string;
}

interface ImageAttributionEntry {
  wgerUuid: string;
  exerciseId: string;
  exerciseName: string;
  file: string;
  localUrl: string;
  sourceUrl: string;
  licence: string;
  licenceUrl: string;
  licenceAuthor: string;
  isAiGenerated: boolean;
}

interface ImportStateFile {
  lastSyncAt: string;
  lastUpdateGlobalMax: string;
  wgerVersion: string;
}

// ---------- module-level run status (drives GET /admin/exercises/import/status) ----------

let running = false;
let lastRun: WgerImportStats | null = null;

export function getWgerImportStatus(): { running: boolean; lastRun: WgerImportStats | null } {
  return { running, lastRun };
}

/**
 * Single persistence-boundary media reconciliation for imported records.
 * Exported to keep importer idempotence independently testable without
 * invoking the network crawler.
 */
export function finalizeImportedExerciseMedia(
  exercise: Exercise,
  registry: CuratedMediaRegistry = curatedMediaRegistry,
  options?: CuratedMediaResolutionOptions,
): Exercise {
  return applyCuratedMediaToExercise(exercise, registry, options);
}

// ---------- paths ----------

function assetsExercisesDir(): string {
  // .../apps/api/src/data/wger → .../apps/api/assets/exercises
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', 'assets', 'exercises');
}

function stateFilePath(): string {
  return path.join(getStore().dataDir, 'import-state.wger.json');
}

// ---------- HTTP with pacing + backoff ----------

let lastRequestAt = 0;

async function pace(minIntervalMs: number): Promise<void> {
  const wait = minIntervalMs - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

export function validateWgerRemoteUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid wger URL');
  }
  if (url.protocol !== 'https:' || !WGER_ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Invalid wger URL: HTTPS wger.de URLs only');
  }
  if (url.username || url.password) throw new Error('Invalid wger URL: credentials are forbidden');
  return url;
}

export async function fetchWithRetry(url: string, minIntervalMs: number): Promise<Response> {
  const safeUrl = validateWgerRemoteUrl(url).toString();
  let attempt = 0;
  for (;;) {
    await pace(minIntervalMs);
    let res: Response;
    try {
      res = await fetch(safeUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      });
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_RETRIES) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      attempt += 1;
      if (attempt > MAX_RETRIES) {
        throw new Error(`wger request failed after retries: ${res.status} ${safeUrl}`);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * 2 ** attempt;
      await res.body?.cancel().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`wger redirect rejected: ${res.status} ${safeUrl}`);
    }
    if (!res.ok) throw new Error(`wger request failed: ${res.status} ${safeUrl}`);
    return res;
  }
}

export async function readValidatedWgerImage(
  response: Response,
  options: { maxBytes?: number } = {},
): Promise<Buffer> {
  const maxBytes = Math.min(options.maxBytes ?? MAX_UPSTREAM_IMAGE_BYTES, MAX_UPSTREAM_IMAGE_BYTES);
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (!contentType || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`wger image content type is not allowed: ${contentType ?? 'missing'}`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`wger image is too large (maximum ${maxBytes} bytes)`);
  }
  if (!response.body) throw new Error('wger image response has no body');

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`wger image is too large (maximum ${maxBytes} bytes)`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = Buffer.concat(chunks, totalBytes);
  validateUpstreamImageBytes(buffer, contentType);
  return buffer;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetchWithRetry(url, API_MIN_INTERVAL_MS);
  return res.json();
}

// ---------- mapping ----------

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function mapMuscles(muscles: WgerExerciseInfo['muscles']): string[] {
  const mapped = new Set<string>();
  for (const m of muscles) {
    const target = WGER_MUSCLE_MAP[m.id];
    if (target) mapped.add(target);
  }
  return [...mapped];
}

function pickTranslation(info: WgerExerciseInfo) {
  return (
    info.translations.find((t) => t.language === ENGLISH_LANGUAGE_ID) ??
    info.translations[0] ??
    null
  );
}

function licenceFor(licenceId: number, registry: Map<number, WgerLicenceInfo>): WgerLicenceInfo {
  return (
    registry.get(licenceId) ?? {
      shortName: `wger-licence-${licenceId}`,
      fullName: 'Unknown wger licence',
      url: '',
    }
  );
}

// ---------- main ----------

export interface RunWgerImportOptions {
  incremental?: boolean;
  mirrorImages?: boolean;
}

export async function runWgerImport(options: RunWgerImportOptions = {}): Promise<WgerImportStats> {
  if (running) throw new Error('A wger import is already running');
  running = true;

  const stats: WgerImportStats = {
    mode: options.incremental ? 'incremental' : 'full',
    state: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    wgerVersion: 'unknown',
    pages: 0,
    fetched: 0,
    created: 0,
    updated: 0,
    skippedStale: 0,
    schemaRejected: 0,
    retiredLegacy: 0,
    retiredLegacyIds: [],
    deletedViaLog: 0,
    imagesMirrored: 0,
    imagesSkippedExisting: 0,
    imagesFailed: 0,
    exercisesWithoutMuscles: 0,
    errors: [],
  };
  lastRun = stats;
  const startedMs = Date.now();

  try {
    const store = getStore();
    const incremental = options.incremental === true;
    const mirrorImages = options.mirrorImages !== false;
    const priorState = incremental ? readImportState() : null;

    // ----- version pin (best-effort; the OpenAPI schema carries info.version) -----
    try {
      // /schema (no trailing slash) serves the OpenAPI document; content
      // negotiation may return JSON (quoted keys) or YAML — handle both.
      const res = await fetchWithRetry(`${WGER_API_BASE}/schema`, API_MIN_INTERVAL_MS);
      const text = await res.text();
      let version: string | undefined;
      try {
        version = (JSON.parse(text) as { info?: { version?: string } }).info?.version;
      } catch {
        version = /(^|\n)\s*version:\s*(\S+)/.exec(text)?.[2];
      }
      if (version) stats.wgerVersion = version;
    } catch (err) {
      stats.errors.push(`schema version probe failed: ${(err as Error).message}`);
    }

    // ----- licence registry (per-record attribution; never assume a blanket licence) -----
    const licences = new Map<number, WgerLicenceInfo>();
    const licencePage = wgerPaginatedSchema(wgerLicenceSchema).parse(
      await fetchJson(`${WGER_API_BASE}/license/`),
    );
    for (const l of licencePage.results) {
      licences.set(l.id, {
        shortName: l.short_name.trim(),
        fullName: l.full_name.trim(),
        url: l.url,
      });
    }

    // ----- crawl exerciseinfo -----
    const attribution: ImageAttributionEntry[] = [];
    const adoptedLegacyIds = new Set<string>();
    let maxLastUpdateGlobal = priorState?.lastUpdateGlobalMax ?? '';
    let url: string | null = `${WGER_API_BASE}/exerciseinfo/?limit=${PAGE_LIMIT}`;
    const pageSchema = wgerPaginatedSchema(wgerExerciseInfoSchema);

    while (url) {
      const rawPage = (await fetchJson(url)) as { next?: string | null; results?: unknown[] };
      stats.pages += 1;
      const results = Array.isArray(rawPage.results) ? rawPage.results : [];
      url = typeof rawPage.next === 'string' ? rawPage.next : null;

      for (const raw of results) {
        // Live-data tolerance: wger serializes image.thumbnails as null (not
        // omitted) on some records; the frozen Stage-1 schema only accepts an
        // object or absence, so normalize null → absent before validation.
        const rec = raw as { images?: ({ thumbnails?: unknown } | null)[] | null };
        if (Array.isArray(rec.images)) {
          for (const img of rec.images) {
            if (img && img.thumbnails === null) delete img.thumbnails;
          }
        }
        const parsed = wgerExerciseInfoSchema.safeParse(raw);
        if (!parsed.success) {
          stats.schemaRejected += 1;
          const id = (raw as { uuid?: string } | null)?.uuid ?? 'unknown';
          stats.errors.push(
            `schema rejected ${id}: ${parsed.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; ')}`,
          );
          continue;
        }
        const info = parsed.data;
        stats.fetched += 1;
        if (info.last_update_global > maxLastUpdateGlobal) {
          maxLastUpdateGlobal = info.last_update_global;
        }
        if (priorState && info.last_update_global <= priorState.lastUpdateGlobalMax) {
          stats.skippedStale += 1;
          continue;
        }

        const outcome = upsertExercise(store, info, licences, adoptedLegacyIds, stats);
        if (!outcome) continue;
        if (mirrorImages) {
          await mirrorExerciseImages(info, outcome, licences, attribution, stats);
        }
        outcome.exercise = finalizeImportedExerciseMedia(outcome.exercise);
        // Persist media after mirroring (urls point at /uploads/exercises/...).
        store.upsert('content', outcome.exercise);
        if (outcome.created) stats.created += 1;
        else stats.updated += 1;
      }
      // Flush incrementally so a crash mid-crawl keeps completed pages.
      await store.flush();
    }

    // ----- retire legacy fake seeds -----
    const legacy = store.where<Exercise>(
      'content',
      (d) => d.type === 'exercise' && LEGACY_SEED_SOURCE.test(d.sourceId) && !adoptedLegacyIds.has(d.id),
    );
    for (const doc of legacy) {
      store.delete('content', doc.id);
      stats.retiredLegacyIds.push(doc.id);
    }
    stats.retiredLegacy = legacy.length;

    // ----- deletion log (incremental removals) -----
    if (incremental) {
      stats.deletedViaLog = await replayDeletionLog(store, priorState?.lastSyncAt ?? null, stats);
    }

    // ----- sidecar attribution manifest (travels with the mirrored binaries) -----
    if (mirrorImages && attribution.length > 0) {
      const dir = assetsExercisesDir();
      fs.mkdirSync(dir, { recursive: true });
      const manifest = {
        generatedAt: new Date().toISOString(),
        source: 'wger.de API v2 exerciseinfo',
        wgerVersion: stats.wgerVersion,
        note: 'Per-image attribution for mirrored wger exercise media. Attribution fields are never stripped (AQF-12).',
        images: attribution,
      };
      fs.writeFileSync(
        path.join(dir, 'import-attribution.wger.json'),
        JSON.stringify(manifest, null, 1),
        'utf8',
      );
    }

    // ----- sync cursor -----
    writeImportState({
      lastSyncAt: stats.startedAt,
      lastUpdateGlobalMax: maxLastUpdateGlobal,
      wgerVersion: stats.wgerVersion,
    });

    await store.flush();
    stats.state = 'completed';
  } catch (err) {
    stats.state = 'failed';
    stats.errors.push((err as Error).message);
  } finally {
    stats.finishedAt = new Date().toISOString();
    stats.durationMs = Date.now() - startedMs;
    running = false;
  }
  return stats;
}

// ---------- upsert + reconcile ----------

interface UpsertOutcome {
  exercise: Exercise;
  created: boolean;
}

function upsertExercise(
  store: JsonStore,
  info: WgerExerciseInfo,
  licences: Map<number, WgerLicenceInfo>,
  adoptedLegacyIds: Set<string>,
  stats: WgerImportStats,
): UpsertOutcome | null {
  const translation = pickTranslation(info);
  if (!translation || !translation.name.trim()) {
    stats.errors.push(`no usable translation for ${info.uuid}`);
    return null;
  }

  const category = WGER_CATEGORY_MAP[info.category.id] ?? 'strength';
  const primaryMuscles = mapMuscles(info.muscles);
  const secondaryMuscles = mapMuscles(info.muscles_secondary).filter(
    (m) => !primaryMuscles.includes(m),
  );
  if (primaryMuscles.length === 0) {
    stats.exercisesWithoutMuscles += 1;
    primaryMuscles.push('full body'); // keep the record visible/pool-debuggable
  }
  const equipment = [
    ...new Set(
      info.equipment
        .map((e) => WGER_EQUIPMENT_MAP[e.id])
        .filter((e): e is NonNullable<typeof e> => e !== undefined),
    ),
  ];
  if (equipment.length === 0) equipment.push('none');

  const licence = licenceFor(translation.license, licences);
  const description = sanitizeWgerDescription(translation.description);
  const name = translation.name.trim().slice(0, 120);

  // Identity: wgerUuid is the stable upsert key.
  const byUuid = store.findOne<Exercise>(
    'content',
    (d) => d.type === 'exercise' && d.wgerUuid === info.uuid,
  );
  let id: string;
  let created: boolean;
  let existingMedia: ExerciseMedia[] | null = null;
  if (byUuid) {
    id = byUuid.id;
    created = false;
    existingMedia = byUuid.media;
  } else {
    // Reconcile a legacy fake seed by name: adopt its id so existing plan
    // references keep resolving (retirement list skips adopted ids).
    const legacy = store.findOne<Exercise>(
      'content',
      (d) =>
        d.type === 'exercise' &&
        LEGACY_SEED_SOURCE.test(d.sourceId) &&
        normalizeName(d.name) === normalizeName(name),
    );
    if (legacy) {
      id = legacy.id;
      adoptedLegacyIds.add(legacy.id);
      created = false;
      existingMedia = legacy.media;
    } else {
      id = `ex-wger-${info.uuid}`;
      created = true;
    }
  }

  const exercise: Exercise = {
    id,
    type: 'exercise',
    name,
    description: description || name,
    category,
    primaryMuscles,
    secondaryMuscles,
    equipment,
    difficulty: deriveDifficulty({ category, equipment, primaryMuscles, secondaryMuscles }),
    // Media replaced by the mirror step when images exist; otherwise keep
    // whatever the record already had (placeholder on first import).
    media: existingMedia ?? PLACEHOLDER_MEDIA,
    // Attribution — never stripped (AQF-12).
    licence: licence.shortName,
    licenceAuthor: translation.license_author || info.license_author || FALLBACK_AUTHOR,
    sourceId: `wger-${info.uuid}`,
    wgerUuid: info.uuid,
    variationGroup: info.variation_group,
    licenceUrl: licence.url || undefined,
    isAiGeneratedMedia: info.images.some((img) => img.is_ai_generated === true) || undefined,
  };
  return { exercise, created };
}

// ---------- media mirror ----------

function extensionFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return /^\.(jpe?g|png|gif|webp|svg)$/.test(ext) ? ext : '.jpg';
  } catch {
    return '.jpg';
  }
}

export function createWgerImageMedia(
  image: WgerExerciseInfo['images'][number],
  licence: WgerLicenceInfo,
  localUrl: string,
): ExerciseMedia {
  const licenceAuthor = image.license_author.trim() || FALLBACK_AUTHOR;
  return {
    kind: 'image',
    url: localUrl,
    source: 'wger',
    licence: licence.shortName,
    licenceAuthor,
    ...(licence.url ? { licenceUrl: licence.url } : {}),
    attributionText: `© ${licenceAuthor}`,
    isAiGenerated: image.is_ai_generated === true,
  };
}

async function mirrorExerciseImages(
  info: WgerExerciseInfo,
  outcome: UpsertOutcome,
  licences: Map<number, WgerLicenceInfo>,
  attribution: ImageAttributionEntry[],
  stats: WgerImportStats,
): Promise<void> {
  if (info.images.length === 0) return;
  const dir = path.join(assetsExercisesDir(), info.uuid);
  const media: ExerciseMedia[] = [];

  for (const image of info.images) {
    const filename = `${image.uuid}${extensionFromUrl(image.image)}`;
    const dest = path.join(dir, filename);
    const localUrl = `/uploads/exercises/${info.uuid}/${filename}`;
    const licence = licenceFor(image.license, licences);
    const mediaItem = createWgerImageMedia(image, licence, localUrl);
    media.push(mediaItem);
    attribution.push({
      wgerUuid: info.uuid,
      exerciseId: outcome.exercise.id,
      exerciseName: outcome.exercise.name,
      file: `exercises/${info.uuid}/${filename}`,
      localUrl,
      sourceUrl: image.image,
      licence: mediaItem.licence ?? licence.shortName,
      licenceUrl: mediaItem.licenceUrl ?? '',
      licenceAuthor: mediaItem.licenceAuthor ?? FALLBACK_AUTHOR,
      isAiGenerated: mediaItem.isAiGenerated === true,
    });

    if (fs.existsSync(dest) && isSafeStoredUpstreamImage(dest)) {
      stats.imagesSkippedExisting += 1;
      continue;
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      const res = await fetchWithRetry(image.image, IMAGE_MIN_INTERVAL_MS);
      const buffer = await readValidatedWgerImage(res);
      fs.writeFileSync(dest, buffer);
      stats.imagesMirrored += 1;
    } catch (err) {
      stats.imagesFailed += 1;
      stats.errors.push(`image download failed ${image.uuid}: ${(err as Error).message}`);
    }
  }
  outcome.exercise.media = media;
}

// ---------- incremental state + deletion log ----------

function readImportState(): ImportStateFile | null {
  try {
    const file = stateFilePath();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ImportStateFile;
  } catch {
    return null;
  }
}

function writeImportState(state: ImportStateFile): void {
  fs.writeFileSync(stateFilePath(), JSON.stringify(state, null, 1), 'utf8');
}

async function replayDeletionLog(
  store: JsonStore,
  since: string | null,
  stats: WgerImportStats,
): Promise<number> {
  let deleted = 0;
  try {
    let url: string | null = `${WGER_API_BASE}/deletion-log/?limit=${PAGE_LIMIT}`;
    const pageSchema = wgerPaginatedSchema(wgerDeletionLogEntrySchema);
    while (url) {
      const page = pageSchema.parse(await fetchJson(url));
      for (const entry of page.results) {
        if (since && entry.timestamp <= since) continue;
        if (entry.model_type !== 'base') continue;
        const doomed = store.findOne<Exercise>(
          'content',
          (d) => d.type === 'exercise' && d.wgerUuid === entry.uuid,
        );
        if (doomed && store.delete('content', doomed.id)) deleted += 1;
      }
      url = page.next;
    }
  } catch (err) {
    // Deletion-log replay is best-effort: a failed replay must not fail the import.
    stats.errors.push(`deletion-log replay failed: ${(err as Error).message}`);
  }
  return deleted;
}
