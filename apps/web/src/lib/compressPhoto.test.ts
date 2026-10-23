// @vitest-environment jsdom
/**
 * Client-side meal photo compression. jsdom has neither createImageBitmap nor
 * a canvas encoder, so both are stubbed: what is under test is the sizing
 * rule, the encode settings and every fall-back-to-the-original path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressPhoto, JPEG_QUALITY, MAX_LONG_EDGE_PX } from './compressPhoto';

let drawn: { width: number; height: number } | null;
let encoded: { type?: string; quality?: unknown } | null;
let encodedBytes: number;

function photo(name: string, type: string, bytes = 500_000): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function stubBitmap(width: number, height: number) {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close })));
  return close;
}

beforeEach(() => {
  drawn = null;
  encoded = null;
  encodedBytes = 100_000;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return {
      drawImage: () => {
        drawn = { width: this.width, height: this.height };
      },
    } as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type, quality) => {
    encoded = { type, quality };
    callback(new Blob([new Uint8Array(encodedBytes)], { type }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('compressPhoto', () => {
  it('scales a landscape capture to 1600px on the long edge as JPEG 0.8', async () => {
    const close = stubBitmap(4000, 3000);

    const out = await compressPhoto(photo('IMG_0001.png', 'image/png'));

    expect(drawn).toEqual({ width: MAX_LONG_EDGE_PX, height: 1200 });
    expect(encoded).toEqual({ type: 'image/jpeg', quality: JPEG_QUALITY });
    expect(JPEG_QUALITY).toBe(0.8);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.jpg');
    expect(out.size).toBe(100_000);
    expect(close).toHaveBeenCalled();
  });

  it('scales a portrait capture on its height', async () => {
    stubBitmap(3000, 4000);
    await compressPhoto(photo('meal.jpg', 'image/jpeg'));
    expect(drawn).toEqual({ width: 1200, height: MAX_LONG_EDGE_PX });
  });

  it('never upscales a photo already under the cap', async () => {
    stubBitmap(800, 600);
    await compressPhoto(photo('small.jpg', 'image/jpeg'));
    expect(drawn).toEqual({ width: 800, height: 600 });
  });

  it('keeps the original when the re-encode is not smaller', async () => {
    stubBitmap(800, 600);
    encodedBytes = 600_000;
    const original = photo('small.jpg', 'image/jpeg', 500_000);
    expect(await compressPhoto(original)).toBe(original);
  });

  it('passes HEIC through untouched, including an untyped .heic', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const heic = photo('IMG_0002.heic', 'image/heic');
    const untyped = photo('IMG_0003.HEIC', '');

    expect(await compressPhoto(heic)).toBe(heic);
    expect(await compressPhoto(untyped)).toBe(untyped);
    expect(decode).not.toHaveBeenCalled();
  });

  it('falls back to the original when the browser cannot decode or encode', async () => {
    const original = photo('meal.jpg', 'image/jpeg');

    // No createImageBitmap at all (jsdom's own state).
    expect(await compressPhoto(original)).toBe(original);

    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('corrupt'))));
    expect(await compressPhoto(original)).toBe(original);

    stubBitmap(4000, 3000);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null));
    expect(await compressPhoto(original)).toBe(original);
  });
});
