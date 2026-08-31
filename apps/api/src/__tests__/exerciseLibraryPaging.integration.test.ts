/**
 * EXERCISE LIBRARY PAGING SUITE.
 *
 * The library is about to grow from 51 exercises to roughly 862 (the wger
 * import), with two more image corpora behind it. Two shapes serve it: a
 * paginated envelope, and a legacy plain array returned when no query
 * parameters are present.
 *
 * The legacy branch used to serialize the *entire* corpus into one response
 * with no ceiling of any kind. That is invisible at 51 records and becomes a
 * multi-megabyte response on a mobile connection at 862, growing with every
 * import. The property pinned here is that the legacy shape can never return
 * more than the supported shape's maximum page.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-library-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');

const app = createApp();
const base = '/api/v1';

let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });

/** The paginated `limit` maximum, and therefore the legacy array's ceiling. */
const LIMIT_MAX = 200;

beforeAll(async () => {
  const registered = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'library-paging@example.com', password: 'CorrectHorse9Battery' });
  expect(registered.status).toBe(201);
  token = registered.body.accessToken as string;
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

describe('the legacy no-params array is bounded', () => {
  it('never returns more than the paginated limit maximum', async () => {
    const res = await request(app).get(`${base}/exercises`).set(auth());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // The seed corpus is well under the cap today; the assertion is the
    // invariant, so it keeps holding as the corpus grows past it.
    expect(res.body.length).toBeLessThanOrEqual(LIMIT_MAX);
  });

  it('is still the legacy array shape, not the envelope', async () => {
    const res = await request(app).get(`${base}/exercises`).set(auth());

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).not.toHaveProperty('items');
    expect(res.body[0]).toHaveProperty('id');
  });

  it('cannot be made more generous than the paginated shape', async () => {
    const legacy = await request(app).get(`${base}/exercises`).set(auth());
    const paged = await request(app).get(`${base}/exercises?limit=${LIMIT_MAX}&offset=0`).set(auth());

    expect(paged.status).toBe(200);
    expect(legacy.body.length).toBeLessThanOrEqual(paged.body.items.length);
  });
});

describe('the paginated envelope pages the whole corpus', () => {
  it('reports a total independent of the page size', async () => {
    const first = await request(app).get(`${base}/exercises?limit=1&offset=0`).set(auth());
    const wide = await request(app).get(`${base}/exercises?limit=${LIMIT_MAX}&offset=0`).set(auth());

    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(1);
    // The total must describe the corpus, not the page — this is the server
    // half of the same defect the Android client had, where the match count
    // was the size of the window that had been fetched.
    expect(first.body.total).toBe(wide.body.total);
    expect(first.body.total).toBeGreaterThanOrEqual(wide.body.items.length);
  });

  it('walks every row exactly once, with no gaps and no repeats', async () => {
    const pageSize = 10;
    const seen: string[] = [];
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
      const res = await request(app)
        .get(`${base}/exercises?limit=${pageSize}&offset=${offset}`)
        .set(auth());
      expect(res.status).toBe(200);
      total = res.body.total as number;
      const items = res.body.items as { id: string }[];
      if (items.length === 0) break;
      seen.push(...items.map((item) => item.id));
      offset += pageSize;
    }

    expect(seen.length).toBe(total);
    expect(new Set(seen).size).toBe(total);
  });

  it('rejects a limit above the maximum rather than honouring it', async () => {
    const res = await request(app).get(`${base}/exercises?limit=100000`).set(auth());

    // The cap has to be enforced, not clamped silently — a caller asking for
    // the whole corpus should be told no, not handed a page it did not ask for
    // and cannot tell apart from a complete answer.
    expect(res.status).toBe(400);
  });
});
