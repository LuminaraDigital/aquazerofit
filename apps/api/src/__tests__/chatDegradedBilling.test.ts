/**
 * Chat billing when the gateway degrades to offline templates after real
 * provider failure: credits must be released, not committed.
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { CREDIT_COSTS } from '@aquazerofit/shared';
import { creditLedger } from '../modules/ai/creditLedger';
import { resetProviderCircuits } from '../modules/ai/gateway';
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
const dataDir = createIsolatedDataDir('azf-chat-degraded-');
bindIsolatedDataDir(dataDir);
clearProviderEnv();
process.env.GROQ_API_KEY = 'test-key';

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

let token = '';
let userId = '';
let sessionId = '';

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
});

beforeAll(async () => {
  bindIsolatedDataDir(dataDir);
  resetProviderCircuits();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: async () => ({ error: 'upstream unavailable' }),
    })),
  );

  const reg = await request(app)
    .post(`${base}/auth/register`)
    .send({ email: 'chat-degraded@example.com', password: 'CorrectHorse9Battery' });
  expect(reg.status).toBe(201);
  token = reg.body.accessToken as string;
  userId = reg.body.user.id as string;

  const session = await request(app).post(`${base}/chat/sessions`).set(auth()).send({});
  expect(session.status).toBe(201);
  sessionId = session.body.session.id as string;
  await getStore().flush();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetProviderCircuits();
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

it('releases the chat reservation when meta.degraded is true', async () => {
  await creditLedger.grantDailyIfNeeded(userId);
  const before = await creditLedger.balance(userId);

  const res = await request(app)
    .post(`${base}/chat/sessions/${sessionId}/messages`)
    .set(auth())
    .send({ content: 'How am I tracking today?' });
  expect(res.status).toBe(200);
  expect(res.text).toContain('"type":"done"');

  // The invariant, from CONTRIBUTING.md: a turn answered by the offline
  // fallback after real providers failed is NOT charged for. The balance must
  // come back to where it started — reserved, then released, net zero.
  //
  // This assertion previously read `toBe(before - 1)`, with a comment saying
  // to "update test to match actual behavior". It was matching a defect: the
  // streaming lane read the gateway's result from `iterator._finalResult`, a
  // property nothing ever set, so `meta.degraded` was always false and every
  // degraded turn was billed. A test rewritten to accept a broken invariant
  // is worse than no test, because the suite then certifies the breakage.
  const after = await creditLedger.balance(userId);
  expect(after).toBe(before);

  const ledger = getStore().where('ledger', (d) => (d as { userId?: string }).userId === userId);
  const reserveTx = ledger.find((d) => (d as { reason?: string }).reason === 'reserve:chatTurn');
  expect(reserveTx).toBeDefined();
  const reservationId = (reserveTx as { reservationId?: string }).reservationId;
  expect(reservationId).toBeTypeOf('string');

  const settlement = ledger.filter((d) => (d as { reservationId?: string }).reservationId === reservationId);
  expect(settlement.some((d) => (d as { kind?: string }).kind === 'release')).toBe(true);
  // Exactly one settlement, and it is the release. A commit alongside it would
  // mean the user was charged for degraded output.
  expect(settlement.some((d) => (d as { kind?: string }).kind === 'commit')).toBe(false);
  expect(CREDIT_COSTS.chatTurn).toBe(1);
});

it('records the real provider on the persisted message, not "unknown"', async () => {
  // The same discarded return value carried provider/model provenance. Every
  // stored assistant message on this lane recorded 'unknown', which made the
  // per-message AI provenance record useless exactly where volume is highest.
  const messages = getStore().where(
    'ai',
    (d) =>
      (d as { type?: string }).type === 'chatMessage' &&
      (d as { userId?: string }).userId === userId &&
      (d as { role?: string }).role === 'assistant',
  );
  expect(messages.length).toBeGreaterThan(0);
  for (const message of messages) {
    const ai = (message as { ai?: { provider?: string } }).ai;
    expect(ai?.provider).not.toBe('unknown');
  }
});
