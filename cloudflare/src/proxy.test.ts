import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ORIGIN, canonicalRedirect, isProxiedPath, upstreamRequest } from './proxy.ts';

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
  assert.equal(upstream.init.redirect, 'manual');
});
