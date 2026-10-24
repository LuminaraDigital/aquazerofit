import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ORIGIN } from './proxy.ts';
import {
  CONNECT_SRC,
  FRAME_ANCESTORS,
  SCRIPT_SRC,
  SECURITY_HEADERS,
  WORKER_SRC,
  contentSecurityPolicy,
  secureSpaResponse,
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
    'https://challenges.cloudflare.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firebaseinstallations.googleapis.com',
    'https://www.googleapis.com',
    'https://www.google-analytics.com',
  ]) {
    assert.ok(connect.includes(source), `connect-src missing ${source}`);
  }
  assert.deepEqual(sources(policy, 'worker-src'), [...WORKER_SRC]);
  assert.deepEqual(WORKER_SRC, ["'none'"]);
  assert.ok(sources(policy, 'frame-src').includes('https://*.firebaseapp.com'));
  assert.equal(policy.includes('unsafe-eval'), false);
  assert.equal(policy.includes('unsafe-inline') && policy.includes('script-src'), true);
  assert.equal(sources(policy, 'script-src').includes("'unsafe-inline'"), false);
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

test('HTML JSON-LD receives a script nonce and other responses do not', async () => {
  const html = '<html><head><script type="application/ld+json">{"@context":"https://schema.org"}</script></head></html>';
  const first = await secureSpaResponse(
    new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
  );
  const second = await secureSpaResponse(
    new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
  );
  const body = await first.text();
  const policy = first.headers.get('Content-Security-Policy') ?? '';
  const nonce = sources(policy, 'script-src')[0];
  assert.match(nonce, /^'nonce-[A-Za-z0-9+/=]+'$/);
  const nonceValue = nonce.slice("'nonce-".length, -1);
  assert.ok(body.includes(`<script type="application/ld+json" nonce="${nonceValue}">`));
  assert.notEqual(first.headers.get('Content-Security-Policy'), second.headers.get('Content-Security-Policy'));
  const plain = await secureSpaResponse(
    new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }),
  );
  assert.equal(plain.headers.get('Content-Security-Policy'), contentSecurityPolicy());
  assert.equal(sources(plain.headers.get('Content-Security-Policy') ?? '', 'script-src').some((s) => s.startsWith("'nonce-")), false);
});

test('a slashless legal URL is followed and then given the SPA policy', async () => {
  const html =
    '<html><head><script type="application/ld+json">{"@type":"WebPage"}</script></head><body>refund</body></html>';
  const response = await worker.fetch(new Request('https://aquazerofit.com/refund'), {
    API_ORIGIN,
    ASSETS: {
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        if (url.pathname === '/refund') {
          return new Response(null, { status: 307, headers: { Location: '/refund/' } });
        }
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      },
    },
  } as never);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /nonce=/);
  assert.match(body, /refund/);
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /'nonce-/);
  assert.equal(response.headers.get('X-Frame-Options'), null);
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
