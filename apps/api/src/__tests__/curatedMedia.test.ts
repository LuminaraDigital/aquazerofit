import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Exercise } from '@aquazerofit/shared';
import {
  applyCuratedMediaToExercise,
  readFallbackMediaManifest,
  readCuratedMediaRegistry,
  validateCuratedMediaManifest,
  type CuratedMediaManifestInput,
} from '../data/media/curatedMedia';
import { finalizeImportedExerciseMedia } from '../data/wger/importer';
import { finalizeSeedExerciseMedia } from '../data/seeds/exercises';
import { exercisesSeed } from '../data/seeds/exercises';
import { createApp } from '../app';

const temporaryDirectories: string[] = [];

function webpBytes(bytes = 128, width = 1600, height = 900): Buffer {
  const buffer = Buffer.alloc(bytes, 0);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(bytes - 8, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

const DEFAULT_ASSET_SHA256 = crypto.createHash('sha256').update(webpBytes()).digest('hex');
const FALLBACK_CATEGORIES = ['strength', 'cardio', 'core', 'mobility'] as const;

function createCuratedRoot(): string {
  const exercisesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqf-curated-media-'));
  const curatedRoot = path.join(exercisesRoot, 'curated');
  fs.mkdirSync(curatedRoot);
  temporaryDirectories.push(exercisesRoot);
  return curatedRoot;
}

function writeAsset(root: string, relativeFile: string, bytes = 128): void {
  const destination = path.join(root, ...relativeFile.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, webpBytes(bytes));
}

function manifestEntry(overrides: Record<string, unknown> = {}): CuratedMediaManifestInput {
  return {
    schemaVersion: 1,
    entries: [
      {
        exerciseId: 'ex-100',
        media: [
          {
            file: 'ex-100/start.webp',
            kind: 'image',
            owner: 'AquaZeroFit',
            creator: 'AquaZeroFit design team',
            licence: 'AquaZeroFit proprietary',
            attributionText: '© AquaZeroFit',
            licenceAuthor: 'AquaZeroFit',
            creationMethod: 'manual-illustration',
            isAiGenerated: false,
            createdAt: '2026-07-31',
            containsIdentifiablePerson: false,
            sha256: DEFAULT_ASSET_SHA256,
            review: {
              status: 'approved',
              decisionDate: '2026-07-31',
              technicalReviewer: 'Technical Reviewer',
              technicalReviewedAt: '2026-07-31',
              formSafetyReviewer: 'Form Safety Reviewer',
              formSafetyQualification: 'Accredited exercise professional',
              formSafetyReviewedAt: '2026-07-31',
              contentLicensingReviewer: 'Content Reviewer',
              contentLicensingReviewedAt: '2026-07-31',
              releaseOwner: 'Release Owner',
              releaseReviewedAt: '2026-07-31',
            },
          },
        ],
        ...overrides,
      },
    ],
  };
}

function fallbackManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    purpose: 'Decorative category fallback artwork; never exercise-form instruction',
    createdAt: '2026-07-31',
    owner: 'AquaZeroFit',
    creator: 'OpenAI built-in ImageGen directed by AquaZeroFit',
    creationMethod: 'ai-generated',
    modelToolVersion: 'OpenAI built-in ImageGen; model version not exposed',
    licence: 'AquaZeroFit project asset',
    promptSourceReference: 'content/workout-media-fallback-prompts.md',
    review: {
      status: 'approved-for-decorative-fallback-use',
      reviewedAt: '2026-07-31',
      reviewedBy: 'Technical reviewer',
      formSafetyReviewRequired: false,
      reason: 'Decorative category artwork, not movement instruction.',
    },
    assets: FALLBACK_CATEGORIES.map((category) => ({
      category,
      file: `${category}.webp`,
      width: 1600,
      height: 900,
      bytes: 128,
      sha256: DEFAULT_ASSET_SHA256,
    })),
    ...overrides,
  };
}

function writeFallbackFixture(root: string): string {
  for (const category of FALLBACK_CATEGORIES) {
    writeAsset(root, `${category}.webp`);
  }
  const manifestFile = path.join(path.dirname(root), 'fallback-manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(fallbackManifest()), 'utf8');
  return manifestFile;
}

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-100',
    type: 'exercise',
    name: 'Bodyweight squat',
    description: 'Controlled squat.',
    category: 'strength',
    primaryMuscles: ['quadriceps'],
    secondaryMuscles: ['glutes'],
    equipment: ['none'],
    difficulty: 'beginner',
    media: [{ kind: 'image', url: '/uploads/exercise-placeholder.svg' }],
    licence: 'AquaZeroFit proprietary',
    licenceAuthor: 'AquaZeroFit',
    sourceId: 'aqf-ex-100',
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('validateCuratedMediaManifest', () => {
  it('reads a private manifest separately from the publicly served asset root', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');
    const manifestFile = path.join(path.dirname(root), 'private-curated-manifest.json');
    fs.writeFileSync(manifestFile, JSON.stringify(manifestEntry()), 'utf8');

    const registry = readCuratedMediaRegistry(manifestFile, root);

    expect(registry.findForExercise(exercise())).toBeDefined();
  });

  it('accepts the empty manifest before pilot assets are added', () => {
    const root = createCuratedRoot();

    const registry = validateCuratedMediaManifest(
      { schemaVersion: 1, entries: [] },
      { curatedRoot: root },
    );

    expect(registry.size).toBe(0);
  });

  it('accepts complete reviewed provenance and resolves a stable exercise id', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');

    const registry = validateCuratedMediaManifest(manifestEntry(), { curatedRoot: root });

    expect(registry.size).toBe(1);
    expect(registry.findForExercise(exercise())?.media[0]).toEqual({
      kind: 'image',
      url: '/uploads/exercises/curated/ex-100/start.webp',
      source: 'aquazerofit',
      licence: 'AquaZeroFit proprietary',
      licenceAuthor: 'AquaZeroFit',
      attributionText: '© AquaZeroFit',
      isAiGenerated: false,
    });
  });

  it('supports a wger UUID instead of a display name', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'wger/start.webp');
    const manifest = manifestEntry({
      exerciseId: undefined,
      wgerUuid: '00fcf603-b0d0-48d2-9b5e-c7f0d510d46c',
      media: [
        {
          ...(manifestEntry().entries[0]!.media[0] as object),
          file: 'wger/start.webp',
        },
      ],
    });

    const registry = validateCuratedMediaManifest(manifest, { curatedRoot: root });

    expect(
      registry.findForExercise(
        exercise({
          id: 'ex-wger-00fc',
          wgerUuid: '00fcf603-b0d0-48d2-9b5e-c7f0d510d46c',
        }),
      ),
    ).toBeDefined();
  });

  it.each([
    ['missing file', manifestEntry()],
    [
      'incomplete provenance',
      manifestEntry({
        media: [
          {
            ...(manifestEntry().entries[0]!.media[0] as object),
            owner: '',
          },
        ],
      }),
    ],
    [
      'unreviewed demonstration',
      manifestEntry({
        media: [
          {
            ...(manifestEntry().entries[0]!.media[0] as object),
            review: {
              status: 'pending',
              decisionDate: '2026-07-31',
              technicalReviewer: 'Technical Reviewer',
              technicalReviewedAt: '2026-07-31',
              formSafetyReviewer: 'Form Safety Reviewer',
              formSafetyQualification: 'Accredited exercise professional',
              formSafetyReviewedAt: '2026-07-31',
              contentLicensingReviewer: 'Content Reviewer',
              contentLicensingReviewedAt: '2026-07-31',
              releaseOwner: 'Release Owner',
              releaseReviewedAt: '2026-07-31',
            },
          },
        ],
      }),
    ],
  ])('rejects %s', (_label, manifest) => {
    const root = createCuratedRoot();
    if (_label !== 'missing file') writeAsset(root, 'ex-100/start.webp');

    expect(() => validateCuratedMediaManifest(manifest, { curatedRoot: root })).toThrow();
  });

  it('rejects duplicate primary assignments', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');
    writeAsset(root, 'ex-100/finish.webp');
    const first = manifestEntry().entries[0]!;
    const manifest: CuratedMediaManifestInput = {
      schemaVersion: 1,
      entries: [
        first,
        {
          ...first,
          media: [
            {
              ...first.media[0]!,
              file: 'ex-100/finish.webp',
            },
          ],
        },
      ],
    };

    expect(() => validateCuratedMediaManifest(manifest, { curatedRoot: root })).toThrow(
      /duplicate/i,
    );
  });

  it.each([
    '../import-attribution.wger.json',
    '/absolute/start.webp',
    'ex-100\\..\\start.webp',
    'https://example.com/start.webp',
    'ex-100/%2e%2e/start.webp',
    'ex-100/start.webp?download=1',
    'ex-100/start.webp#fragment',
  ])('rejects unsafe asset path %s', (file) => {
    const root = createCuratedRoot();
    const manifest = manifestEntry({
      media: [
        {
          ...manifestEntry().entries[0]!.media[0]!,
          file,
        },
      ],
    });

    expect(() => validateCuratedMediaManifest(manifest, { curatedRoot: root })).toThrow(
      /path|file/i,
    );
  });

  it('rejects a non-HTTPS attribution URL before it can reach the client', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');
    const media = manifestEntry().entries[0]!.media[0]!;
    const manifest = manifestEntry({
      media: [
        {
          ...media,
          licence: 'CC-BY 4.0',
          licenceUrl: 'javascript:alert(1)',
        },
      ],
    });

    expect(() => validateCuratedMediaManifest(manifest, { curatedRoot: root })).toThrow(
      /HTTPS|URL/i,
    );
  });

  it('rejects unsupported and oversized assets', () => {
    const unsupportedRoot = createCuratedRoot();
    writeAsset(unsupportedRoot, 'ex-100/start.svg');
    const unsupported = manifestEntry({
      media: [
        {
          ...manifestEntry().entries[0]!.media[0]!,
          file: 'ex-100/start.svg',
        },
      ],
    });
    expect(() =>
      validateCuratedMediaManifest(unsupported, { curatedRoot: unsupportedRoot }),
    ).toThrow(/format/i);

    const oversizedRoot = createCuratedRoot();
    writeAsset(oversizedRoot, 'ex-100/start.webp', 400 * 1024 + 1);
    expect(() =>
      validateCuratedMediaManifest(manifestEntry(), { curatedRoot: oversizedRoot }),
    ).toThrow(/size/i);
  });

  it('rejects corrupt or incorrectly dimensioned image content', () => {
    const corruptRoot = createCuratedRoot();
    const corruptFile = path.join(corruptRoot, 'ex-100', 'start.webp');
    fs.mkdirSync(path.dirname(corruptFile), { recursive: true });
    fs.writeFileSync(corruptFile, Buffer.alloc(128, 1));
    const corruptSha = crypto.createHash('sha256').update(Buffer.alloc(128, 1)).digest('hex');
    const corruptManifest = manifestEntry({
      media: [{ ...manifestEntry().entries[0]!.media[0]!, sha256: corruptSha }],
    });
    expect(() =>
      validateCuratedMediaManifest(corruptManifest, { curatedRoot: corruptRoot }),
    ).toThrow(/content|format/i);

    const wrongRoot = createCuratedRoot();
    const wrongBytes = webpBytes(128, 800, 900);
    const wrongFile = path.join(wrongRoot, 'ex-100', 'start.webp');
    fs.mkdirSync(path.dirname(wrongFile), { recursive: true });
    fs.writeFileSync(wrongFile, wrongBytes);
    const wrongManifest = manifestEntry({
      media: [
        {
          ...manifestEntry().entries[0]!.media[0]!,
          sha256: crypto.createHash('sha256').update(wrongBytes).digest('hex'),
        },
      ],
    });
    expect(() =>
      validateCuratedMediaManifest(wrongManifest, { curatedRoot: wrongRoot }),
    ).toThrow(/1600x900/i);
  });

  it('requires AI provenance to be explicitly and consistently labelled', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');
    const media = manifestEntry().entries[0]!.media[0]!;
    const aiManifest = manifestEntry({
      media: [
        {
          ...media,
          creationMethod: 'ai-generated',
          isAiGenerated: true,
          modelToolVersion: 'Approved image model v1',
          promptSourceReference: 'content/prompts/ex-100.md',
        },
      ],
    });

    const registry = validateCuratedMediaManifest(aiManifest, { curatedRoot: root });
    expect(registry.findForExercise(exercise())?.isAiGenerated).toBe(true);
    expect(registry.findForExercise(exercise())?.media[0]?.isAiGenerated).toBe(true);

    expect(() =>
      validateCuratedMediaManifest(
        manifestEntry({
          media: [
            {
              ...media,
              creationMethod: 'ai-generated',
              isAiGenerated: false,
              modelToolVersion: 'Approved image model v1',
              promptSourceReference: 'content/prompts/ex-100.md',
            },
          ],
        }),
        { curatedRoot: root },
      ),
    ).toThrow(/AI/i);
  });
});

describe('applyCuratedMediaToExercise', () => {
  it('keeps valid wger media first and does not change attribution', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');
    const registry = validateCuratedMediaManifest(manifestEntry(), { curatedRoot: root });
    const input = exercise({
      sourceId: 'wger-upstream',
      wgerUuid: '00fcf603-b0d0-48d2-9b5e-c7f0d510d46c',
      media: [
        {
          kind: 'image',
          url: '/uploads/exercises/00fcf603-b0d0-48d2-9b5e-c7f0d510d46c/upstream.webp',
        },
      ],
      licence: 'CC-BY-SA 3',
      licenceAuthor: 'wger contributor',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    });
    writeAsset(
      path.resolve(root, '..'),
      '00fcf603-b0d0-48d2-9b5e-c7f0d510d46c/upstream.webp',
    );

    const output = applyCuratedMediaToExercise(input, registry, {
      exercisesRoot: path.resolve(root, '..'),
    });

    expect(output.media).toEqual(input.media);
    expect(output.licence).toBe(input.licence);
    expect(output.licenceAuthor).toBe(input.licenceAuthor);
    expect(output.licenceUrl).toBe(input.licenceUrl);
  });

  it('uses reviewed curated media only when upstream media is unavailable', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');
    const registry = validateCuratedMediaManifest(manifestEntry(), { curatedRoot: root });

    const output = applyCuratedMediaToExercise(exercise(), registry, {
      exercisesRoot: path.resolve(root, '..'),
    });

    expect(output.media).toEqual([
      {
        kind: 'image',
        url: '/uploads/exercises/curated/ex-100/start.webp',
        source: 'aquazerofit',
        licence: 'AquaZeroFit proprietary',
        licenceAuthor: 'AquaZeroFit',
        attributionText: '© AquaZeroFit',
        isAiGenerated: false,
      },
    ]);
  });

  it('fails closed to the category fallback when curated media cannot match', () => {
    const root = createCuratedRoot();
    writeAsset(path.resolve(root, '..'), 'fallbacks/strength.webp');
    const registry = validateCuratedMediaManifest(
      { schemaVersion: 1, entries: [] },
      { curatedRoot: root },
    );

    const output = applyCuratedMediaToExercise(
      exercise({ isAiGeneratedMedia: true }),
      registry,
      {
      exercisesRoot: path.resolve(root, '..'),
      categoryFallbacks: {
        strength: [{ kind: 'image', url: '/uploads/exercises/fallbacks/strength.webp' }],
      },
      },
    );

    expect(output.media).toEqual([
      { kind: 'image', url: '/uploads/exercises/fallbacks/strength.webp' },
    ]);
    expect(output.isAiGeneratedMedia).toBeUndefined();
  });

  it('fails closed when a curated file disappears after startup validation', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');
    writeAsset(path.resolve(root, '..'), 'fallbacks/strength.webp');
    const registry = validateCuratedMediaManifest(manifestEntry(), { curatedRoot: root });
    fs.rmSync(path.join(root, 'ex-100', 'start.webp'));

    const output = applyCuratedMediaToExercise(exercise(), registry, {
      exercisesRoot: path.resolve(root, '..'),
      categoryFallbacks: {
        strength: [{ kind: 'image', url: '/uploads/exercises/fallbacks/strength.webp' }],
      },
    });

    expect(output.media).toEqual([
      { kind: 'image', url: '/uploads/exercises/fallbacks/strength.webp' },
    ]);
  });

  it('uses the verified AI-generated default category fallback with disclosure', () => {
    const root = createCuratedRoot();
    writeAsset(path.resolve(root, '..'), 'fallbacks/strength.webp');
    const registry = validateCuratedMediaManifest(
      { schemaVersion: 1, entries: [] },
      { curatedRoot: root },
    );

    const output = applyCuratedMediaToExercise(
      exercise({ isAiGeneratedMedia: true }),
      registry,
      { exercisesRoot: path.resolve(root, '..') },
    );

    expect(output.media).toEqual([
      {
        kind: 'image',
        url: '/uploads/exercises/fallbacks/strength.webp',
        source: 'aquazerofit',
        licence: 'AquaZeroFit project asset',
        licenceAuthor: 'AquaZeroFit',
        attributionText: '© AquaZeroFit',
        isAiGenerated: true,
      },
    ]);
    expect(output.isAiGeneratedMedia).toBe(true);
  });

  it('is deterministic and idempotent across repeated import application', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');
    const registry = validateCuratedMediaManifest(manifestEntry(), { curatedRoot: root });
    const options = { exercisesRoot: path.resolve(root, '..') };

    const first = applyCuratedMediaToExercise(exercise(), registry, options);
    const second = applyCuratedMediaToExercise(first, registry, options);

    expect(second).toEqual(first);
    expect(second.media).toHaveLength(1);
  });

  it('does not preserve an arbitrary remote pre-existing media URL', () => {
    const root = createCuratedRoot();
    const registry = validateCuratedMediaManifest(
      { schemaVersion: 1, entries: [] },
      { curatedRoot: root },
    );

    const output = applyCuratedMediaToExercise(
      exercise({ media: [{ kind: 'image', url: 'https://tracker.example/image.webp' }] }),
      registry,
      {
        exercisesRoot: path.resolve(root, '..'),
        categoryFallbacks: {},
      },
    );

    expect(output.media).toEqual([]);
  });
});

describe('fallback media manifest', () => {
  it('derives runtime media provenance from a fully validated manifest', () => {
    const curatedRoot = createCuratedRoot();
    const fallbackRoot = path.join(path.dirname(curatedRoot), 'fallbacks');
    const manifestFile = writeFallbackFixture(fallbackRoot);

    const registry = readFallbackMediaManifest(manifestFile, fallbackRoot);

    expect(registry.strength[0]).toEqual({
      kind: 'image',
      url: '/uploads/exercises/fallbacks/strength.webp',
      source: 'aquazerofit',
      licence: 'AquaZeroFit project asset',
      licenceAuthor: 'AquaZeroFit',
      attributionText: '© AquaZeroFit',
      isAiGenerated: true,
    });
  });

  it('rejects a binary that was tampered with after its hash was recorded', () => {
    const curatedRoot = createCuratedRoot();
    const fallbackRoot = path.join(path.dirname(curatedRoot), 'fallbacks');
    const manifestFile = writeFallbackFixture(fallbackRoot);
    fs.appendFileSync(path.join(fallbackRoot, 'strength.webp'), Buffer.from([1]));

    expect(() => readFallbackMediaManifest(manifestFile, fallbackRoot)).toThrow(/bytes|SHA-256/i);
  });

  it.each([
    [
      'category/filename mismatch',
      () => {
        const manifest = fallbackManifest();
        manifest.assets[0]!.file = 'cardio.webp';
        return manifest;
      },
    ],
    [
      'missing provenance',
      () => fallbackManifest({ licence: '' }),
    ],
    [
      'unapproved review',
      () => fallbackManifest({
        review: {
          ...fallbackManifest().review,
          status: 'pending',
        },
      }),
    ],
    [
      'dimension mismatch',
      () => {
        const manifest = fallbackManifest();
        manifest.assets[0]!.width = 800;
        return manifest;
      },
    ],
  ])('rejects %s', (_label, createManifest) => {
    const curatedRoot = createCuratedRoot();
    const fallbackRoot = path.join(path.dirname(curatedRoot), 'fallbacks');
    const manifestFile = writeFallbackFixture(fallbackRoot);
    fs.writeFileSync(manifestFile, JSON.stringify(createManifest()), 'utf8');

    expect(() => readFallbackMediaManifest(manifestFile, fallbackRoot)).toThrow();
  });
});

describe('wger importer media integration', () => {
  it('finalizes imported records through the same deterministic resolver', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');
    const registry = validateCuratedMediaManifest(manifestEntry(), { curatedRoot: root });
    const options = { exercisesRoot: path.resolve(root, '..') };

    const first = finalizeImportedExerciseMedia(exercise(), registry, options);
    const second = finalizeImportedExerciseMedia(first, registry, options);

    expect(second).toEqual(first);
    expect(second.media).toEqual([
      {
        kind: 'image',
        url: '/uploads/exercises/curated/ex-100/start.webp',
        source: 'aquazerofit',
        licence: 'AquaZeroFit proprietary',
        licenceAuthor: 'AquaZeroFit',
        attributionText: '© AquaZeroFit',
        isAiGenerated: false,
      },
    ]);
  });
});

describe('seed media integration', () => {
  it('uses the same stable-id resolution as the importer', () => {
    const root = createCuratedRoot();
    writeAsset(root, 'ex-100/start.webp');
    const registry = validateCuratedMediaManifest(manifestEntry(), { curatedRoot: root });

    const resolved = finalizeSeedExerciseMedia(exercise(), registry, {
      exercisesRoot: path.resolve(root, '..'),
    });

    expect(resolved.media).toEqual([
      {
        kind: 'image',
        url: '/uploads/exercises/curated/ex-100/start.webp',
        source: 'aquazerofit',
        licence: 'AquaZeroFit proprietary',
        licenceAuthor: 'AquaZeroFit',
        attributionText: '© AquaZeroFit',
        isAiGenerated: false,
      },
    ]);
  });

  it('uses the checked-in default fallback and AI disclosure in the real seed corpus', () => {
    const seededStrength = exercisesSeed.find((item) => item.category === 'strength');

    expect(seededStrength?.media[0]?.url).toBe(
      '/uploads/exercises/fallbacks/strength.webp',
    );
    expect(seededStrength?.media[0]).toMatchObject({
      source: 'aquazerofit',
      attributionText: '© AquaZeroFit',
      isAiGenerated: true,
    });
    expect(seededStrength?.isAiGeneratedMedia).toBe(true);
  });
});

describe('manifest privacy boundary', () => {
  it('does not expose the private curated manifest through /uploads', async () => {
    const response = await request(createApp()).get(
      '/uploads/exercises/curated/manifest.json',
    );

    expect(response.status).toBe(404);
  });

  it('fails startup registry loading when the private manifest is unavailable', () => {
    const root = createCuratedRoot();
    expect(() =>
      readCuratedMediaRegistry(path.join(root, 'missing-manifest.json'), root),
    ).toThrow();
  });
});
