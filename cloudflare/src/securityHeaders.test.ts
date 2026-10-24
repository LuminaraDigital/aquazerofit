import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ORIGIN } from './proxy.ts';
import {
  CONNECT_SRC,
  FRAME_ANCESTORS,
  SCRIPT_SRC,
  SECURITY_HEADERS,
  contentSecurityPolicy,
  withSecurityHeaders,
} from './securityHeaders.ts';
import worker from './index.ts';

function sources(policy: string, name: string): string[] {
  const part = policy.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name} `));
  assert.ok(part, `missing ${name}`);
  return part.slice(name.length).trim().split(/\s+/);
}

test('CSP frame-ancestors allow the Telegram Mini App iframe', () => {
  assert.deepEqual(sources(contentSecurityPolicy(), 'frame-ancestors'), [...FRAME_ANCESTORS]);
  assert.deepEqual(FRAME_ANCESTORS, ["'self'", 'https://web.telegram.org', 'https://*.telegram.org']);
});

test('script-src and connect-src match Telegram, Turnstile, Firebase, and the API', () => {
  const policy = contentSecurityPolicy();
  const scripts = sources(policy, 'script-src');
  const connect = sources(policy, 'connect-src');
  for (const source of [
    "'self'",
    'https://telegram.org',
    'https://*.telegram.org',
    'https://challenges.cloudflare.com',
    'https://www.googletagmanager.com',
    'https://www.gstatic.com',
    'https://www.google.com',
  ]) {
    assert.ok(scripts.includes(source), `script-src missing ${source}`);
  }
  for (const source of [
    "'self'",
    API_ORIGIN,
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firebaseinstallations.googleapis.com',
    'https://www.googleapis.com',
    'https://www.google-analytics.com',
  ]) {
    assert.ok(connect.includes(source), `connect-src missing ${source}`);
  }
  assert.deepEqual(scripts, [...SCRIPT_SRC]);
  assert.deepEqual(connect, [...CONNECT_SRC]);
});

test('Stripe Checkout is a navigation, so Stripe hosts are not script or connect sources', () => {
  const policy = contentSecurityPolicy();
  assert.equal(policy.includes('stripe.com'), false);
  assert.equal(sources(policy, 'form-action').includes("'self'"), true);
});

test('SPA responses set HSTS, nosniff, and referrer policy, and drop X-Frame-Options', () => {
  const upstream = new Response('<html></html>', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'DENY',
      'cache-control': 'no-cache',
    },
  });
  const response = withSecurityHeaders(upstream);
  assert.equal(response.headers.get('Strict-Transport-Security'), SECURITY_HEADERS['Strict-Transport-Security']);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('Content-Security-Policy'), contentSecurityPolicy());
  assert.equal(response.headers.get('X-Frame-Options'), null);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.equal(response.headers.has('x-frame-options'), false);
});

test('proxied API requests carry the Worker secret and the edge client ip', async () => {
  const original = globalThis.fetch;
  let captured: Headers | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = new Headers(init?.headers);
    return new Response('ok');
  }) as typeof fetch;
  try {
    const response = await worker.fetch(
      new Request('https://aquazerofit.com/api/v1/health', {
        headers: {
          'cf-connecting-ip': '203.0.113.8',
          'x-origin-shared-secret': 'spoofed',
        },
      }),
      {
        API_ORIGIN,
        ORIGIN_SHARED_SECRET: 'real-secret',
        ASSETS: { fetch: async () => new Response('spa') },
      } as never,
    );
    assert.equal(response.status, 200);
    assert.equal(captured?.get('x-origin-shared-secret'), 'real-secret');
    assert.equal(captured?.get('cf-connecting-ip'), '203.0.113.8');
    assert.equal(response.headers.get('Content-Security-Policy'), null);
  } finally {
    globalThis.fetch = original;
  }
});

test('the asset path applies those headers and does not invent X-Frame-Options', async () => {
  const response = await worker.fetch(
    new Request('https://aquazerofit.com/'),
    {
      API_ORIGIN,
      ASSETS: {
        fetch: async () => new Response('spa', { headers: { 'content-type': 'text/html' } }),
      },
    } as never,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /frame-ancestors 'self'/);
  assert.equal(response.headers.get('X-Frame-Options'), null);
});
