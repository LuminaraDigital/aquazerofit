/**
 * A chat sentence becomes a proposal, and only the user's tap becomes a log row.
 * Runs on the offline engine, which is the point: no model is involved.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Allergen,
  ChatActionDraft,
  MealLog,
  TrainingPlan,
  WaterLog,
  WeightLog,
  WellnessProfile,
  WorkoutSession,
} from '@aquazerofit/shared';
import { creditLedger } from '../modules/ai/creditLedger';
import type { ChatMealDraft } from '../modules/chat/mealDraft';
import type { TodayWorkout } from '../modules/workouts/service';
import {
  bindIsolatedDataDir,
  clearProviderEnv,
  createIsolatedDataDir,
  pinIsolatedDataDir,
  saveProviderEnv,
  teardownIsolatedDataDir,
} from './helpers/integrationIsolation';

const savedAzfDataDir = process.env.AZF_DATA_DIR;
const savedProviderEnv = saveProviderEnv();
const dataDir = createIsolatedDataDir('azf-chat-actions-');
bindIsolatedDataDir(dataDir);
clearProviderEnv();

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

beforeAll(() => {
  pinIsolatedDataDir(dataDir);
});

afterAll(async () => {
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

let userCount = 0;

async function signUp(): Promise<{ token: string; userId: string }> {
  userCount += 1;
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: `actions${userCount}@example.com`, password: 'Sufficiently-long-1', displayName: 'Actions' });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken, userId: res.body.user.id };
}

async function say(token: string, content: string, actionCards = true, localDate?: string) {
  const session = await request(app)
    .post(`${base}/chat/sessions`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  const id = session.body.session?.id ?? session.body.id;
  await request(app)
    .post(`${base}/chat/sessions/${id}/messages`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content, actionCards, localDate });
  const drafts = await request(app)
    .get(`${base}/chat/action-drafts`)
    .set('Authorization', `Bearer ${token}`);
  return drafts.body.drafts as { id: string; action: { kind: string } }[];
}

const waterRows = (userId: string) =>
  getStore().where<WaterLog>('logs', (d) => d.type === 'waterLog' && d.userId === userId);

describe('coach actions', () => {
  it('writes nothing until the user confirms, then writes once', async () => {
    const { token, userId } = await signUp();
    const [draft] = await say(token, 'I drank 500ml of water');

    expect(draft?.action).toEqual({ kind: 'logWater', amountMl: 500 });
    expect(waterRows(userId)).toHaveLength(0);

    const url = `${base}/chat/action-drafts/${draft!.id}/confirm`;
    const [first, second] = await Promise.all([
      request(app).post(url).set('Authorization', `Bearer ${token}`),
      request(app).post(url).set('Authorization', `Bearer ${token}`),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(waterRows(userId)).toHaveLength(1);
  });

  it('logs a confirmed weight through the same row as the weight tab', async () => {
    const { token, userId } = await signUp();
    const [draft] = await say(token, 'I weigh 82.5kg');
    await request(app)
      .post(`${base}/chat/action-drafts/${draft!.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rows = getStore().where<WeightLog>('logs', (d) => d.type === 'weightLog' && d.userId === userId);
    expect(rows.map((r) => r.weightKg)).toEqual([82.5]);
  });

  it('dismissing logs nothing and clears the card', async () => {
    const { token, userId } = await signUp();
    const [draft] = await say(token, 'I drank 500ml of water');
    await request(app)
      .post(`${base}/chat/action-drafts/${draft!.id}/dismiss`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const left = await request(app)
      .get(`${base}/chat/action-drafts`)
      .set('Authorization', `Bearer ${token}`);
    expect(left.body.drafts).toEqual([]);
    expect(waterRows(userId)).toHaveLength(0);
  });

  it("refuses another user's proposal", async () => {
    const owner = await signUp();
    const other = await signUp();
    const [draft] = await say(owner.token, 'I drank 500ml of water');
    await request(app)
      .post(`${base}/chat/action-drafts/${draft!.id}/confirm`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
    expect(waterRows(owner.userId)).toHaveLength(0);
  });

  it('proposes nothing to a client that cannot show the card', async () => {
    const { token } = await signUp();
    expect(await say(token, 'I drank 500ml of water', false)).toEqual([]);
  });

  it('proposes nothing for ordinary chat', async () => {
    const { token } = await signUp();
    expect(await say(token, 'How much water should I drink?')).toEqual([]);
  });
});

function seedProfile(userId: string, allergies: Allergen[] = []): void {
  getStore().upsert('profiles', {
    id: `profile-${userId}`,
    type: 'wellnessProfile',
    userId,
    weightKg: 70,
    heightCm: 175,
    age: 30,
    sex: 'unspecified',
    goal: 'maintain',
    activityLevel: 'moderate',
    exerciseExperience: 'beginner',
    dietaryPreferences: [],
    allergies,
    equipment: ['none'],
    unitPreference: 'metric',
    updatedAt: new Date().toISOString(),
  } as WellnessProfile & { id: string; type: 'wellnessProfile' });
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

async function mealDrafts(token: string) {
  const res = await request(app).get(`${base}/chat/meal-drafts`).set(authed(token));
  return res.body.drafts as ChatMealDraft[];
}

describe('meal sentences', () => {
  it('opens the meal card without a second credit and logs nothing', async () => {
    const { token, userId } = await signUp();
    await say(token, 'I had chicken breast and broccoli for lunch');

    const [draft] = await mealDrafts(token);
    expect(draft?.mealType).toBe('lunch');
    expect(draft?.ai).toBeNull();
    expect(draft?.items.some((item) => item.status !== 'unmatched')).toBe(true);
    expect(getStore().where<MealLog>('logs', (d) => d.type === 'mealLog' && d.userId === userId)).toEqual([]);

    const plain = await signUp();
    await say(plain.token, 'Tell me about hydration');
    expect(await creditLedger.balance(userId)).toBe(await creditLedger.balance(plain.userId));
  });

  it.each(['I had a meeting', 'I had a run in the park', 'I had a cup of tea with milk'])(
    'opens nothing without a clear food: %s',
    async (text) => {
      const { token } = await signUp();
      await say(token, text);
      expect(await mealDrafts(token)).toEqual([]);
    },
  );

  it('carries declared allergies onto the card', async () => {
    const { token, userId } = await signUp();
    seedProfile(userId, ['milk']);
    await request(app)
      .put(`${base}/me/consents`)
      .set(authed(token))
      .send({ wellnessDataProcessing: true, aiPersonalisation: false, anonymisedAnalytics: false, reminders: false })
      .expect(200);
    await say(token, 'I had skim milk');

    const [draft] = await mealDrafts(token);
    expect(draft?.allergyCheck).toBe('applied');
    expect(draft?.items.flatMap((item) => item.matches.flatMap((m) => m.allergenConflicts))).toContain('milk');
  });
});

describe('training actions', () => {
  /** A date whose served day has exercises, whatever weekday the suite runs on. */
  async function trainingDay(token: string): Promise<{ today: TodayWorkout; localDate: string }> {
    for (let offset = 0; offset < 7; offset += 1) {
      const localDate = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      const res = await request(app).get(`${base}/workouts/today`).query({ localDate }).set(authed(token));
      if (res.body.session) return { today: res.body, localDate };
    }
    throw new Error('no training day in the plan');
  }

  async function userWithPlan() {
    const user = await signUp();
    seedProfile(user.userId);
    await request(app)
      .post(`${base}/plans/generate`)
      .set(authed(user.token))
      .send({ daysPerWeek: 6, focus: 'strength' })
      .expect(201);
    return { ...user, ...(await trainingDay(user.token)) };
  }

  it('swaps only after confirmation', async () => {
    const { token, today, localDate } = await userWithPlan();
    const entry = today.session!.exercises[0]!;
    const name = today.exercises[entry.exerciseId]!.name;
    const [draft] = await say(token, `swap the ${name}`, true, localDate);

    expect(draft?.action).toMatchObject({ kind: 'swapExercise', exerciseId: entry.exerciseId });
    const untouched = await request(app).get(`${base}/workouts/today`).query({ localDate }).set(authed(token));
    expect(untouched.body.session.exercises[0].exerciseId).toBe(entry.exerciseId);

    await request(app).post(`${base}/chat/action-drafts/${draft!.id}/confirm`).set(authed(token)).expect(200);
    const after = await request(app).get(`${base}/workouts/today`).query({ localDate }).set(authed(token));
    expect(after.body.session.exercises.map((e: { exerciseId: string }) => e.exerciseId)).not.toContain(
      entry.exerciseId,
    );
  });

  it("proposes no swap for an exercise that is not in today's session", async () => {
    const { token, localDate } = await userWithPlan();
    expect(await say(token, 'swap the unicycle juggling', true, localDate)).toEqual([]);
  });

  it('puts a failed swap back so it can be retried or dismissed', async () => {
    const { token, today, localDate } = await userWithPlan();
    const entry = today.session!.exercises[0]!;
    const [draft] = await say(token, `swap the ${today.exercises[entry.exerciseId]!.name}`, true, localDate);
    const session = getStore().byId<WorkoutSession>('plans', today.session!.id)!;
    getStore().upsert('plans', { ...session, status: 'completed' });

    await request(app).post(`${base}/chat/action-drafts/${draft!.id}/confirm`).set(authed(token)).expect(409);
    const left = await request(app).get(`${base}/chat/action-drafts`).set(authed(token));
    expect(left.body.drafts.map((d: { id: string }) => d.id)).toEqual([draft!.id]);
  });

  it('rebuilds only after confirmation, keeping the training days', async () => {
    const { token, userId } = await userWithPlan();
    const current = () =>
      getStore().where<TrainingPlan>('plans', (d) => d.type === 'trainingPlan' && d.userId === userId && d.endDate === null);
    const original = current()[0]!.id;

    const [draft] = await say(token, 'rebuild my plan');
    expect(draft?.action).toEqual({ kind: 'rebuildPlan', daysPerWeek: 6, focus: 'general' });
    expect(current().map((p) => p.id)).toEqual([original]);

    await request(app).post(`${base}/chat/action-drafts/${draft!.id}/confirm`).set(authed(token)).expect(200);
    expect(current().map((p) => p.id)).not.toContain(original);
  });

  it('keeps one live rebuild card when asked twice', async () => {
    const { token } = await userWithPlan();
    await say(token, 'rebuild my plan');
    expect(await say(token, 'make me a new plan')).toHaveLength(1);
  });

  it('proposes no rebuild without a profile', async () => {
    const { token } = await signUp();
    expect(await say(token, 'rebuild my plan')).toEqual([]);
  });
});

describe('card lifetime', () => {
  const draftById = (id: string) => getStore().byId<ChatActionDraft>('ai', id)!;

  it('clearing the conversation takes its cards with it', async () => {
    const { token } = await signUp();
    const session = await request(app).post(`${base}/chat/sessions`).set(authed(token)).send({});
    const id = session.body.session?.id ?? session.body.id;
    await request(app)
      .post(`${base}/chat/sessions/${id}/messages`)
      .set(authed(token))
      .send({ content: 'I drank 500ml of water', actionCards: true });
    await request(app).delete(`${base}/chat/sessions/${id}`).set(authed(token)).expect(204);
    const left = await request(app).get(`${base}/chat/action-drafts`).set(authed(token));
    expect(left.body.drafts).toEqual([]);
  });

  it('expires a card after a day', async () => {
    const { token } = await signUp();
    const [draft] = await say(token, 'I drank 500ml of water');
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    getStore().upsert('ai', { ...draftById(draft!.id), createdAt: old });

    const left = await request(app).get(`${base}/chat/action-drafts`).set(authed(token));
    expect(left.body.drafts).toEqual([]);
    const expired = await request(app).post(`${base}/chat/action-drafts/${draft!.id}/confirm`).set(authed(token));
    expect(expired.status).toBe(409);
    expect(JSON.stringify(expired.body)).toContain('expired');
  });

  it('returns a card stranded in confirming by a restart', async () => {
    const { token } = await signUp();
    const [draft] = await say(token, 'I drank 500ml of water');
    const stale = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    getStore().upsert('ai', { ...draftById(draft!.id), status: 'confirming', updatedAt: stale });

    const left = await request(app).get(`${base}/chat/action-drafts`).set(authed(token));
    expect(left.body.drafts.map((d: { id: string }) => d.id)).toEqual([draft!.id]);
  });

  it('returns a stranded card to proposed when its retry fails', async () => {
    const { token } = await signUp();
    const [draft] = await say(token, 'I drank 500ml of water');
    const stale = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    getStore().upsert('ai', {
      ...draftById(draft!.id),
      status: 'confirming',
      updatedAt: stale,
      action: { kind: 'swapExercise', sessionId: 'gone', exerciseId: 'gone', exerciseName: 'Gone' },
    });
    await request(app).post(`${base}/chat/action-drafts/${draft!.id}/confirm`).set(authed(token)).expect(404);
    expect(draftById(draft!.id).status).toBe('proposed');
  });

  it('holds a card that is confirming right now', async () => {
    const { token } = await signUp();
    const [draft] = await say(token, 'I drank 500ml of water');
    getStore().upsert('ai', { ...draftById(draft!.id), status: 'confirming' });
    await request(app).post(`${base}/chat/action-drafts/${draft!.id}/confirm`).set(authed(token)).expect(409);
  });
});
