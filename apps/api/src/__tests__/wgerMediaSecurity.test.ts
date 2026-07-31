import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Exercise } from '@aquazerofit/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWithRetry,
  finalizeImportedExerciseMedia,
  readValidatedWgerImage,
  validateWgerRemoteUrl,
} from '../data/wger/importer';
import {
  validateCuratedMediaManifest,
} from '../data/media/curatedMedia';

function pngHeader(width: number, height: number): Buffer {
  const image = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.writeUInt32BE(13, 8);
  image.write('IHDR', 12, 'ascii');
  image.writeUInt32BE(width, 16);
  image.writeUInt32BE(height, 20);
  return image;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wger remote URL boundary', () => {
  it.each([
    'http://wger.de/media/exercise.png',
    'https://evil.example/exercise.png',
    'https://wger.de.evil.example/exercise.png',
    'not a url',
  ])('rejects non-allowlisted image URL %s', (url) => {
    expect(() => validateWgerRemoteUrl(url)).toThrow(/wger URL/i);
  });

  it('accepts only exact HTTPS wger.de URLs', () => {
    expect(
      validateWgerRemoteUrl('https://wger.de/media/exercise-images/example.png').toString(),
    ).toBe('https://wger.de/media/exercise-images/example.png');
  });

  it('disables redirect following at the fetch boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/payload.png' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithRetry('https://wger.de/media/exercise.png', 0),
    ).rejects.toThrow(/redirect/i);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://wger.de/media/exercise.png',
      expect.objectContaining({ redirect: 'error' }),
    );
  });
});

describe('wger image response validation', () => {
  it('rejects a declared image whose magic bytes do not match', async () => {
    const response = new Response(Buffer.from('<html>not an image</html>'), {
      headers: { 'content-type': 'image/png' },
    });

    await expect(readValidatedWgerImage(response)).rejects.toThrow(/content|format/i);
  });

  it('stops reading when the streamed byte cap is exceeded', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10));
        controller.enqueue(new Uint8Array(10));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(body, {
      headers: { 'content-type': 'image/png' },
    });

    await expect(
      readValidatedWgerImage(response, { maxBytes: 16 }),
    ).rejects.toThrow(/large|bytes/i);
    expect(cancelled).toBe(true);
  });

  it('rejects an image with unsafe decoded dimensions', async () => {
    const response = new Response(pngHeader(5_000, 5_000), {
      headers: { 'content-type': 'image/png' },
    });

    await expect(readValidatedWgerImage(response)).rejects.toThrow(/dimensions/i);
  });

  it('accepts a bounded image when content type, magic, and dimensions agree', async () => {
    const image = pngHeader(1_600, 900);
    const response = new Response(image, {
      headers: {
        'content-type': 'image/png; charset=binary',
        'content-length': String(image.length),
      },
    });

    await expect(readValidatedWgerImage(response)).resolves.toEqual(image);
  });
});

describe('stored wger media validation', () => {
  it('does not retain an upstream file with unsafe dimensions', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqf-wger-media-'));
    const wgerUuid = '00fcf603-b0d0-48d2-9b5e-c7f0d510d46c';
    const imageDir = path.join(root, wgerUuid);
    fs.mkdirSync(imageDir, { recursive: true });
    fs.writeFileSync(path.join(imageDir, 'unsafe.png'), pngHeader(5_000, 5_000));
    const fallbackDir = path.join(root, 'fallbacks');
    fs.mkdirSync(fallbackDir, { recursive: true });
    fs.writeFileSync(path.join(fallbackDir, 'strength.png'), pngHeader(1_600, 900));
    const registry = validateCuratedMediaManifest(
      { schemaVersion: 1, entries: [] },
      { curatedRoot: root },
    );
    const exercise: Exercise = {
      id: 'ex-wger-test',
      type: 'exercise',
      name: 'Test exercise',
      description: 'Test',
      category: 'strength',
      primaryMuscles: ['full body'],
      secondaryMuscles: [],
      equipment: ['none'],
      difficulty: 'beginner',
      media: [{ kind: 'image', url: `/uploads/exercises/${wgerUuid}/unsafe.png` }],
      licence: 'CC BY-SA 3.0',
      licenceAuthor: 'wger contributor',
      sourceId: `wger-${wgerUuid}`,
      wgerUuid,
    };

    const result = finalizeImportedExerciseMedia(exercise, registry, {
      exercisesRoot: root,
      categoryFallbacks: {
        strength: [{ kind: 'image', url: '/uploads/exercises/fallbacks/strength.png' }],
      },
    });

    expect(result.media).toEqual([
      { kind: 'image', url: '/uploads/exercises/fallbacks/strength.png' },
    ]);
  });
});
