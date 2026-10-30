/**
 * A chat sentence becomes a proposal, and only the user's tap becomes a log row.
 * Runs on the offline engine, which is the point: no model is involved.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WaterLog, WeightLog } from '@aquazerofit/shared';
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

async function say(token: string, content: string, actionCards = true) {
  const session = await request(app)
    .post(`${base}/chat/sessions`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  const id = session.body.session?.id ?? session.body.id;
  await request(app)
    .post(`${base}/chat/sessions/${id}/messages`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content, actionCards });
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
