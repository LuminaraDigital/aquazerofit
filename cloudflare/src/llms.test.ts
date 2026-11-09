/**
 * /llms.txt is a static asset. The Worker must not proxy it, and must not
 * relabel the SPA shell if the file is missing. When the asset is the text
 * file, the content type is text/plain with a utf-8 charset.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './index.ts';
import { API_ORIGIN, isProxiedPath } from './proxy.ts';

function env(fetch: (request: Request) => Promise<Response> | Response) {
  return { API_ORIGIN, ASSETS: { fetch } } as never;
}

test('/llms.txt is not an API path', () => {
  assert.equal(isProxiedPath('/llms.txt'), false);
  assert.equal(isProxiedPath('/robots.txt'), false);
  assert.equal(isProxiedPath('/sitemap.xml'), false);
});

test('/llms.txt is served as text/plain with a utf-8 charset', async () => {
  const body = '# AquaZeroFit\n\n> summary\n';
  const response = await worker.fetch(
    new Request('https://aquazerofit.com/llms.txt'),
    env(async () => new Response(body, { headers: { 'content-type': 'text/plain' } })),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await response.text(), body);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('a HEAD request for /llms.txt keeps the text content type', async () => {
  const response = await worker.fetch(
    new Request('https://aquazerofit.com/llms.txt', { method: 'HEAD' }),
    env(async () => new Response(null, { headers: { 'content-type': 'text/plain; charset=utf-8' } })),
  );
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
});

test('an HTML fallback for a missing /llms.txt stays HTML', async () => {
  const response = await worker.fetch(
    new Request('https://aquazerofit.com/llms.txt'),
    env(async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } })),
  );
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await response.text(), /<html>/);
});

test('robots.txt and sitemap.xml content types are left as the asset sent them', async () => {
  const robots = await worker.fetch(
    new Request('https://aquazerofit.com/robots.txt'),
    env(async () => new Response('User-agent: *\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } })),
  );
  assert.equal(robots.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await robots.text(), 'User-agent: *\n');

  const sitemap = await worker.fetch(
    new Request('https://aquazerofit.com/sitemap.xml'),
    env(async () => new Response('<urlset></urlset>', { headers: { 'content-type': 'application/xml' } })),
  );
  assert.equal(sitemap.headers.get('content-type'), 'application/xml');
  assert.equal(await sitemap.text(), '<urlset></urlset>');
});
