import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Exercise } from '@aquazerofit/shared';
import {
  applyCuratedMediaToExercise,
  readAdoptedUpstreamMediaRegistry,
  readCuratedMediaRegistry,
  validateCuratedMediaManifest,
} from '../data/media/curatedMedia';
import { exercisesSeed } from '../data/seeds/exercises';

const WGER_UUID = 'c9e57bbe-e839-44c6-861d-1c8dd2845e36';
const OTHER_UUID = '10510fb5-6ebd-4ddc-b03e-423b15deceea';
const ASSET = `${WGER_UUID}/adopted.webp`;

const temporaryDirectories: string[] = [];

function webpBytes(bytes = 256, width = 1200, height = 630): Buffer {
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

function createExercisesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqf-adopted-media-'));
  fs.mkdirSync(path.join(root, 'curated'));
  temporaryDirectories.push(root);
  return root;
}

function writeAsset(root: string, relativeFile: string, bytes = 256): void {
  const destination = path.join(root, ...relativeFile.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, webpBytes(bytes));
}

function writeManifests(
  root: string,
  manifestOverrides: Record<string, unknown> = {},
  attributionOverrides: Record<string, unknown> = {},
): { manifestFile: string; attributionFile: string } {
  const manifestFile = path.join(root, 'adopted-upstream-manifest.json');
  const attributionFile = path.join(root, 'import-attribution.wger.json');
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        { exerciseId: 'ex-100', wgerUuid: WGER_UUID, files: [ASSET], ...manifestOverrides },
      ],
    }),
  );
  fs.writeFileSync(
    attributionFile,
    JSON.stringify({
      images: [
        {
          wgerUuid: WGER_UUID,
          file: `exercises/${ASSET}`,
          licence: 'CC-BY-SA 4',
          licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en',
          licenceAuthor: 'wger community contributors',
          isAiGenerated: false,
          ...attributionOverrides,
        },
      ],
    }),
  );
  return { manifestFile, attributionFile };
}

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-100',
    type: 'exercise',
    name: 'Plank',
    description: 'Hold a straight line from head to heels.',
    category: 'core',
    primaryMuscles: ['core'],
    secondaryMuscles: [],
    equipment: ['none'],
    difficulty: 'beginner',
    media: [{ kind: 'image', url: '/uploads/exercise-placeholder.svg' }],
    licence: 'CC-BY-SA 4.0',
    licenceAuthor: 'wger.de community contributors',
    sourceId: 'wger-135',
    ...overrides,
  };
}

function emptyCuratedRegistry(root: string) {
  return validateCuratedMediaManifest(
    { schemaVersion: 1, entries: [] },
    { curatedRoot: path.join(root, 'curated') },
  );
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('readAdoptedUpstreamMediaRegistry', () => {
  it('copies licence, author and AI disclosure verbatim from the import manifest', () => {
    const root = createExercisesRoot();
    writeAsset(root, ASSET);
    const { manifestFile, attributionFile } = writeManifests(root);

    const registry = readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile);

    expect(registry.size).toBe(1);
    expect(registry.findForExercise('ex-100', root)).toEqual([
      {
        kind: 'image',
        url: `/uploads/exercises/${ASSET}`,
        source: 'wger',
        licence: 'CC-BY-SA 4',
        licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en',
        licenceAuthor: 'wger community contributors',
        attributionText: '© wger community contributors',
        isAiGenerated: false,
      },
    ]);
  });

  it('preserves the upstream AI-generated flag', () => {
    const root = createExercisesRoot();
    writeAsset(root, ASSET);
    const { manifestFile, attributionFile } = writeManifests(root, {}, { isAiGenerated: true });

    const [media] = readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile).findForExercise(
      'ex-100',
      root,
    );

    expect(media?.isAiGenerated).toBe(true);
  });

  it('drops an entry whose file the import manifest does not attribute', () => {
    const root = createExercisesRoot();
    writeAsset(root, ASSET);
    const { manifestFile, attributionFile } = writeManifests(
      root,
      {},
      { file: 'exercises/somewhere-else.webp' },
    );

    expect(readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile).size).toBe(0);
  });

  it('drops an entry that claims a file belonging to another wger exercise', () => {
    const root = createExercisesRoot();
    writeAsset(root, ASSET);
    const { manifestFile, attributionFile } = writeManifests(root, { wgerUuid: OTHER_UUID });

    expect(readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile).size).toBe(0);
  });

  it('rejects a path that escapes the exercises root', () => {
    const root = createExercisesRoot();
    writeAsset(root, ASSET);
    const { manifestFile, attributionFile } = writeManifests(root, {
      files: [`../${ASSET}`],
    });

    expect(readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile).size).toBe(0);
  });

  it('returns nothing when the referenced binary has been removed', () => {
    const root = createExercisesRoot();
    writeAsset(root, ASSET);
    const { manifestFile, attributionFile } = writeManifests(root);
    const registry = readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile);

    fs.rmSync(path.join(root, ...ASSET.split('/')));

    expect(registry.findForExercise('ex-100', root)).toEqual([]);
  });

  it('returns nothing when the binary exceeds the mobile transfer budget', () => {
    const root = createExercisesRoot();
    writeAsset(root, ASSET, 600 * 1024 + 1);
    const { manifestFile, attributionFile } = writeManifests(root);

    expect(
      readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile).findForExercise(
        'ex-100',
        root,
      ),
    ).toEqual([]);
  });

  it('returns an empty registry when the manifests are missing', () => {
    const root = createExercisesRoot();
    expect(
      readAdoptedUpstreamMediaRegistry(
        path.join(root, 'no-manifest.json'),
        path.join(root, 'no-attribution.json'),
      ).size,
    ).toBe(0);
  });
});

describe('adopted upstream media resolution order', () => {
  it("never displaces a record's own upstream media", () => {
    const root = createExercisesRoot();
    writeAsset(root, ASSET);
    writeAsset(root, `${OTHER_UUID}/own.webp`);
    const { manifestFile, attributionFile } = writeManifests(root);

    const output = applyCuratedMediaToExercise(
      exercise({
        wgerUuid: OTHER_UUID,
        media: [{ kind: 'image', url: `/uploads/exercises/${OTHER_UUID}/own.webp` }],
      }),
      emptyCuratedRegistry(root),
      {
        exercisesRoot: root,
        adoptedUpstream: readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile),
      },
    );

    expect(output.media).toEqual([
      { kind: 'image', url: `/uploads/exercises/${OTHER_UUID}/own.webp` },
    ]);
  });

  it('fills the gap for a record with no upstream media of its own', () => {
    const root = createExercisesRoot();
    writeAsset(root, ASSET);
    const { manifestFile, attributionFile } = writeManifests(root);

    const output = applyCuratedMediaToExercise(exercise(), emptyCuratedRegistry(root), {
      exercisesRoot: root,
      adoptedUpstream: readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile),
    });

    expect(output.media).toHaveLength(1);
    expect(output.media[0]?.url).toBe(`/uploads/exercises/${ASSET}`);
    expect(output.wgerUuid).toBeUndefined();
  });

  it('falls back to category artwork when the adopted binary is unusable', () => {
    const root = createExercisesRoot();
    const { manifestFile, attributionFile } = writeManifests(root);
    writeAsset(root, 'fallbacks/core.webp');

    const output = applyCuratedMediaToExercise(exercise(), emptyCuratedRegistry(root), {
      exercisesRoot: root,
      adoptedUpstream: readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile),
      categoryFallbacks: {
        core: [{ kind: 'image', url: '/uploads/exercises/fallbacks/core.webp' }],
      },
    });

    expect(output.media[0]?.url).toBe('/uploads/exercises/fallbacks/core.webp');
  });

  it('is idempotent', () => {
    const root = createExercisesRoot();
    writeAsset(root, ASSET);
    const { manifestFile, attributionFile } = writeManifests(root);
    const options = {
      exercisesRoot: root,
      adoptedUpstream: readAdoptedUpstreamMediaRegistry(manifestFile, attributionFile),
    };
    const registry = emptyCuratedRegistry(root);

    const first = applyCuratedMediaToExercise(exercise(), registry, options);
    const second = applyCuratedMediaToExercise(first, registry, options);

    expect(second).toEqual(first);
  });
});

describe('shipped adopted-upstream manifest', () => {
  const adopted = exercisesSeed.filter((item) =>
    item.media.some((media) => media.url.startsWith('/uploads/exercises/')) &&
    !item.media.some((media) => media.url.startsWith('/uploads/exercises/fallbacks/')),
  );

  it('gives real demonstration media to seed exercises', () => {
    expect(adopted.length).toBeGreaterThanOrEqual(14);
  });

  it('carries per-record attribution on every adopted image and never sets wgerUuid', () => {
    for (const item of adopted) {
      expect(item.wgerUuid).toBeUndefined();
      for (const media of item.media) {
        expect(media.source).toBe('wger');
        expect(media.licence).toMatch(/^CC-BY/);
        expect(media.licenceAuthor).toBeTruthy();
        expect(media.attributionText).toBeTruthy();
      }
    }
  });

  it('discloses AI-generated demonstrations at the record level', () => {
    for (const item of adopted) {
      const ai = item.media.some((media) => media.isAiGenerated);
      expect(item.isAiGeneratedMedia ?? false).toBe(ai);
    }
  });
});
