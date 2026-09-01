/**
 * API CACHE POLICY SUITE.
 *
 * Until recently no /api/v1 response carried a Cache-Control header at all.
 * That is only safe while every hop between this process and the browser
 * guesses right, and apps/web is fronted by an Azure Static Web Apps edge
 * (apps/web/staticwebapp.config.json), so the guess is somebody else's
 * configuration file. A heuristic that decided a 200 with no freshness
 * information was cacheable would serve one user's dashboard to the next
 * caller.
 *
 * The property under test is *default closed*: every API response says
 * no-store unless it is on a short, verified allowlist of published content
 * that is byte-identical for every caller. The negative assertions here matter
 * more than the positive ones — they are what stops the allowlist growing into
 * a leak.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-cache-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { apiCachePolicy, API_DEFAULT_CACHE_CONTROL, PUBLIC_CONTENT_CACHE_CONTROL } = await import(
  '../modules'
);

const app = createApp();
const base = '/api/v1';

let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });

/** Ids are read from the seeded catalogue rather than hardcoded. */
let foodId = '';
let recipeId = '';
let exerciseId = '';

beforeAll(async () => {
  const registered = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'cache-policy@example.com', password: 'CorrectHorse9Battery' });
  expect(registered.status).toBe(201);
  token = registered.body.accessToken as string;

  const foods = await request(app).get(`${base}/foods?limit=1`).set(auth());
  expect(foods.status).toBe(200);
  foodId = foods.body.items[0].id as string;

  const recipes = await request(app).get(`${base}/recipes?limit=1`).set(auth());
  expect(recipes.status).toBe(200);
  recipeId = recipes.body.items[0].id as string;

  // No query params → the legacy plain-array shape.
  const exercises = await request(app).get(`${base}/exercises`).set(auth());
  expect(exercises.status).toBe(200);
  exerciseId = exercises.body[0].id as string;
});

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

// ---------------------------------------------------------------------------

describe('every API response is no-store by default', () => {
  it('a user-specific authenticated read is private and no-store', async () => {
    const res = await request(app).get(`${base}/me`).set(auth());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('an unauthenticated 401 is no-store', async () => {
    const res = await request(app).get(`${base}/me`);
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('an unknown /api/v1 path 404s with the JSON envelope and is still no-store', async () => {
    const res = await request(app).get(`${base}/definitely-not-a-route`).set(auth());
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('an auth POST — the response most worth never storing — is no-store', async () => {
    const res = await request(app)
      .post(`${base}/auth/login`)
      .send({ email: 'cache-policy@example.com', password: 'CorrectHorse9Battery' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('the diary export is no-store even though it is a file download', async () => {
    const res = await request(app).get(`${base}/export/diary?format=csv`).set(auth());
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });
});

describe('published catalogue content opts out explicitly', () => {
  it('food search and food detail are publicly cacheable', async () => {
    const search = await request(app).get(`${base}/foods?search=a&limit=5`).set(auth());
    expect(search.status).toBe(200);
    expect(search.headers['cache-control']).toBe(PUBLIC_CONTENT_CACHE_CONTROL);

    const detail = await request(app).get(`${base}/foods/${foodId}`).set(auth());
    expect(detail.status).toBe(200);
    expect(detail.headers['cache-control']).toBe(PUBLIC_CONTENT_CACHE_CONTROL);
  });

  it('recipe library and recipe detail are publicly cacheable', async () => {
    const list = await request(app).get(`${base}/recipes`).set(auth());
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe(PUBLIC_CONTENT_CACHE_CONTROL);

    const detail = await request(app).get(`${base}/recipes/${recipeId}`).set(auth());
    expect(detail.status).toBe(200);
    expect(detail.headers['cache-control']).toBe(PUBLIC_CONTENT_CACHE_CONTROL);
  });

  it('a single exercise and its variations are publicly cacheable', async () => {
    const detail = await request(app).get(`${base}/exercises/${exerciseId}`).set(auth());
    expect(detail.status).toBe(200);
    expect(detail.headers['cache-control']).toBe(PUBLIC_CONTENT_CACHE_CONTROL);

    const variations = await request(app).get(`${base}/exercises/${exerciseId}/variations`).set(auth());
    expect(variations.status).toBe(200);
    expect(variations.headers['cache-control']).toBe(PUBLIC_CONTENT_CACHE_CONTROL);
  });

  it('the public policy says `public`, without which a CDN may not store an authenticated response at all', () => {
    // RFC 9111 §3.5: a shared cache must not store a response to a request
    // carrying Authorization unless the response explicitly permits it. These
    // routes are all behind requireAuth.
    expect(PUBLIC_CONTENT_CACHE_CONTROL).toContain('public');
    expect(PUBLIC_CONTENT_CACHE_CONTROL).not.toContain('no-store');
  });
});

describe('routes that look public but vary by user are NOT opted out', () => {
  it('the exercise LIST stays no-store — respectProfile filters it per user', async () => {
    // Same URL, different body depending on the caller's injuries/equipment.
    const res = await request(app)
      .get(`${base}/exercises?respectProfile=true&limit=5`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);

    // ...and the same holds without the parameter, because the parameter is
    // the client's choice and the URL alone is what a cache keys on.
    const plain = await request(app).get(`${base}/exercises`).set(auth());
    expect(plain.status).toBe(200);
    expect(plain.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('the exercise library under /workouts stays no-store too', async () => {
    const res = await request(app).get(`${base}/workouts/exercises`).set(auth());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('the coach roster stays no-store — it ships the caller’s progression with it', async () => {
    const res = await request(app).get(`${base}/coaches`).set(auth());
    expect(res.status).toBe(200);
    // The give-away: per-user fields in what looks like a static roster.
    expect(res.body).toHaveProperty('activeCoachId');
    expect(res.body).toHaveProperty('entitlements');
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('the barcode lookup stays no-store — it is a live upstream fetch, not a catalogue read', async () => {
    const res = await request(app).get(`${base}/foods/barcode/not-a-barcode`).set(auth());
    expect(res.status).toBe(400);
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });
});

describe('the public upgrade cannot be applied to a failure', () => {
  it('an unauthenticated request to a publicly cacheable path gets 401 + no-store', async () => {
    // This is the ordering bug the deferred upgrade exists to prevent: the
    // policy middleware runs before requireAuth, so an eager upgrade would
    // stamp `public, max-age=300` onto this 401 and a shared cache would then
    // serve it to everybody for five minutes.
    for (const url of [`${base}/foods`, `${base}/foods/${foodId}`, `${base}/recipes`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(401);
      expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
    }
  });

  it('a 404 on a publicly cacheable path shape is not cached publicly', async () => {
    const res = await request(app).get(`${base}/foods/f-does-not-exist`).set(auth());
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });
});

describe('handlers that set their own policy win', () => {
  /** Minimal express-ish double: enough surface for the middleware under test. */
  function fakeRes(): Response & { headers: Record<string, unknown> } {
    const headers: Record<string, unknown> = {};
    const res = {
      statusCode: 200,
      headers,
      setHeader(name: string, value: unknown) {
        headers[name] = value;
        return res;
      },
      getHeader(name: string) {
        return headers[name];
      },
      writeHead(..._args: unknown[]) {
        return res;
      },
    };
    return res as unknown as Response & { headers: Record<string, unknown> };
  }

  const noop: NextFunction = () => {};

  it('the default is written before next(), so a later setHeader overwrites it', () => {
    const res = fakeRes();
    apiCachePolicy({ method: 'GET', path: '/me' } as Request, res, noop);
    expect(res.headers['Cache-Control']).toBe(API_DEFAULT_CACHE_CONTROL);

    // What the chat SSE stream and the meal-photo route do after us.
    res.setHeader('Cache-Control', 'no-cache');
    res.writeHead(200);
    expect(res.headers['Cache-Control']).toBe('no-cache');
  });

  it('a handler override on a publicly cacheable path is not upgraded either', () => {
    const res = fakeRes();
    apiCachePolicy({ method: 'GET', path: '/foods' } as Request, res, noop);
    res.setHeader('Cache-Control', 'private, no-store');
    res.writeHead(200);
    // The upgrade only fires when the header is still untouched.
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('an untouched publicly cacheable 200 is upgraded at flush time', () => {
    const res = fakeRes();
    apiCachePolicy({ method: 'GET', path: '/recipes/r-1' } as Request, res, noop);
    expect(res.headers['Cache-Control']).toBe(API_DEFAULT_CACHE_CONTROL);
    res.writeHead(200);
    expect(res.headers['Cache-Control']).toBe(PUBLIC_CONTENT_CACHE_CONTROL);
  });

  it('a 5xx on a publicly cacheable path keeps the default', () => {
    const res = fakeRes();
    apiCachePolicy({ method: 'GET', path: '/recipes/r-1' } as Request, res, noop);
    res.statusCode = 500;
    res.writeHead(500);
    expect(res.headers['Cache-Control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('a write method on a publicly cacheable path is never upgraded', () => {
    const res = fakeRes();
    apiCachePolicy({ method: 'POST', path: '/foods' } as Request, res, noop);
    res.writeHead(201);
    expect(res.headers['Cache-Control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });
});

describe('non-API routes are untouched', () => {
  it('/health does not inherit the API policy', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeUndefined();
  });
});
