/**
 * httpOnly refresh-token cookie helpers (FE-01).
 *
 * The refresh token rides an httpOnly cookie so XSS-readable storage no
 * longer holds the long-lived credential. The token also remains in the
 * JSON body for back-compat (Telegram WebApp clients), but the web client
 * relies on the cookie alone.
 *
 * Cookie scope: path=/api/v1/auth limits it to the auth endpoints; Secure
 * is set only when not dev/test/loopback so local http dev still works.
 * Split-origin hosting (web and API on different hostnames) would need
 * SameSite=None;Secure : SameSite=Lax is correct for the same-origin and
 * Vite-proxy deployments this build targets. See VITE_API_BASE_URL.
 */
import type { Request, Response } from 'express';
import { config } from '../../platform/config';

export const REFRESH_COOKIE = 'azf_rt';
/** Cookie path scope: only /api/v1/auth routes receive it. */
const COOKIE_PATH = '/api/v1/auth';

/** True when the request is served over http to a loopback/dev host. */
function isLoopback(req: Request): boolean {
  const host = (req.headers.host ?? '').split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function shouldSecure(req: Request): boolean {
  if (!config.isProduction) return false;
  return !isLoopback(req);
}

/** Max-Age in seconds, matching the refresh-token TTL. */
function refreshMaxAgeSeconds(): number {
  return config.refreshTtlDays * 24 * 3600;
}

/**
 * Parse the Cookie header without a dependency. Splitting on ';' and
 * '=' and decodeURIComponent covers legal name/value pairs; malformed
 * segments are skipped rather than throwing.
 */
export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== REFRESH_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Body token wins (back-compat); cookie is the fallback. */
export function resolveRefreshToken(req: Request, bodyToken?: string): string | undefined {
  return bodyToken ?? readRefreshCookie(req);
}

export function setRefreshCookie(req: Request, res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: shouldSecure(req),
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: refreshMaxAgeSeconds() * 1000,
  });
}

export function clearRefreshCookie(req: Request, res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: shouldSecure(req),
    sameSite: 'lax',
    path: COOKIE_PATH,
  });
}
