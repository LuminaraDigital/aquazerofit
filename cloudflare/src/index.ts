/// <reference path="../worker-configuration.d.ts" />
import { canonicalRedirect, isProxiedPath, legalRedirectTarget, upstreamRequest } from './proxy.ts';
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

/**
 * Legal URLs are published without a trailing slash. The asset host 307s those
 * onto the slash form because the HTML lives at `terms/index.html`. Follow that
 * one hop here and return the page, so the client is not sent through the redirect.
 * Security headers are applied to the page that is actually returned.
 */
async function serveAsset(request: Request, env: Env): Promise<Response> {
  const first = await env.ASSETS.fetch(request);
  if (request.method !== 'GET' && request.method !== 'HEAD') return first;
  const next = legalRedirectTarget(request.url, first.status, first.headers.get('Location'));
  const asset = next ? await env.ASSETS.fetch(new Request(next, request)) : first;
  return llmsTxtResponse(request, asset);
}
