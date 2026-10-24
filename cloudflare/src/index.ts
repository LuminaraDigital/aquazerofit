/// <reference path="../worker-configuration.d.ts" />
import { canonicalRedirect, isProxiedPath, legalRedirectTarget, upstreamRequest } from './proxy';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const redirectTo = canonicalRedirect(url);
    if (redirectTo) return Response.redirect(redirectTo, 301);
    if (isProxiedPath(url.pathname)) {
      const upstream = upstreamRequest(request, env.API_ORIGIN);
      return fetch(upstream.url, upstream.init);
    }
    return serveAsset(request, env);
  },
};

/**
 * Legal URLs are published without a trailing slash. The asset host 307s those
 * onto the slash form because the HTML lives at `terms/index.html`. Follow that
 * one hop here and return the page, so the client is not sent through the redirect.
 */
async function serveAsset(request: Request, env: Env): Promise<Response> {
  const first = await env.ASSETS.fetch(request);
  if (request.method !== 'GET' && request.method !== 'HEAD') return first;
  const next = legalRedirectTarget(request.url, first.status, first.headers.get('Location'));
  if (!next) return first;
  return env.ASSETS.fetch(new Request(next, request));
}
