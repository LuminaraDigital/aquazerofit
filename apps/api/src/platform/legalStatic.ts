/**
 * Serve the prerendered legal pages at the URL people actually request.
 *
 * The SEO build writes these as `terms/index.html` (and the same for privacy
 * and refund). A static host that sees a directory answers `/terms` with a
 * redirect onto `/terms/`. Telegram's review of the terms, privacy and refund
 * URLs follows that redirect and treats the page as missing. This handler
 * returns the file itself, with no Location header, for both the slashless
 * path and the trailing-slash form.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';

const LEGAL_PAGES = new Set(['terms', 'privacy', 'refund']);

/** Absolute path of the prerendered HTML, or null when this request is not one of those pages. */
export function prerenderedLegalFile(spaDir: string, pathname: string): string | null {
  const bare = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (!bare.startsWith('/')) return null;
  const name = bare.slice(1);
  if (!LEGAL_PAGES.has(name)) return null;
  const file = path.join(spaDir, name, 'index.html');
  return fs.existsSync(file) ? file : null;
}

export function servePrerenderedLegalPages(spaDir: string): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const file = prerenderedLegalFile(spaDir, req.path);
    if (!file) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(file);
  };
}
