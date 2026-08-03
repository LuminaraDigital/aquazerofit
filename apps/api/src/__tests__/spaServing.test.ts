/**
 * Single-origin SPA hosting.
 *
 * In production the API also serves the built web app so the whole product
 * lives behind one domain and one certificate — no CORS, no split origins.
 * That introduces one serious risk this suite guards: the client-side routing
 * fallback must never shadow the API. An unknown /api/v1/* path has to keep
 * returning the JSON error envelope, because a frontend that receives HTML
 * where it expected JSON fails in ways that are very hard to diagnose.
 *
 * A fixture directory is used rather than the real apps/web/dist so the
 * behaviour is identical whether or not the developer has run a web build.
 *
 * The fallback is registered as a pathless `app.use`, never `app.get('*')`.
 * Express 5 moved to path-to-regexp v8, which rejects a bare '*' and throws
 * at route-registration time — so the old form did not merely fail to match,
 * it took the whole server down on boot. `assertNoBareWildcardRoute` below
 * pins that, because the failure only shows up on a dependency bump.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';

const ORIGINAL_DIST = process.env.WEB_DIST_DIR;
const ORIGINAL_SERVE = process.env.SERVE_WEB;

let fixtureDir: string;
const INDEX_HTML = '<!doctype html><title>AquaZeroFit</title><div id="root"></div>';

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-spa-'));
  fs.mkdirSync(path.join(fixtureDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'index.html'), INDEX_HTML, 'utf8');
  fs.writeFileSync(path.join(fixtureDir, 'assets', 'app-a1b2c3.js'), 'console.log(1)', 'utf8');
});

afterAll(() => {
  if (ORIGINAL_DIST === undefined) delete process.env.WEB_DIST_DIR;
  else process.env.WEB_DIST_DIR = ORIGINAL_DIST;
  if (ORIGINAL_SERVE === undefined) delete process.env.SERVE_WEB;
  else process.env.SERVE_WEB = ORIGINAL_SERVE;
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe('SPA hosting enabled', () => {
  beforeAll(() => {
    process.env.WEB_DIST_DIR = fixtureDir;
    delete process.env.SERVE_WEB;
  });

  /**
   * REGRESSION: `app.get('*')` boots fine on Express 4 and throws on Express 5
   * ("Missing parameter name at index 1"), so a dependency bump turned a
   * working server into one that could not start. Asserting on the registered
   * route stack catches the reintroduction on the version we run today,
   * instead of waiting for the upgrade to fail.
   */
  it('registers the SPA fallback without a bare wildcard path', () => {
    const app = createApp();
    const stack = (app as unknown as { _router?: { stack: { route?: { path?: unknown } }[] } })
      ._router?.stack;
    expect(stack).toBeDefined();
    const bareWildcards = stack!.filter((layer) => layer.route?.path === '*');
    expect(bareWildcards).toHaveLength(0);
  });

  it('serves the shell at the root', async () => {
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="root"');
  });

  it('serves a client-side deep link with the shell, not a 404', async () => {
    const res = await request(createApp()).get('/nutrition/analysis/some-job-id');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="root"');
  });

  it('REGRESSION: an unknown API path still returns the JSON error envelope, never HTML', async () => {
    const res = await request(createApp()).get('/api/v1/definitely-not-a-route');
    // The exact status is an API-design detail — unknown /api/v1 paths answer
    // 401 because auth runs before route matching, which deliberately avoids
    // disclosing which routes exist. What matters here is that the SPA
    // fallback did not swallow it and hand back the HTML shell.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toHaveProperty('code');
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.text).not.toContain('id="root"');
  });

  it('REGRESSION: an unknown /uploads path stays a 404 and is not swallowed by the fallback', async () => {
    const res = await request(createApp()).get('/uploads/nope/missing.png');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('id="root"');
  });

  it('keeps /health as JSON', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('caches hashed assets immutably and never caches the shell', async () => {
    const asset = await request(createApp()).get('/assets/app-a1b2c3.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');

    const shell = await request(createApp()).get('/');
    expect(shell.headers['cache-control']).toBe('no-cache');
  });

  it('allows Telegram to frame the app and sends no conflicting X-Frame-Options', async () => {
    const res = await request(createApp()).get('/');
    const csp = res.headers['content-security-policy'] ?? '';
    expect(csp).toContain('frame-ancestors');
    expect(csp).toContain('web.telegram.org');
    // X-Frame-Options cannot express a multi-origin allowlist; if it were sent
    // it would override frame-ancestors and break the Mini App.
    expect(res.headers['x-frame-options']).toBeUndefined();
  });
});

describe('SPA hosting disabled (API-only deployment)', () => {
  it('falls back to the JSON 404 envelope at the root when SERVE_WEB=false', async () => {
    process.env.WEB_DIST_DIR = fixtureDir;
    process.env.SERVE_WEB = 'false';
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code');
    delete process.env.SERVE_WEB;
  });

  it('locks the CSP down to default-src none when no SPA is served', async () => {
    process.env.WEB_DIST_DIR = path.join(fixtureDir, 'does-not-exist');
    const res = await request(createApp()).get('/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    process.env.WEB_DIST_DIR = fixtureDir;
  });
});
