import { describe, expect, it } from 'vitest';
import type { Exercise } from '@aquazerofit/shared';
import {
  getExerciseImagePresentation,
  getExerciseMediaPresentation,
} from './WorkoutLibrary';

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-test',
    type: 'exercise',
    name: 'Test exercise',
    description: 'Test description',
    category: 'strength',
    primaryMuscles: ['quadriceps'],
    secondaryMuscles: [],
    equipment: ['none'],
    difficulty: 'beginner',
    media: [],
    licence: 'CC-BY-SA 3',
    licenceAuthor: 'wger contributor',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceId: 'wger-test',
    wgerUuid: '00fcf603-b0d0-48d2-9b5e-c7f0d510d46c',
    ...overrides,
  };
}

describe('WorkoutLibrary exercise media presentation', () => {
  it('shows the generated-image disclosure for the displayed AI media', () => {
    const presentation = getExerciseMediaPresentation(
      exercise({
        media: [
          {
            kind: 'image',
            url: '/uploads/exercises/fallbacks/strength.webp',
            source: 'aquazerofit',
            isAiGenerated: true,
          },
        ],
      }),
    );

    expect(presentation.isAiGenerated).toBe(true);
  });

  it('uses per-media attribution without losing the separate exercise-data attribution', () => {
    const detail = exercise({
      media: [
        {
          kind: 'image',
          url: '/uploads/exercises/curated/ex-test/start.webp',
          source: 'aquazerofit',
          attributionText: '© AquaZeroFit',
          licence: 'AquaZeroFit proprietary',
          licenceAuthor: 'AquaZeroFit',
          isAiGenerated: false,
        },
      ],
    });

    const presentation = getExerciseMediaPresentation(detail);

    expect(presentation.attributions).toEqual([
      expect.objectContaining({
        text: '© AquaZeroFit, AquaZeroFit proprietary',
        source: 'aquazerofit',
      }),
    ]);
    expect([detail.licenceAuthor, detail.licence]).toEqual([
      'wger contributor',
      'CC-BY-SA 3',
    ]);
  });

  it('marks category fallback artwork as decorative', () => {
    expect(
      getExerciseImagePresentation(
        '/uploads/exercises/fallbacks/mobility.webp',
        'Mobility demonstration',
        false,
      ),
    ).toEqual({
      shouldRenderImage: true,
      alt: '',
      ariaHidden: true,
    });
  });

  it('falls back safely after the primary image reports an error', () => {
    expect(
      getExerciseImagePresentation(
        '/uploads/exercises/curated/ex-test/start.webp',
        'Test exercise demonstration',
        true,
      ).shouldRenderImage,
    ).toBe(false);
  });
});
