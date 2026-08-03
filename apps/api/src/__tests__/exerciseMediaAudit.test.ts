import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Exercise } from '@aquazerofit/shared';
import {
  auditExerciseMedia,
  derivePriorityTiers,
  type ExerciseMediaAuditOptions,
} from '../../scripts/auditExerciseMedia';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function exercise(id: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    type: 'exercise',
    name: id,
    description: 'Fixture exercise',
    category: 'strength',
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    equipment: ['none'],
    difficulty: 'beginner',
    media: [],
    licence: 'CC-BY-SA 4.0',
    licenceAuthor: 'Fixture author',
    sourceId: `source-${id}`,
    ...overrides,
  };
}

function assetsFixture(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aqf-media-audit-'));
  temporaryDirectories.push(directory);
  fs.mkdirSync(path.join(directory, 'exercises', 'wger-uuid'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'exercises', 'curated', 'ex-curated'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(directory, 'exercises', 'wger-uuid', 'image.webp'),
    'same-binary',
  );
  fs.writeFileSync(
    path.join(directory, 'exercises', 'curated', 'ex-curated', 'image.webp'),
    'same-binary',
  );
  fs.writeFileSync(path.join(directory, 'exercise-placeholder.svg'), '<svg />');
  return directory;
}

describe('auditExerciseMedia', () => {
  it('classifies valid wger, curated, placeholder, missing, and missing-file media', () => {
    const options: ExerciseMediaAuditOptions = {
      assetsRoot: assetsFixture(),
      tier0ExerciseIds: new Set(['ex-wger']),
      tier1ExerciseIds: new Set(['ex-curated']),
    };
    const exercises = [
      exercise('ex-wger', {
        wgerUuid: 'wger-uuid',
        media: [{ kind: 'image', url: '/uploads/exercises/wger-uuid/image.webp' }],
      }),
      exercise('ex-curated', {
        media: [
          {
            kind: 'image',
            url: '/uploads/exercises/curated/ex-curated/image.webp',
          },
        ],
      }),
      exercise('ex-placeholder', {
        media: [{ kind: 'image', url: '/uploads/exercise-placeholder.svg' }],
      }),
      exercise('ex-empty'),
      exercise('ex-broken', {
        media: [{ kind: 'image', url: '/uploads/exercises/missing/image.webp' }],
      }),
    ];

    const report = auditExerciseMedia(exercises, options);

    expect(report.totalExercises).toBe(5);
    expect(report.countsByMediaStatus).toEqual({
      validWger: 1,
      adoptedUpstream: 0,
      curated: 1,
      categoryFallback: 0,
      legacyPlaceholder: 1,
      missing: 1,
      missingFile: 1,
      external: 0,
    });
    expect(report.countsByCategory).toEqual({ strength: 5 });
    expect(report.countsByPriorityTier).toEqual({ tier0: 1, tier1: 1, tier2: 3 });
    expect(report.missingLocalFiles).toEqual([
      {
        exerciseId: 'ex-broken',
        url: '/uploads/exercises/missing/image.webp',
        expectedPath: path.join(options.assetsRoot, 'exercises', 'missing', 'image.webp'),
      },
    ]);
  });

  it('reports duplicate references and byte-identical local assets without writing files', () => {
    const assetsRoot = assetsFixture();
    const before = fs
      .readdirSync(assetsRoot, { recursive: true })
      .map(String)
      .sort();
    const report = auditExerciseMedia(
      [
        exercise('ex-a', {
          wgerUuid: 'wger-uuid',
          media: [{ kind: 'image', url: '/uploads/exercises/wger-uuid/image.webp' }],
        }),
        exercise('ex-b', {
          media: [{ kind: 'image', url: '/uploads/exercises/wger-uuid/image.webp' }],
        }),
        exercise('ex-c', {
          media: [
            {
              kind: 'image',
              url: '/uploads/exercises/curated/ex-curated/image.webp',
            },
          ],
        }),
      ],
      { assetsRoot },
    );
    const after = fs
      .readdirSync(assetsRoot, { recursive: true })
      .map(String)
      .sort();

    expect(report.duplicateAssetReferences).toEqual([
      {
        url: '/uploads/exercises/wger-uuid/image.webp',
        exerciseIds: ['ex-a', 'ex-b'],
      },
    ]);
    expect(report.duplicateAssetContent).toHaveLength(1);
    expect(report.duplicateAssetContent[0]?.urls).toEqual([
      '/uploads/exercises/curated/ex-curated/image.webp',
      '/uploads/exercises/wger-uuid/image.webp',
    ]);
    expect(after).toEqual(before);
  });

  it('rejects encoded local paths before any filesystem access', () => {
    const assetsRoot = assetsFixture();
    const report = auditExerciseMedia(
      [
        exercise('ex-traversal', {
          media: [{ kind: 'image', url: '/uploads/exercises/%2e%2e/secret.txt' }],
        }),
      ],
      { assetsRoot },
    );

    expect(report.countsByMediaStatus.missingFile).toBe(1);
    expect(report.invalidLocalReferences).toEqual([
      {
        exerciseId: 'ex-traversal',
        url: '/uploads/exercises/%2e%2e/secret.txt',
        reason: 'percent-encoded local asset paths are not accepted',
      },
    ]);
  });
});

describe('derivePriorityTiers', () => {
  it('keeps current-plan exercises in Tier 0 and beginner focus-slot coverage in Tier 1', () => {
    const exercises = [
      exercise('ex-current', { primaryMuscles: ['chest'] }),
      exercise('ex-back', { primaryMuscles: ['back'] }),
      exercise('ex-advanced', {
        primaryMuscles: ['quadriceps'],
        difficulty: 'advanced',
      }),
      exercise('ex-mobility', {
        category: 'mobility',
        primaryMuscles: ['hips'],
      }),
    ];

    const tiers = derivePriorityTiers(exercises, new Set(['ex-current']));

    expect(tiers.tier0ExerciseIds).toEqual(new Set(['ex-current']));
    expect(tiers.tier1ExerciseIds).toEqual(new Set(['ex-back']));
  });
});
