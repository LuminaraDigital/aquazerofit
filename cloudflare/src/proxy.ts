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

/** www is a second custom domain. Sessions and canonical links live on the apex. */
export function canonicalRedirect(url: URL): string | null {
  if (url.hostname !== WWW_HOST) return null;
  const target = new URL(url.href);
  target.hostname = APEX_HOST;
  return target.href;
}

/** Header the API checks before trusting CF-Connecting-IP. Not a secret by itself. */
export const ORIGIN_SECRET_HEADER = 'x-origin-shared-secret';

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
  ORIGIN_SECRET_HEADER,
];

/**
 * Build the Cloud Run request. Host is left unset so fetch uses the run.app
 * hostname. Client-supplied forwarding headers are dropped, then replaced:
 * CF-Connecting-IP and X-Forwarded-For are the edge's view of the client,
 * and X-Origin-Shared-Secret is set only from the Worker secret. A caller
 * who hits Cloud Run directly cannot borrow that header from this proxy.
 */
export function upstreamRequest(
  request: Request,
  apiOrigin: string,
  originSharedSecret?: string,
): { url: string; init: RequestInit } {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, apiOrigin);
  const client = request.headers.get('cf-connecting-ip');
  const headers = new Headers(request.headers);
  for (const name of STRIP_HEADERS) headers.delete(name);
  if (client) {
    headers.set('cf-connecting-ip', client);
    headers.set('x-forwarded-for', client);
  }
  const secret = originSharedSecret?.trim();
  if (secret) headers.set(ORIGIN_SECRET_HEADER, secret);
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
