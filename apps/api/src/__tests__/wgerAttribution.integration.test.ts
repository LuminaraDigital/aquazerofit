import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Exercise } from '@aquazerofit/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-wger-attribution-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { createWgerImageMedia } = await import('../data/wger/importer');
const app = createApp();

afterAll(async () => {
  await getStore().flush();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('wger image attribution contract', () => {
  it('propagates importer image provenance through the exercise detail API', async () => {
    const media = createWgerImageMedia(
      {
        id: 42,
        uuid: '5e18ba7d-3e5d-4e06-8b83-c6e9e88168c8',
        image: 'https://wger.de/media/exercise-images/example.png',
        is_main: true,
        style: '1',
        license: 2,
        license_author: 'Original image artist',
        is_ai_generated: true,
      },
      {
        shortName: 'CC BY-SA 4.0',
        fullName: 'Creative Commons Attribution-ShareAlike 4.0',
        url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
      '/uploads/exercises/00fcf603-b0d0-48d2-9b5e-c7f0d510d46c/example.png',
    );
    const exercise: Exercise = {
      id: 'ex-wger-attribution-contract',
      type: 'exercise',
      name: 'Attribution contract exercise',
      description: 'Fixture',
      category: 'strength',
      primaryMuscles: ['chest'],
      secondaryMuscles: [],
      equipment: ['none'],
      difficulty: 'beginner',
      media: [media],
      licence: 'CC BY-SA 3.0',
      licenceAuthor: 'Exercise text author',
      sourceId: 'wger-attribution-contract',
      wgerUuid: '00fcf603-b0d0-48d2-9b5e-c7f0d510d46c',
    };
    getStore().upsert('content', exercise);

    const registration = await request(app).post('/api/v1/auth/register').send({
      email: 'wger-attribution@example.com',
      password: 'CorrectHorse9Battery',
      displayName: 'Attribution reviewer',
    });
    expect(registration.status).toBe(201);

    const detail = await request(app)
      .get(`/api/v1/exercises/${exercise.id}`)
      .set('Authorization', `Bearer ${registration.body.accessToken}`);

    expect(detail.status).toBe(200);
    expect(detail.body.exercise.media).toEqual([
      {
        kind: 'image',
        url: media.url,
        source: 'wger',
        licence: 'CC BY-SA 4.0',
        licenceAuthor: 'Original image artist',
        licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        attributionText: '© Original image artist',
        isAiGenerated: true,
      },
    ]);
  });
});
