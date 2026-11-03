/**
 * Client-side downscale of a meal photo before upload.
 *
 * A phone capture is 4000x3000 and several megabytes; the server keeps at most
 * 1600px on the long edge anyway (STORED_IMAGE_MAX_EDGE in the vision router),
 * so sending the full capture spends the user's mobile data and the 10 MB
 * limit on pixels that are thrown away on arrival. Re-encoding here also drops
 * EXIF before the bytes leave the device; the server strips it regardless.
 *
 * Every failure path returns the original file: compression is an
 * optimisation, and the server's own decode remains the real type check.
 */

/** Long-edge cap, matching what the server stores. */
export const MAX_LONG_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.8;

/** Browsers cannot decode HEIC, so it goes up untouched for the server to convert. */
function isHeic(file: File): boolean {
  return file.type === 'image/heic' || (!file.type && /\.heic$/i.test(file.name));
}

export async function compressPhoto(file: File): Promise<File> {
  if (isHeic(file) || typeof createImageBitmap === 'undefined') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_LONG_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  // Re-encoding an already-small JPEG can come out larger; keep whichever is smaller.
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
