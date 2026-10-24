/// <reference path="../worker-configuration.d.ts" />
import { canonicalRedirect, isProxiedPath, upstreamRequest } from './proxy.ts';
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
    return secureSpaResponse(await env.ASSETS.fetch(request));
  },
};
