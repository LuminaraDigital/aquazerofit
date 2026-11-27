/// <reference path="../worker-configuration.d.ts" />
import { canonicalRedirect, isProxiedPath, samePathSlashRedirect, upstreamRequest } from './proxy.ts';
import { hasFileExtension, isAppRoute, barePath } from './routes.ts';
import { secureSpaResponse } from './securityHeaders.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const redirectTo = canonicalRedirect(url);
    if (redirectTo) return Response.redirect(redirectTo, 301);
    if (isProxiedPath(url.pathname)) {
      const upstream = upstreamRequest(request, env.API_ORIGIN, env.ORIGIN_SHARED_SECRET);
      return fetch(upstream.url, upstream.init);
    }
    return secureSpaResponse(await serveAsset(request, env));
  },
};

/**
 * /llms.txt is a real text asset. Wrangler labels .txt as text/plain, and
 * this pins the charset on that response. An HTML body is the SPA fallback
 * for a missing file, and that response is left alone so a gap stays visible.
 * robots.txt and sitemap.xml keep the content type the asset host sent.
 */
export function llmsTxtResponse(request: Request, response: Response): Response {
  if (new URL(request.url).pathname !== '/llms.txt') return response;
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  if (type.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | AquaZeroFit</title>
<meta name="robots" content="noindex">
</head>
<body>
<main>
<h1>Page not found</h1>
<p>That address is not a page on AquaZeroFit.</p>
<p><a href="/">Back to the home page</a></p>
</main>
</body>
</html>
`;

function notFoundPage(): Response {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * Static files pass through. Known pages are served at the slashless URL the
 * sitemap publishes: a trailing-slash redirect from the asset host is followed
 * here, so the client is not sent away from that URL. A trailing slash on a
 * known page redirects to the slashless form. Client routes with no file get
 * the app shell. Anything else is a 404, not the home page.
 */
async function serveAsset(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);
  const url = new URL(request.url);
  const path = url.pathname;
  if (hasFileExtension(path)) {
    return llmsTxtResponse(request, await env.ASSETS.fetch(request));
  }
  if (!isAppRoute(path)) return notFoundPage();
  if (path.length > 1 && path.endsWith('/')) {
    const target = new URL(barePath(path) + url.search, url.origin);
    return Response.redirect(target.href, 301);
  }
  let asset = await env.ASSETS.fetch(request);
  const next = samePathSlashRedirect(request.url, asset.status, asset.headers.get('Location'));
  if (next) asset = await env.ASSETS.fetch(new Request(next, request));
  if (asset.status === 404) {
    const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), request));
    if (shell.ok) return shell;
  }
  return llmsTxtResponse(request, asset);
}
