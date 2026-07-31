/**
 * CROSS-USER ISOLATION SUITE (security review, memory feature release).
 *
 * Two registered users A and B; for every ownable resource, B reading or
 * mutating A's resource by id must yield 404 NOT_FOUND — never 403 (which
 * would confirm the id exists) and never data. List/aggregate endpoints must
 * be silently scoped to the caller. Also: B's memory never contains A's
 * facts, and A's GDPR export contains only A's docs.
 *
 * Resources that have no per-id endpoint (water logs, weight logs, plans) are
 * covered through their list/current endpoints instead — the only read path a
 * foreign user could reach.
 *
 * Workout sessions, vision jobs and recommendations are seeded directly into
 * the store: creating them through the API needs a plan-day that isn't a rest
 * day / a multipart upload with a background timer / a model call, all of
 * which add nondeterminism while the thing under test is purely the
 * ownership check on the read/mutate path.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-isolation-'));
process.env.AZF_DATA_DIR = dataDir;
// The chat turn must land on the deterministic mock, never a real provider,
// even when the host environment carries provider keys.
for (const key of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY', 'OLLAMA_API_KEY']) {
  delete process.env[key];
}

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';
const PASSWORD = 'CorrectHorse9Battery';
const DATE = '2026-07-20';

interface TestUser {
  token: string;
  id: string;
}

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

async function registerUser(email: string): Promise<TestUser> {
  const res = await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

async function enableConsents(user: TestUser): Promise<void> {
  const res = await request(app).put(`${base}/me/consents`).set(auth(user)).send({
    wellnessDataProcessing: true,
    aiPersonalisation: true,
    anonymisedAnalytics: false,
    reminders: false,
  });
  expect(res.status).toBe(200);
}

async function putProfile(user: TestUser): Promise<void> {
  const res = await request(app).put(`${base}/me/profile`).set(auth(user)).send({
    weightKg: 82,
    heightCm: 176,
    age: 29,
    sex: 'male',
    goal: 'lose',
    activityLevel: 'moderate',
    exerciseExperience: 'beginner',
    dietaryPreferences: [],
    allergies: [],
    equipment: ['dumbbells'],
    unitPreference: 'metric',
  });
  expect(res.status).toBe(200);
}

/** Every by-id probe from a non-owner must be exactly this. */
function expectNotFound(res: { status: number; body: { code?: string } }): void {
  expect(res.status).toBe(404);
  expect(res.body.code).toBe('NOT_FOUND');
}

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
  userA = await registerUser('isolation-a@example.com');
  userB = await registerUser('isolation-b@example.com');
  await enableConsents(userA);
  await enableConsents(userB);
  await putProfile(userA); // A owns a profile/plan; B deliberately has neither
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

describe('meal logs', () => {
  let mealLogId = '';

  beforeAll(async () => {
    const res = await request(app)
      .post(`${base}/meal-logs`)
      .set(auth(userA))
      .send({
        mealType: 'lunch',
        localDate: DATE,
        items: [{ name: 'Chicken Breast', grams: 150, kcal: 247.5, proteinG: 46.5, carbsG: 0, fatG: 5.4 }],
      });
    expect(res.status).toBe(201);
    mealLogId = res.body.log.id as string;
  });

  it("B updating A's meal log by id -> 404", async () => {
    const res = await request(app)
      .put(`${base}/meal-logs/${mealLogId}`)
      .set(auth(userB))
      .send({ mealType: 'dinner' });
    expectNotFound(res);
  });

  it("B deleting A's meal log by id -> 404, and A's log survives", async () => {
    expectNotFound(await request(app).delete(`${base}/meal-logs/${mealLogId}`).set(auth(userB)));
    const day = await request(app).get(`${base}/meal-logs?date=${DATE}`).set(auth(userA));
    expect(day.status).toBe(200);
    expect(JSON.stringify(day.body)).toContain(mealLogId);
  });

  it("B's day view for the same date never contains A's data", async () => {
    const res = await request(app).get(`${base}/meal-logs?date=${DATE}`).set(auth(userB));
    expect(res.status).toBe(200);
    expect(res.body.totals.totalKcal).toBe(0);
    expect(JSON.stringify(res.body)).not.toContain(mealLogId);
  });
});

describe('water and weight logs (no per-id endpoints: list scoping is the whole surface)', () => {
  beforeAll(async () => {
    const water = await request(app)
      .post(`${base}/water-logs`)
      .set(auth(userA))
      .send({ amountMl: 500, localDate: DATE });
    expect(water.status).toBe(201);
    const weight = await request(app)
      .post(`${base}/weight-logs`)
      .set(auth(userA))
      .send({ weightKg: 81.4, localDate: DATE });
    expect(weight.status).toBe(201);
  });

  it("B's water total excludes A's water", async () => {
    const res = await request(app).get(`${base}/water-logs?date=${DATE}`).set(auth(userB));
    expect(res.status).toBe(200);
    expect(res.body.totalMl).toBe(0);
  });

  it("B's weight series excludes A's weigh-ins", async () => {
    const res = await request(app).get(`${base}/weight-logs?range=90d`).set(auth(userB));
    expect(res.status).toBe(200);
    expect(res.body.points).toEqual([]);
    expect(res.body.logs).toEqual([]);
  });
});

describe('training plans (per-user /current; no by-id endpoint exists)', () => {
  it("A generates a plan; B's /plans/current stays 404", async () => {
    const gen = await request(app).post(`${base}/plans/generate`).set(auth(userA)).send({});
    expect(gen.status).toBe(201);
    expect(gen.body.plan.userId).toBe(userA.id);

    const current = await request(app).get(`${base}/plans/current`).set(auth(userB));
    expectNotFound(current);
  });
});

describe('workout sessions', () => {
  const sessionDocId = `ws-${DATE}-isolation-a`;

  beforeAll(() => {
    getStore().upsert('plans', {
      id: sessionDocId,
      userId: userA.id,
      type: 'workoutSession',
      planId: 'plan-x',
      planDayOrder: 1,
      focus: 'Full Body Strength',
      exercises: [
        {
          exerciseId: 'ex-goblet-squat',
          name: 'Goblet Squat',
          setsPlanned: 3,
          setsCompleted: 0,
          reps: '10-12',
          restSeconds: 60,
          skipped: false,
        },
      ],
      status: 'pending',
      startedAt: null,
      completedAt: null,
      durationMinutes: null,
      kcalBurned: null,
      localDate: DATE,
    });
  });

  const completeBody = {
    exercises: [{ exerciseId: 'ex-goblet-squat', setsCompleted: 3, skipped: false }],
    durationMinutes: 30,
    localDate: DATE,
  };

  it("B completing A's session by id -> 404", async () => {
    const res = await request(app)
      .post(`${base}/workouts/${sessionDocId}/complete`)
      .set(auth(userB))
      .send(completeBody);
    expectNotFound(res);
  });

  it("B swapping an exercise in A's session -> 404", async () => {
    const res = await request(app)
      .post(`${base}/workouts/${sessionDocId}/swap-exercise`)
      .set(auth(userB))
      .send({ exerciseId: 'ex-goblet-squat' });
    expectNotFound(res);
  });

  it('the owner can still complete the same session (the id is real)', async () => {
    const res = await request(app)
      .post(`${base}/workouts/${sessionDocId}/complete`)
      .set(auth(userA))
      .send(completeBody);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe('completed');
  });
});

describe('chat sessions and messages', () => {
  let sessionId = '';
  let messageId = '';

  beforeAll(async () => {
    const created = await request(app).post(`${base}/chat/sessions`).set(auth(userA)).send({});
    expect(created.status).toBe(201);
    sessionId = created.body.session.id as string;

    // One full turn so the session holds real messages (mock provider).
    const turn = await request(app)
      .post(`${base}/chat/sessions/${sessionId}/messages`)
      .set(auth(userA))
      .send({ content: 'How am I tracking today?' });
    expect(turn.status).toBe(200);
    expect(turn.text).toContain('"type":"done"');

    const messages = await request(app)
      .get(`${base}/chat/sessions/${sessionId}/messages`)
      .set(auth(userA));
    expect(messages.status).toBe(200);
    messageId = messages.body.messages[0].id as string;

    // The fire-and-forget extraction from A's turn writes to A's memory in the
    // background — give it a beat so it cannot interleave with later asserts.
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it("B reading A's session messages -> 404 (id existence not confirmed)", async () => {
    expectNotFound(
      await request(app).get(`${base}/chat/sessions/${sessionId}/messages`).set(auth(userB)),
    );
  });

  it("B posting a turn into A's session -> 404, before any SSE opens", async () => {
    const res = await request(app)
      .post(`${base}/chat/sessions/${sessionId}/messages`)
      .set(auth(userB))
      .send({ content: 'hello from the intruder' });
    expectNotFound(res);
    expect(res.headers['content-type']).toContain('application/json'); // not text/event-stream
  });

  it("B deleting A's session -> 404, and the session survives", async () => {
    expectNotFound(await request(app).delete(`${base}/chat/sessions/${sessionId}`).set(auth(userB)));
    const list = await request(app).get(`${base}/chat/sessions`).set(auth(userA));
    expect(list.body.sessions.map((s: { id: string }) => s.id)).toContain(sessionId);
  });

  it("B reporting A's message -> 404", async () => {
    expectNotFound(
      await request(app).post(`${base}/chat/messages/${messageId}/report`).set(auth(userB)).send({}),
    );
  });

  it("B's session list never contains A's session", async () => {
    const res = await request(app).get(`${base}/chat/sessions`).set(auth(userB));
    expect(res.status).toBe(200);
    expect(res.body.sessions.map((s: { id: string }) => s.id)).not.toContain(sessionId);
  });
});

describe('meal-photo (vision) jobs', () => {
  const jobId = 'vj-isolation-seeded-a';

  beforeAll(() => {
    getStore().upsert('ai', {
      id: jobId,
      userId: userA.id,
      type: 'cvJob',
      status: 'succeeded',
      imagePath: path.join(dataDir, 'nonexistent.jpg'),
      mealType: 'lunch',
      predictions: [
        {
          name: 'Chicken Breast',
          foodId: 'food-chicken-breast',
          estimatedGrams: 150,
          confidence: 0.9,
          kcal: 247.5,
          proteinG: 46.5,
          carbsG: 0,
          fatG: 5.4,
        },
      ],
      ai: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  });

  it("B reading A's job status -> 404", async () => {
    expectNotFound(await request(app).get(`${base}/meal-photos/${jobId}`).set(auth(userB)));
  });

  it("B streaming A's photo -> 404", async () => {
    expectNotFound(await request(app).get(`${base}/meal-photos/${jobId}/image`).set(auth(userB)));
  });

  it("B confirming A's job into a meal log -> 404", async () => {
    const res = await request(app)
      .post(`${base}/meal-photos/${jobId}/confirm`)
      .set(auth(userB))
      .send({
        mealType: 'lunch',
        localDate: DATE,
        items: [{ name: 'Chicken Breast', grams: 150, kcal: 247.5, proteinG: 46.5, carbsG: 0, fatG: 5.4 }],
      });
    expectNotFound(res);
  });

  it('the owner can read the same job (the id is real)', async () => {
    const res = await request(app).get(`${base}/meal-photos/${jobId}`).set(auth(userA));
    expect(res.status).toBe(200);
    expect(res.body.job.id).toBe(jobId);
    expect(res.body.job.imagePath).toBeUndefined(); // server path never leaves the API
  });
});

describe('meal recommendations', () => {
  const recId = 'rec-isolation-seeded-a';

  beforeAll(() => {
    getStore().upsert('ai', {
      id: recId,
      userId: userA.id,
      type: 'recommendation',
      name: 'Grilled Chicken Salad',
      description: 'A test recommendation',
      mealType: 'lunch',
      kcal: 420,
      proteinG: 38,
      carbsG: 20,
      fatG: 18,
      ingredients: ['chicken', 'lettuce'],
      rationale: 'Fits your remaining budget.',
      ai: { provider: 'mock', model: 'mock-planStructured', promptVersion: 'P-02@1.0.0', generatedAt: new Date().toISOString() },
      feedback: null,
      loggedMealId: null,
      createdAt: new Date().toISOString(),
    });
  });

  it("B giving feedback on A's recommendation -> 404", async () => {
    expectNotFound(
      await request(app).post(`${base}/recommendations/${recId}/feedback`).set(auth(userB)).send({ feedback: 'up' }),
    );
  });

  it("B one-tap logging A's recommendation -> 404 (no meal log created)", async () => {
    expectNotFound(
      await request(app).post(`${base}/recommendations/${recId}/log`).set(auth(userB)).send({}),
    );
    const day = await request(app).get(`${base}/meal-logs?date=${DATE}`).set(auth(userB));
    expect(day.body.totals.totalKcal).toBe(0);
  });

  it('the owner can rate the same recommendation (the id is real)', async () => {
    const res = await request(app)
      .post(`${base}/recommendations/${recId}/feedback`)
      .set(auth(userA))
      .send({ feedback: 'up' });
    expect(res.status).toBe(200);
  });
});

describe('AI memory', () => {
  const A_FACT_TEXT = 'Trains fasted before 7am (isolation suite marker)';
  let factId = '';

  beforeAll(async () => {
    const res = await request(app)
      .post(`${base}/me/memory/facts`)
      .set(auth(userA))
      .send({ text: A_FACT_TEXT, category: 'context' });
    expect(res.status).toBe(201);
    const facts = res.body.memory.facts as { id: string; text: string }[];
    factId = facts.find((f) => f.text === A_FACT_TEXT)!.id;
  });

  it("B's GET /me/memory never contains A's facts", async () => {
    const res = await request(app).get(`${base}/me/memory`).set(auth(userB));
    expect(res.status).toBe(200);
    expect(res.body.memory.userId).toBe(userB.id);
    expect(JSON.stringify(res.body)).not.toContain(A_FACT_TEXT);
    expect(JSON.stringify(res.body)).not.toContain(factId);
  });

  it("B mutating A's fact by id -> 404 on PATCH and DELETE", async () => {
    expectNotFound(
      await request(app).patch(`${base}/me/memory/facts/${factId}`).set(auth(userB)).send({ status: 'rejected' }),
    );
    expectNotFound(await request(app).delete(`${base}/me/memory/facts/${factId}`).set(auth(userB)));

    // A's fact is untouched by the probes.
    const check = await request(app).get(`${base}/me/memory`).set(auth(userA));
    const fact = (check.body.memory.facts as { id: string; status: string }[]).find((f) => f.id === factId);
    expect(fact).toMatchObject({ id: factId, status: 'confirmed' });
  });
});

describe('GDPR export scoping', () => {
  it("A's export contains only A's docs across every user-scoped container", async () => {
    // Give B some distinctive data first so a leak would be visible.
    const bFact = await request(app)
      .post(`${base}/me/memory/facts`)
      .set(auth(userB))
      .send({ text: 'B-only secret allergy marker fact', category: 'constraint' });
    expect(bFact.status).toBe(201);

    const res = await request(app).get(`${base}/me/export`).set(auth(userA));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userA.id);

    for (const container of ['profiles', 'logs', 'plans', 'ai', 'ledger', 'audit'] as const) {
      const docs = res.body[container] as { userId?: string }[];
      expect(Array.isArray(docs)).toBe(true);
      for (const doc of docs) {
        expect(doc.userId).toBe(userA.id);
      }
    }

    const flat = JSON.stringify(res.body);
    expect(flat).not.toContain(userB.id);
    expect(flat).not.toContain('B-only secret allergy marker fact');
    expect(flat).not.toContain('isolation-b@example.com');
  });
});
