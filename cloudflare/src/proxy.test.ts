import assert from 'node:assert/strict';
import test from 'node:test';
import {
  API_ORIGIN,
  ORIGIN_SECRET_HEADER,
  canonicalLegalPath,
  canonicalRedirect,
  isProxiedPath,
  legalRedirectTarget,
  upstreamRequest,
} from './proxy.ts';

test('proxies API, uploads, and probes, and leaves the SPA alone', () => {
  assert.equal(isProxiedPath('/api/v1/auth/login'), true);
  assert.equal(isProxiedPath('/api'), true);
  assert.equal(isProxiedPath('/uploads/exercises/a.png'), true);
  assert.equal(isProxiedPath('/health'), true);
  assert.equal(isProxiedPath('/ready'), true);
  assert.equal(isProxiedPath('/'), false);
  assert.equal(isProxiedPath('/nutrition'), false);
  assert.equal(isProxiedPath('/.well-known/assetlinks.json'), false);
  assert.equal(isProxiedPath('/assets/index.js'), false);
});

test('follows a trailing-slash redirect only for the legal pages', () => {
  assert.equal(canonicalLegalPath('/terms'), '/terms');
  assert.equal(canonicalLegalPath('/terms/'), '/terms');
  assert.equal(canonicalLegalPath('/privacy'), '/privacy');
  assert.equal(canonicalLegalPath('/refund/'), '/refund');
  assert.equal(canonicalLegalPath('/features'), null);

  const followed = legalRedirectTarget(
    'https://aquazerofit.com/terms',
    307,
    'https://aquazerofit.com/terms/',
  );
  assert.equal(followed, 'https://aquazerofit.com/terms/');

  assert.equal(
    legalRedirectTarget('https://aquazerofit.com/features', 307, '/features/'),
    null,
  );
  assert.equal(
    legalRedirectTarget('https://aquazerofit.com/terms', 307, 'https://evil.example/terms/'),
    null,
  );
  assert.equal(legalRedirectTarget('https://aquazerofit.com/terms', 301, '/terms/'), null);
  assert.equal(
    legalRedirectTarget('https://aquazerofit.com/terms/', 200, null),
    null,
  );
});

test('redirects www to the apex and leaves the apex alone', () => {
  const www = canonicalRedirect(new URL('https://www.aquazerofit.com/nutrition?x=1'));
  assert.equal(www, 'https://aquazerofit.com/nutrition?x=1');
  assert.equal(canonicalRedirect(new URL('https://aquazerofit.com/nutrition')), null);
  assert.equal(canonicalRedirect(new URL('https://aquazerofit.workers.dev/')), null);
});

test('targets Cloud Run and drops a spoofed forwarding header', () => {
  const request = new Request('https://aquazerofit.com/api/v1/health?x=1', {
    headers: {
      'cf-connecting-ip': '203.0.113.9',
      'x-forwarded-for': '198.51.100.4',
      cookie: 'azf_rt=abc',
      host: 'aquazerofit.com',
    },
  });
  const upstream = upstreamRequest(request, API_ORIGIN);
  assert.equal(upstream.url, `${API_ORIGIN}/api/v1/health?x=1`);
  const headers = new Headers(upstream.init.headers);
  assert.equal(headers.get('x-forwarded-for'), '203.0.113.9');
  assert.equal(headers.get('cookie'), 'azf_rt=abc');
  assert.equal(headers.get('host'), null);
  assert.equal(headers.get('cf-connecting-ip'), '203.0.113.9');
  assert.equal(headers.get(ORIGIN_SECRET_HEADER), null);
  assert.equal(upstream.init.redirect, 'manual');
});

test('replaces a spoofed origin secret and omits the header when unset', () => {
  const request = new Request('https://aquazerofit.com/api/v1/auth/telegram', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': '203.0.113.9',
      'x-origin-shared-secret': 'spoofed',
    },
  });
  const withSecret = upstreamRequest(request, API_ORIGIN, '  real-secret  ');
  const headers = new Headers(withSecret.init.headers);
  assert.equal(headers.get(ORIGIN_SECRET_HEADER), 'real-secret');
  assert.equal(headers.get('cf-connecting-ip'), '203.0.113.9');
  assert.equal(headers.get('x-forwarded-for'), '203.0.113.9');

  const without = upstreamRequest(request, API_ORIGIN, '   ');
  assert.equal(new Headers(without.init.headers).get(ORIGIN_SECRET_HEADER), null);
});
