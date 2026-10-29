/**
 * Shared setup for the Fight Camp HTTP suites: an isolated data directory, a
 * fresh in-memory engage repository, and helpers for the people and activity
 * every Phase 1 test needs.
 *
 * Must be awaited before anything else imports the app, because the data
 * directory is read at import time (see integrationIsolation.ts for why).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { FC_FEATURE_ENV, type FcFeature } from '../../platform/fightCampConfig';

export interface Person {
  userId: string;
  token: string;
  auth: () => Record<string, string>;
}

export interface FightCampHarness {
  app: Express;
  base: string;
  register(displayName: string, opts?: { age?: number | null; timezone?: string }): Promise<Person>;
  /** The same person with an access token minted now: for tests that move a pinned clock by days. */
  refresh(person: Person, timezone?: string): Promise<Person>;
  setAge(userId: string, age: number | null): void;
  /** A meal log on each date: the cheapest way to make a day active. */
  seedActive(userId: string, dates: readonly string[]): void;
  enable(...features: FcFeature[]): void;
  disableAll(): void;
  cleanup(): Promise<void>;
}

const ALL_ENV = ['FIGHT_RECORD_ENABLED', 'FIGHT_RECORD_ROLLOUT_PERCENT', ...Object.values(FC_FEATURE_ENV)];

let emailSeq = 0;

export async function fightCampHarness(label: string): Promise<FightCampHarness> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `azf-${label}-`));
  process.env.AZF_DATA_DIR = dataDir;

  const { createApp } = await import('../../app');
  const { getStore } = await import('../../platform/store');
  const { setEngageRepoForTests } = await import('../../modules/fightCamp/repo');
  const { MemoryEngageRepo } = await import('../../modules/fightCamp/repo/memory');
  setEngageRepoForTests(new MemoryEngageRepo());

  const app = createApp();
  const base = '/api/v1';

  function setAge(userId: string, age: number | null): void {
    const id = `profile-${userId}`;
    if (age === null) {
      getStore().delete('profiles', id);
      return;
    }
    const existing = getStore().byId<Record<string, unknown> & { id: string }>('profiles', id);
    getStore().upsert('profiles', { ...(existing ?? { id, type: 'wellnessProfile', userId }), age });
  }

  const { signAccess } = await import('../../platform/auth');

  return {
    app,
    base,
    setAge,
    async refresh(person, timezone = 'UTC') {
      const token = signAccess({ id: person.userId, role: 'user', tier: 'free', premiumUntil: null });
      return { ...person, token, auth: () => ({ Authorization: `Bearer ${token}`, 'X-Timezone': timezone }) };
    },
    async register(displayName, opts = {}) {
      emailSeq += 1;
      const res = await request(app)
        .post(`${base}/auth/register`)
        .send({
          email: `${label}-${emailSeq}-${Date.now()}@example.com`,
          password: 'CorrectHorse9Battery',
          displayName,
        });
      if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
      const userId = res.body.user.id as string;
      const token = res.body.accessToken as string;
      const age = opts.age === undefined ? 30 : opts.age;
      if (age !== null) setAge(userId, age);
      const timezone = opts.timezone ?? 'UTC';
      return { userId, token, auth: () => ({ Authorization: `Bearer ${token}`, 'X-Timezone': timezone }) };
    },
    seedActive(userId, dates) {
      for (const localDate of dates) {
        getStore().upsert('logs', {
          id: `ml-${userId}-${localDate}`,
          userId,
          type: 'mealLog',
          mealType: 'lunch',
          items: [],
          totalKcal: 500,
          totalProteinG: 30,
          totalCarbsG: 50,
          totalFatG: 15,
          source: 'manual',
          localDate,
          loggedAt: `${localDate}T12:00:00.000Z`,
        });
      }
    },
    enable(...features) {
      process.env.FIGHT_RECORD_ENABLED = 'true';
      for (const feature of features) process.env[FC_FEATURE_ENV[feature]] = 'true';
    },
    disableAll() {
      for (const name of ALL_ENV) delete process.env[name];
    },
    async cleanup() {
      for (const name of ALL_ENV) delete process.env[name];
      await getStore().flush();
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup on Windows */
      }
    },
  };
}
