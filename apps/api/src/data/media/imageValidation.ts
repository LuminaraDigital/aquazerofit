import fs from 'node:fs';
import path from 'node:path';

export const MAX_UPSTREAM_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_UPSTREAM_IMAGE_DIMENSION = 8_192;
export const MAX_UPSTREAM_IMAGE_PIXELS = 20_000_000;

export type SupportedImageMime =
  | 'image/gif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

export interface ValidatedImage {
  mime: SupportedImageMime;
  width: number;
  height: number;
}

function jpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1]!;
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

export function inspectImageBytes(buffer: Buffer): ValidatedImage | null {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    buffer.toString('ascii', 12, 16) === 'IHDR'
  ) {
    return {
      mime: 'image/png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  if (
    buffer.length >= 10 &&
    (buffer.toString('ascii', 0, 6) === 'GIF87a' ||
      buffer.toString('ascii', 0, 6) === 'GIF89a')
  ) {
    return {
      mime: 'image/gif',
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }
  if (
    buffer.length >= 30 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const variant = buffer.toString('ascii', 12, 16);
    if (variant === 'VP8X') {
      return {
        mime: 'image/webp',
        width: buffer.readUIntLE(24, 3) + 1,
        height: buffer.readUIntLE(27, 3) + 1,
      };
    }
    if (
      variant === 'VP8 ' &&
      buffer[23] === 0x9d &&
      buffer[24] === 0x01 &&
      buffer[25] === 0x2a
    ) {
      return {
        mime: 'image/webp',
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (variant === 'VP8L' && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return {
        mime: 'image/webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
  }
  const jpeg = jpegDimensions(buffer);
  return jpeg ? { mime: 'image/jpeg', ...jpeg } : null;
}

export function validateUpstreamImageBytes(
  buffer: Buffer,
  declaredMime?: string,
): ValidatedImage {
  if (buffer.length === 0 || buffer.length > MAX_UPSTREAM_IMAGE_BYTES) {
    throw new Error(`image must be between 1 and ${MAX_UPSTREAM_IMAGE_BYTES} bytes`);
  }
  const inspected = inspectImageBytes(buffer);
  if (!inspected) throw new Error('image content does not match a supported format');
  const normalizedMime = declaredMime?.split(';', 1)[0]?.trim().toLowerCase();
  if (normalizedMime && normalizedMime !== inspected.mime) {
    throw new Error(`image content type ${normalizedMime} does not match ${inspected.mime}`);
  }
  const { width, height } = inspected;
  if (
    width <= 0 ||
    height <= 0 ||
    width > MAX_UPSTREAM_IMAGE_DIMENSION ||
    height > MAX_UPSTREAM_IMAGE_DIMENSION ||
    width * height > MAX_UPSTREAM_IMAGE_PIXELS
  ) {
    throw new Error(`image dimensions ${width}x${height} exceed the safety ceiling`);
  }
  return inspected;
}

export function isSafeStoredUpstreamImage(file: string): boolean {
  try {
    const stat = fs.lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size <= 0 ||
      stat.size > MAX_UPSTREAM_IMAGE_BYTES
    ) {
      return false;
    }
    const inspected = validateUpstreamImageBytes(fs.readFileSync(file));
    const extension = path.extname(file).toLowerCase();
    return (
      (inspected.mime === 'image/jpeg' && (extension === '.jpg' || extension === '.jpeg')) ||
      (inspected.mime === 'image/png' && extension === '.png') ||
      (inspected.mime === 'image/gif' && extension === '.gif') ||
      (inspected.mime === 'image/webp' && extension === '.webp')
    );
  } catch {
    return false;
  }
}
