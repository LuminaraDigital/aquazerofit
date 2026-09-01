/**
 * Client locale, read off the standard Accept-Language header.
 *
 * The /api/v1 contract is frozen, so this deliberately adds no header of its
 * own: browsers send Accept-Language without being asked and the Android
 * client sets it from the device locale, which makes it the one carrier both
 * halves of the product already agree on.
 *
 * The value is passed through raw — every consumer goes via
 * `regionFromLocale` in the shared package, which tolerates whole header
 * strings, q-values, script subtags and POSIX underscores. Nothing here
 * validates it, because an unparseable locale is not an error: it simply falls
 * back to the product's home region.
 */
import type { Request } from 'express';

export function localeOf(req: Request): string {
  return req.get('accept-language')?.trim() ?? '';
}
