/**
 * Unknown URLs must not answer 200 with the home page. Sitemap URLs are
 * slashless and must answer themselves, not a redirect onto a trailing slash.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker from './index.ts';
import { API_ORIGIN, samePathSlashRedirect } from './proxy.ts';
import { isAppRoute } from './routes.ts';

function env(fetchImpl: (request: Request) => Promise<Response> | Response) {
  return { API_ORIGIN, ASSETS: { fetch: fetchImpl } } as never;
}

test('known app routes and unknown paths', () => {
  assert.equal(isAppRoute('/features'), true);
  assert.equal(isAppRoute('/features/'), true);
  assert.equal(isAppRoute('/coach'), true);
  assert.equal(isAppRoute('/nutrition/analysis/job-1'), true);
  assert.equal(isAppRoute('/workouts/session-1'), true);
  assert.equal(isAppRoute('/recipes/recipe-1'), true);
  assert.equal(isAppRoute('/not-a-page'), false);
  assert.equal(isAppRoute('/workouts/session-1/extra'), false);
});

test('a slash-only redirect is the same page', () => {
  assert.equal(
    samePathSlashRedirect('https://aquazerofit.com/features', 307, '/features/'),
    'https://aquazerofit.com/features/',
  );
  assert.equal(
    samePathSlashRedirect('https://aquazerofit.com/features', 307, 'https://evil.example/features/'),
    null,
  );
  assert.equal(
    samePathSlashRedirect('https://aquazerofit.com/features', 302, '/other'),
    null,
  );
});

test('an unknown URL is a 404 page, not the home page', async () => {
  let called = false;
  const response = await worker.fetch(
    new Request('https://aquazerofit.com/not-a-page'),
    env(async () => {
      called = true;
      return new Response('<div id="root">home</div>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }),
  );
  assert.equal(called, false);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  const body = await response.text();
  assert.match(body, /Page not found/);
  assert.doesNotMatch(body, /id="root"/);
});

test('a sitemap URL that the asset host would redirect is returned as 200', async () => {
  const seen: string[] = [];
  const response = await worker.fetch(
    new Request('https://aquazerofit.com/features'),
    env(async (request) => {
      const path = new URL(request.url).pathname;
      seen.push(path);
      if (path === '/features') {
        return new Response(null, { status: 307, headers: { Location: '/features/' } });
      }
      return new Response('<h1>Features</h1>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.match(await response.text(), /Features/);
  assert.deepEqual(seen, ['/features', '/features/']);
});

test('a trailing slash on a sitemap URL redirects to the slashless canonical', async () => {
  const response = await worker.fetch(
    new Request('https://aquazerofit.com/features/'),
    env(async () => new Response('should not be fetched', { status: 500 })),
  );
  assert.equal(response.status, 301);
  assert.equal(new URL(response.headers.get('location') ?? '').pathname, '/features');
});

test('a client route with no file is the app shell, not a 404', async () => {
  const response = await worker.fetch(
    new Request('https://aquazerofit.com/coach'),
    env(async (request) => {
      const path = new URL(request.url).pathname;
      if (path === '/index.html') {
        return new Response('<div id="root"></div>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });
    }),
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="root"/);
});

test('asset config serves sitemap URLs without a trailing slash and 404s the rest', () => {
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(config, /"html_handling": "drop-trailing-slash"/);
  assert.match(config, /"not_found_handling": "404-page"/);
  assert.doesNotMatch(config, /single-page-application/);
});
