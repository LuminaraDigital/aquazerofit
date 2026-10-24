/** Live Cloud Run API. Public, not a secret. */
export const API_ORIGIN =
  'https://aquazerofit-api-592686987043.australia-southeast1.run.app';

export const APEX_HOST = 'aquazerofit.com';
export const WWW_HOST = 'www.aquazerofit.com';

/**
 * Paths the browser and native clients call on the public host that must
 * reach Cloud Run. Static files, including /.well-known, stay on the asset
 * binding. /uploads is exercise media the SPA requests by path.
 */
export function isProxiedPath(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/uploads' ||
    pathname.startsWith('/uploads/') ||
    pathname === '/health' ||
    pathname === '/ready'
  );
}

/**
 * Legal pages published without a trailing slash. Cloudflare's default HTML
 * handling answers `/terms` (a folder with index.html) with 307 to `/terms/`.
 * Telegram's review of the terms, privacy and refund URLs treats that redirect
 * as the page not being there.
 */
export const LEGAL_PAGE_PATHS = ['/terms', '/privacy', '/refund'] as const;

/** Slashless form of a legal path, or null when this path is not one of them. */
export function canonicalLegalPath(pathname: string): string | null {
  const bare = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (LEGAL_PAGE_PATHS as readonly string[]).includes(bare) ? bare : null;
}

/**
 * Where to fetch the legal page directly, when the asset host answered with a
 * trailing-slash redirect. One hop, same origin, same page. Anything else
 * (another path, another host, a redirect that goes nowhere new) is left for
 * the client.
 */
export function legalRedirectTarget(
  requestUrl: string,
  status: number,
  location: string | null,
): string | null {
  if ((status !== 307 && status !== 308) || !location) return null;
  let request: URL;
  let target: URL;
  try {
    request = new URL(requestUrl);
    target = new URL(location, request);
  } catch {
    return null;
  }
  if (target.origin !== request.origin) return null;
  const requested = canonicalLegalPath(request.pathname);
  const landed = canonicalLegalPath(target.pathname);
  if (!requested || requested !== landed) return null;
  if (target.pathname === request.pathname && target.search === request.search) return null;
  return target.href;
}

/** www is a second custom domain. Sessions and canonical links live on the apex. */
export function canonicalRedirect(url: URL): string | null {
  if (url.hostname !== WWW_HOST) return null;
  const target = new URL(url.href);
  target.hostname = APEX_HOST;
  return target.href;
}

const STRIP_HEADERS = [
  'host',
  'cf-connecting-ip',
  'cf-ray',
  'cf-visitor',
  'cf-ipcountry',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
];

/**
 * Build the Cloud Run request. Host is left unset so fetch uses the run.app
 * hostname. A client-supplied X-Forwarded-For is dropped. When Cloudflare
 * provides CF-Connecting-IP, that single value is the forwarded client.
 */
export function upstreamRequest(
  request: Request,
  apiOrigin: string,
): { url: string; init: RequestInit } {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, apiOrigin);
  const headers = new Headers(request.headers);
  for (const name of STRIP_HEADERS) headers.delete(name);
  const client = request.headers.get('cf-connecting-ip');
  if (client) headers.set('x-forwarded-for', client);
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }
  return { url: target.href, init };
}
