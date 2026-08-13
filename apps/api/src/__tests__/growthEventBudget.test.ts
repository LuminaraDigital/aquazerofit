/**
 * Hourly storage budgets on /analytics/events (modules/analytics/eventBudget).
 *
 * Two silent failure modes are pinned here:
 *  - a broken window reset would permanently block an IP after its first hour
 *    of traffic, dropping legitimate events forever;
 *  - a missing per-user budget would let one account flood the audit
 *    container faster than the retention sweep can prune it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GrowthEvent } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-evbudget-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const {
  ANON_IP_EVENT_BUDGET_PER_HOUR,
  EVENT_BUDGET_PER_HOUR,
  consumeEventBudget,
  resetEventBudgets,
} = await import('../modules/analytics/eventBudget');

const app = createApp();
const base = '/api/v1';
const HOUR = 3_600_000;

function storedEvents(): GrowthEvent[] {
  return getStore().where<GrowthEvent>('audit', (d) => d.type === 'growthEvent');
}

async function registerActor(email: string): Promise<{ id: string; token: string }> {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email, password: 'CorrectHorse9Battery', displayName: 'Budget Tester' });
  expect(res.status).toBe(201);
  const token = res.body.accessToken as string;
  const me = await request(app).get(`${base}/me`).set({ Authorization: `Bearer ${token}` });
  expect(me.status).toBe(200);
  return { id: me.body.user.id as string, token };
}

beforeEach(() => {
  resetEventBudgets();
});

describe('consumeEventBudget window arithmetic', () => {
  it('enforces the limit inside one window', () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < ANON_IP_EVENT_BUDGET_PER_HOUR; i++) {
      expect(consumeEventBudget('ip:203.0.113.7', ANON_IP_EVENT_BUDGET_PER_HOUR, t0 + i)).toBe(
        true,
      );
    }
    expect(
      consumeEventBudget('ip:203.0.113.7', ANON_IP_EVENT_BUDGET_PER_HOUR, t0 + HOUR - 1),
    ).toBe(false);
  });

  it('accepts again after the one-hour window expires, with the count reset to 1', () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < ANON_IP_EVENT_BUDGET_PER_HOUR; i++) {
      consumeEventBudget('ip:203.0.113.7', ANON_IP_EVENT_BUDGET_PER_HOUR, t0);
    }
    expect(consumeEventBudget('ip:203.0.113.7', ANON_IP_EVENT_BUDGET_PER_HOUR, t0)).toBe(false);

    // One hour later the same IP is not permanently blocked…
    const t1 = t0 + HOUR;
    expect(consumeEventBudget('ip:203.0.113.7', ANON_IP_EVENT_BUDGET_PER_HOUR, t1)).toBe(true);

    // …and the fresh window starts from 1, not on top of the old count: a full
    // budget minus the one event above still fits before the next refusal.
    for (let i = 1; i < ANON_IP_EVENT_BUDGET_PER_HOUR; i++) {
      expect(consumeEventBudget('ip:203.0.113.7', ANON_IP_EVENT_BUDGET_PER_HOUR, t1 + i)).toBe(
        true,
      );
    }
    expect(
      consumeEventBudget('ip:203.0.113.7', ANON_IP_EVENT_BUDGET_PER_HOUR, t1 + HOUR - 1),
    ).toBe(false);
  });

  it('tracks keys independently', () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < ANON_IP_EVENT_BUDGET_PER_HOUR; i++) {
      consumeEventBudget('ip:a', ANON_IP_EVENT_BUDGET_PER_HOUR, t0);
    }
    expect(consumeEventBudget('ip:a', ANON_IP_EVENT_BUDGET_PER_HOUR, t0)).toBe(false);
    expect(consumeEventBudget('ip:b', ANON_IP_EVENT_BUDGET_PER_HOUR, t0)).toBe(true);
  });
});

describe('POST /analytics/events budget enforcement', () => {
  it('persists at most the anonymous per-IP budget and sheds the excess silently', async () => {
    const before = storedEvents().length;

    for (let i = 0; i < ANON_IP_EVENT_BUDGET_PER_HOUR; i++) {
      const res = await request(app).post(`${base}/analytics/events`).send({ name: 'share_opened' });
      expect(res.status).toBe(202);
      expect(res.body.ok).toBe(true);
    }
    expect(storedEvents().length - before).toBe(ANON_IP_EVENT_BUDGET_PER_HOUR);

    // The over-budget event is acknowledged with the same response shape — a
    // probing client cannot tell it was shed — but nothing new is stored.
    const shed = await request(app).post(`${base}/analytics/events`).send({ name: 'share_opened' });
    expect(shed.status).toBe(202);
    expect(shed.body.ok).toBe(true);
    expect(typeof shed.body.id).toBe('string');
    expect(storedEvents().length - before).toBe(ANON_IP_EVENT_BUDGET_PER_HOUR);
  });

  it('keys authenticated traffic per user: one flooded account cannot store past its budget, and other users are unaffected', async () => {
    const alice = await registerActor('budget-alice@example.com');
    const bob = await registerActor('budget-bob@example.com');

    // Exhaust all but one unit of Alice's hourly budget through the same
    // counter the route consumes (600 HTTP round-trips would only re-test
    // supertest); the HTTP layer then proves the wiring at the boundary.
    for (let i = 0; i < EVENT_BUDGET_PER_HOUR - 1; i++) {
      expect(consumeEventBudget(`user:${alice.id}`, EVENT_BUDGET_PER_HOUR)).toBe(true);
    }

    const last = await request(app)
      .post(`${base}/analytics/events`)
      .set({ Authorization: `Bearer ${alice.token}` })
      .send({ name: 'share_opened' });
    expect(last.status).toBe(202);
    expect(storedEvents().filter((e) => e.userId === alice.id)).toHaveLength(1);

    const overflow = await request(app)
      .post(`${base}/analytics/events`)
      .set({ Authorization: `Bearer ${alice.token}` })
      .send({ name: 'share_copied' });
    expect(overflow.status).toBe(202); // acknowledged…
    const aliceStored = storedEvents().filter((e) => e.userId === alice.id);
    expect(aliceStored).toHaveLength(1); // …but not stored
    expect(aliceStored.length).toBeLessThanOrEqual(EVENT_BUDGET_PER_HOUR);

    // A second user's events are unaffected by Alice's exhausted budget.
    const bobRes = await request(app)
      .post(`${base}/analytics/events`)
      .set({ Authorization: `Bearer ${bob.token}` })
      .send({ name: 'share_opened' });
    expect(bobRes.status).toBe(202);
    expect(storedEvents().filter((e) => e.userId === bob.id)).toHaveLength(1);
  });
});
