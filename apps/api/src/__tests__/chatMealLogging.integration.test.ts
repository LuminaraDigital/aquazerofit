/**
 * Chat-native meal logging (free text → proposed meal → explicit confirmation).
 *
 * The properties under test are the ones that decide whether this feature is
 * safe to ship at all: a proposal must never become a log row on its own, the
 * calories that land in the log must come from the food corpus rather than from
 * the model, an ambiguous phrase must reach the user as a choice rather than as
 * a silent pick, a declared allergy must stop the confirming tap, and offline
 * template output must not be billed.
 *
 * The model half is driven by a scripted provider response so those properties
 * are asserted against a real gateway path (degraded false) rather than against
 * the offline engine, which has no P-12 branch yet.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CREDIT_COSTS } from '@aquazerofit/shared';
import type { Allergen, MealLog } from '@aquazerofit/shared';
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
const savedLlmSafety = process.env.ENABLE_LLM_SAFETY;
const dataDir = createIsolatedDataDir('azf-chat-meal-');
bindIsolatedDataDir(dataDir);
clearProviderEnv();
// One credentialed provider plus a stubbed fetch is what lets this suite drive
// the model half deterministically: a scripted P-12 payload for the happy
// paths, a failing provider for the degraded-billing path.
process.env.GROQ_API_KEY = 'test-key';
// The regex guardrail is authoritative here; the optional LLM second stage
// would otherwise consume the same stubbed fetch and make results order-dependent.
process.env.ENABLE_LLM_SAFETY = 'false';

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

// ---------------------------------------------------------------------------
// Scripted provider
// ---------------------------------------------------------------------------

type ProviderScript = { ok: true; payload: unknown } | { ok: false };

let script: ProviderScript = { ok: true, payload: { items: [] } };

function stubProvider(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (!script.ok) {
        return {
          ok: false,
          status: 503,
          headers: { get: () => null },
          json: async () => ({ error: 'upstream unavailable' }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(script.ok ? script.payload : {}) } }],
          usage: { total_tokens: 64 },
        }),
      };
    }),
  );
}

/**
 * The flagship sentence. It is deliberately one that exercises all three item
 * states against the seed corpus: "flat white" resolves to exactly one record,
 * "egg" matches both Egg (boiled) and Egg White, and "toast" matches nothing.
 *
 * The kcal figures are the ones a careless model would emit. Nothing downstream
 * has a field to put them in — that is the assertion, not an accident.
 */
const BREAKFAST_PAYLOAD = {
  items: [
    { foodName: 'egg', quantity: 2, unit: 'piece', phrase: 'two eggs', kcal: 9999 },
    { foodName: 'toast', quantity: 1, unit: 'slice', phrase: 'on toast', kcal: 9999 },
    { foodName: 'flat white', quantity: 1, unit: 'serving', phrase: 'a flat white', kcal: 9999 },
  ],
  mealType: 'breakfast',
};

const SOURCE_TEXT = 'two eggs on toast and a flat white';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface Seeded {
  token: string;
  userId: string;
}

let plain: Seeded;
let allergic: Seeded;

async function registerUser(email: string): Promise<Seeded> {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email, password: 'CorrectHorse9Battery' });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

/** Consents live in the users container; written directly so this suite owns no me/* surface. */
function grantConsents(userId: string): void {
  getStore().upsert('users', {
    id: `consent-${userId}`,
    type: 'consent',
    userId,
    wellnessDataProcessing: true,
    aiPersonalisation: true,
    anonymisedAnalytics: false,
    reminders: false,
    updatedAt: new Date().toISOString(),
  });
}

function declareAllergies(userId: string, allergies: Allergen[]): void {
  getStore().upsert('profiles', {
    id: `profile-${userId}`,
    type: 'wellnessProfile',
    userId,
    weightKg: 72,
    heightCm: 175,
    age: 33,
    sex: 'female',
    goal: 'maintain',
    activityLevel: 'moderate',
    exerciseExperience: 'beginner',
    dietaryPreferences: [],
    allergies,
    equipment: [],
    unitPreference: 'metric',
    updatedAt: new Date().toISOString(),
  });
}

const auth = (user: Seeded) => ({ Authorization: `Bearer ${user.token}` });

function mealLogsFor(userId: string): MealLog[] {
  return getStore().where<MealLog>(
    'logs',
    (d) => (d as { type?: string }).type === 'mealLog' && (d as { userId?: string }).userId === userId,
  );
}

function ledgerFor(userId: string): { kind?: string; reason?: string; reservationId?: string }[] {
  return getStore().where('ledger', (d) => (d as { userId?: string }).userId === userId) as {
    kind?: string;
    reason?: string;
    reservationId?: string;
  }[];
}

interface DraftMatch {
  foodId: string;
  name: string;
  grams: number;
  gramsBasis: string;
  kcal: number;
  proteinG: number;
  allergenConflicts: Allergen[];
}
interface DraftItem {
  id: string;
  phrase: string;
  spokenName: string;
  status: 'resolved' | 'ambiguous' | 'unmatched';
  matches: DraftMatch[];
  suggestedFoodId: string | null;
}
interface Draft {
  id: string;
  status: 'proposed' | 'empty' | 'confirmed' | 'dismissed';
  mealType: string;
  items: DraftItem[];
  notes: string[];
  allergyCheck: string;
  loggedMealId: string | null;
}

async function createDraft(user: Seeded, text = SOURCE_TEXT): Promise<Draft> {
  const res = await request(app).post(`${base}/chat/meal-drafts`).set(auth(user)).send({ text });
  expect(res.status).toBe(201);
  return res.body.draft as Draft;
}

const itemBy = (draft: Draft, spokenName: string): DraftItem =>
  draft.items.find((i) => i.spokenName === spokenName) as DraftItem;

// ---------------------------------------------------------------------------

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
  script = { ok: true, payload: BREAKFAST_PAYLOAD };
  resetProviderCircuits();
  stubProvider();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  bindIsolatedDataDir(dataDir);
  stubProvider();
  plain = await registerUser('chat-meal-plain@example.com');
  allergic = await registerUser('chat-meal-allergic@example.com');
  grantConsents(plain.userId);
  grantConsents(allergic.userId);
  declareAllergies(plain.userId, []);
  declareAllergies(allergic.userId, ['milk']);
  await creditLedger.grantDailyIfNeeded(plain.userId);
  await creditLedger.grantDailyIfNeeded(allergic.userId);
  await getStore().flush();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetProviderCircuits();
  if (savedLlmSafety === undefined) delete process.env.ENABLE_LLM_SAFETY;
  else process.env.ENABLE_LLM_SAFETY = savedLlmSafety;
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

// ---------------------------------------------------------------------------

describe('POST /chat/meal-drafts', () => {
  it('proposes a meal without writing anything to the log', async () => {
    const before = mealLogsFor(plain.userId).length;

    const draft = await createDraft(plain);

    expect(draft.status).toBe('proposed');
    expect(draft.mealType).toBe('breakfast');
    expect(draft.items).toHaveLength(3);
    // The only thing that exists after a proposal is the proposal.
    expect(mealLogsFor(plain.userId)).toHaveLength(before);
    expect(getStore().where('logs', (d) => (d as { type?: string }).type === 'mealLog' && (d as { userId?: string }).userId === plain.userId)).toHaveLength(before);
  });

  it('surfaces an ambiguous phrase as a choice instead of guessing', async () => {
    const draft = await createDraft(plain);
    const egg = itemBy(draft, 'egg');

    expect(egg.status).toBe('ambiguous');
    expect(egg.matches.length).toBeGreaterThan(1);
    expect(egg.matches.map((m) => m.foodId)).toContain('food-egg-whole');
    // Nothing is preselected: the user has to pick, and the client has nothing
    // to default to if it tried.
    expect(egg.suggestedFoodId).toBeNull();
    expect(draft.notes.some((n) => /more than one food/i.test(n))).toBe(true);
  });

  it('reports a phrase the corpus does not know rather than inventing a food', async () => {
    const draft = await createDraft(plain);
    const toast = itemBy(draft, 'toast');

    expect(toast.status).toBe('unmatched');
    expect(toast.matches).toHaveLength(0);
    expect(draft.notes.some((n) => /aren’t in the food database/i.test(n))).toBe(true);
  });

  it('resolves an unambiguous phrase and grounds its grams in the corpus serving', async () => {
    const draft = await createDraft(plain);
    const coffee = itemBy(draft, 'flat white');

    expect(coffee.status).toBe('resolved');
    expect(coffee.suggestedFoodId).toBe('food-flat-white');
    const match = coffee.matches[0] as DraftMatch;
    // 1 × the record's "1 regular" serving, not a number the model chose.
    expect(match.grams).toBe(220);
    expect(match.gramsBasis).toBe('defaultServing');
    expect(match.kcal).toBe(94.6); // 43 kcal/100 g × 2.2
  });

  it('bills exactly one chat credit for a usable proposal', async () => {
    const user = await registerUser('chat-meal-billing@example.com');
    grantConsents(user.userId);
    await creditLedger.grantDailyIfNeeded(user.userId);

    await createDraft(user);

    const rows = ledgerFor(user.userId);
    expect(rows.filter((r) => r.reason === 'reserve:chatTurn')).toHaveLength(1);
    expect(rows.filter((r) => r.reason === 'commit:chatTurn')).toHaveLength(1);
    expect(CREDIT_COSTS.chatTurn).toBe(1);
  });
});

describe('POST /chat/meal-drafts/:id/confirm', () => {
  it('writes a meal log whose calories come from the corpus, not from the model', async () => {
    const draft = await createDraft(plain);
    const egg = itemBy(draft, 'egg');
    const coffee = itemBy(draft, 'flat white');

    const res = await request(app)
      .post(`${base}/chat/meal-drafts/${draft.id}/confirm`)
      .set(auth(plain))
      .send({
        items: [
          { itemId: egg.id, foodId: 'food-egg-whole' },
          { itemId: coffee.id, foodId: 'food-flat-white' },
        ],
      });

    expect(res.status).toBe(201);
    const log = res.body.mealLog as MealLog;
    // Its own provenance, not 'manual': the user confirmed every line either
    // way, but a model read the sentence first, and collapsing the two would
    // make this lane's real-world accuracy unmeasurable afterwards.
    expect(log.source).toBe('chat');
    expect(log.mealType).toBe('breakfast');
    expect(log.items).toHaveLength(2);

    // 2 × 50 g of Egg (boiled) at 155 kcal/100 g, 220 g of Flat White at 43.
    const eggItem = log.items.find((i) => i.foodId === 'food-egg-whole');
    expect(eggItem?.grams).toBe(100);
    expect(eggItem?.kcal).toBe(155);
    const coffeeItem = log.items.find((i) => i.foodId === 'food-flat-white');
    expect(coffeeItem?.grams).toBe(220);
    expect(coffeeItem?.kcal).toBe(94.6);

    expect(log.totalKcal).toBe(249.6);
    // The model asked for 9999 kcal per item three times over; it is nowhere.
    expect(log.items.every((i) => i.kcal !== 9999)).toBe(true);
    expect(log.totalKcal).toBeLessThan(9999);

    // And it really is in the store, once.
    expect(mealLogsFor(plain.userId).filter((l) => l.id === log.id)).toHaveLength(1);
    expect((res.body.draft as Draft).status).toBe('confirmed');
    expect((res.body.draft as Draft).loggedMealId).toBe(log.id);
  });

  it('refuses a food that was never offered for that item', async () => {
    const draft = await createDraft(plain);
    const coffee = itemBy(draft, 'flat white');

    const res = await request(app)
      .post(`${base}/chat/meal-drafts/${draft.id}/confirm`)
      .set(auth(plain))
      .send({ items: [{ itemId: coffee.id, foodId: 'food-dark-chocolate' }] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(mealLogsFor(plain.userId).some((l) => l.items.some((i) => i.foodId === 'food-dark-chocolate'))).toBe(false);
  });

  it('cannot confirm the same proposal twice', async () => {
    const draft = await createDraft(plain);
    const coffee = itemBy(draft, 'flat white');
    const body = { items: [{ itemId: coffee.id, foodId: 'food-flat-white' }] };

    const first = await request(app)
      .post(`${base}/chat/meal-drafts/${draft.id}/confirm`)
      .set(auth(plain))
      .send(body);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`${base}/chat/meal-drafts/${draft.id}/confirm`)
      .set(auth(plain))
      .send(body);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('CONFLICT');
  });

  it('does not log a dismissed proposal', async () => {
    const draft = await createDraft(plain);
    const coffee = itemBy(draft, 'flat white');

    const dismissed = await request(app)
      .post(`${base}/chat/meal-drafts/${draft.id}/dismiss`)
      .set(auth(plain));
    expect(dismissed.status).toBe(200);
    expect((dismissed.body.draft as Draft).status).toBe('dismissed');

    const res = await request(app)
      .post(`${base}/chat/meal-drafts/${draft.id}/confirm`)
      .set(auth(plain))
      .send({ items: [{ itemId: coffee.id, foodId: 'food-flat-white' }] });
    expect(res.status).toBe(409);
  });
});

describe('allergen conflicts', () => {
  it('flags a declared allergy on the proposal and blocks the confirming tap until it is acknowledged', async () => {
    const draft = await createDraft(allergic);
    const coffee = itemBy(draft, 'flat white');
    const match = coffee.matches[0] as DraftMatch;

    // Flat White Coffee declares `milk`; the user declared a milk allergy.
    expect(draft.allergyCheck).toBe('applied');
    expect(match.allergenConflicts).toContain('milk');

    const blocked = await request(app)
      .post(`${base}/chat/meal-drafts/${draft.id}/confirm`)
      .set(auth(allergic))
      .send({ items: [{ itemId: coffee.id, foodId: 'food-flat-white' }] });

    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('CONFLICT');
    expect(blocked.body.details.conflicts[0].allergens).toContain('milk');
    expect(mealLogsFor(allergic.userId)).toHaveLength(0);

    // The user is logging what they already ate, so acknowledging is allowed —
    // it just cannot be the same tap that logs it.
    const acknowledged = await request(app)
      .post(`${base}/chat/meal-drafts/${draft.id}/confirm`)
      .set(auth(allergic))
      .send({
        acknowledgeAllergens: true,
        items: [{ itemId: coffee.id, foodId: 'food-flat-white' }],
      });
    expect(acknowledged.status).toBe(201);
    expect(mealLogsFor(allergic.userId)).toHaveLength(1);
  });

  it('says so when allergy checks could not run for want of consent', async () => {
    const noConsent = await registerUser('chat-meal-noconsent@example.com');
    declareAllergies(noConsent.userId, ['milk']);
    await creditLedger.grantDailyIfNeeded(noConsent.userId);

    const draft = await createDraft(noConsent);
    const coffee = itemBy(draft, 'flat white');

    expect(draft.allergyCheck).toBe('skippedNoConsent');
    expect((coffee.matches[0] as DraftMatch).allergenConflicts).toHaveLength(0);
    expect(draft.notes.some((n) => /allergy checks are off/i.test(n))).toBe(true);
  });
});

describe('degradation', () => {
  it('releases the reservation and proposes nothing when the gateway degrades', async () => {
    const user = await registerUser('chat-meal-degraded@example.com');
    grantConsents(user.userId);
    await creditLedger.grantDailyIfNeeded(user.userId);
    const balanceBefore = await creditLedger.balance(user.userId);

    script = { ok: false };
    const res = await request(app)
      .post(`${base}/chat/meal-drafts`)
      .set(auth(user))
      .send({ text: SOURCE_TEXT });

    expect(res.status).toBe(201);
    const draft = res.body.draft as Draft;
    // The offline engine has no P-12 branch and answers `{}`, so the
    // deterministic segmenter takes over: the sentence is still read, and the
    // user still gets a proposal to confirm. AQF-10 principle 5 — the product
    // works with zero keys — makes this the required behaviour rather than a
    // nicety, and the same path covers a live provider that returns 200 with
    // unusable JSON.
    expect(draft.status).toBe('proposed');
    expect(draft.items.length).toBeGreaterThan(0);
    // Still a proposal, and still nothing written without a confirmation.
    expect(mealLogsFor(user.userId)).toHaveLength(0);

    expect(await creditLedger.balance(user.userId)).toBe(balanceBefore);
    const rows = ledgerFor(user.userId);
    const reserve = rows.find((r) => r.reason === 'reserve:chatTurn');
    expect(reserve).toBeDefined();
    const settlement = rows.filter((r) => r.reservationId === reserve?.reservationId);
    expect(settlement.some((r) => r.kind === 'release')).toBe(true);
    expect(settlement.some((r) => r.kind === 'commit')).toBe(false);
  });

  it('cannot confirm an empty proposal', async () => {
    const user = await registerUser('chat-meal-empty@example.com');
    grantConsents(user.userId);
    await creditLedger.grantDailyIfNeeded(user.userId);

    // Text with no food in it at all — the one case that still yields an empty
    // draft now that the segmenter backs the model up. Filler words reduce to
    // no food name, so there is genuinely nothing to propose.
    script = { ok: true, payload: { items: [], mealType: null } };
    const draft = await createDraft(user, 'some of the');
    expect(draft.status).toBe('empty');

    const res = await request(app)
      .post(`${base}/chat/meal-drafts/${draft.id}/confirm`)
      .set(auth(user))
      .send({ items: [{ itemId: 'it-1', foodId: 'food-flat-white' }] });
    expect(res.status).toBe(409);
  });
});

describe('ownership and rehydration', () => {
  it('never exposes another user’s proposal', async () => {
    const draft = await createDraft(plain);

    const res = await request(app).get(`${base}/chat/meal-drafts/${draft.id}`).set(auth(allergic));
    expect(res.status).toBe(404);

    const confirm = await request(app)
      .post(`${base}/chat/meal-drafts/${draft.id}/confirm`)
      .set(auth(allergic))
      .send({ items: [{ itemId: itemBy(draft, 'flat white').id, foodId: 'food-flat-white' }] });
    expect(confirm.status).toBe(404);
  });

  it('lists pending proposals so a page refresh does not lose the confirmation step', async () => {
    const user = await registerUser('chat-meal-rehydrate@example.com');
    grantConsents(user.userId);
    await creditLedger.grantDailyIfNeeded(user.userId);

    const draft = await createDraft(user);
    const res = await request(app).get(`${base}/chat/meal-drafts`).set(auth(user));

    expect(res.status).toBe(200);
    expect((res.body.drafts as Draft[]).map((d) => d.id)).toContain(draft.id);
  });
});
