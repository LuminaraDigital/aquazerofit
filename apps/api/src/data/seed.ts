/**
 * Idempotent seeder (AQF-06 §7): content corpus + demo account. Runs at boot
 * via the store bootstrap (platform/store.getStore) and standalone via
 * `npm run seed`. Every section checks for existing data before writing, so
 * repeated runs are safe. Record counts are logged as evidence.
 *
 * Demo account: demo@aquazero.fit / AquaZeroDemo!2026 — full profile, 14 days
 * of meal/water/weight history, an active 4-day plan and 8 completed workout
 * sessions so every screen renders populated on first open.
 */
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type {
  ConsentState,
  DerivedTargets,
  Food,
  MealLog,
  MealLogItem,
  MealType,
  SessionExercise,
  TrainingPlan,
  User,
  WaterLog,
  WeightLog,
  WellnessProfile,
  WorkoutSession,
  Exercise,
} from '@aquazerofit/shared';
import type { JsonStore } from '../platform/store';
import { computeTargets } from '../modules/me/targets';
import { buildPlan } from '../modules/plans/service';
import { foodsSeed } from './seeds/foods';
import { exercisesSeed } from './seeds/exercises';
import { recipesSeed } from './seeds/recipes';
import { achievementsSeed } from './seeds/achievements';

const DEMO_USER_ID = 'usr-demo';
const DEMO_EMAIL = 'demo@aquazero.fit';
const DEMO_PASSWORD = 'AquaZeroDemo!2026';
const ADMIN_USER_ID = 'usr-admin';
const ADMIN_EMAIL = 'admin@aquazero.fit';

function adminPasswordForSeed(isProduction: boolean): string | undefined {
  const fromEnv = process.env.ADMIN_PASSWORD?.trim();
  if (isProduction) return fromEnv || undefined;
  return fromEnv || undefined; // No default — requires explicit ADMIN_PASSWORD in non-prod
}

async function bcryptHashAsync(password: string, rounds: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const worker = new Worker(`
      const { parentPort } = require('worker_threads');
      const bcrypt = require('bcryptjs');
      
      parentPort.on('message', (msg) => {
        if (msg.type === 'hash') {
          bcrypt.hash(msg.password, msg.rounds)
            .then(hash => parentPort.postMessage({ id: msg.id, hash }))
            .catch(err => parentPort.postMessage({ id: msg.id, error: err.message }));
        }
      });
    `, { eval: true });
    
    const handler = (msg: { id: string; hash?: string; error?: string }) => {
      if (msg.id === id) {
        worker.off('message', handler);
        worker.terminate();
        if (msg.error) reject(new Error(msg.error));
        else resolve(msg.hash!);
      }
    };
    
    worker.on('message', handler);
    worker.postMessage({ id, type: 'hash', password, rounds });
  });
}

// ---------- helpers ----------

function todayLocal(): string {
  // Server-local date: matches what a same-machine demo client will send.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function shiftDate(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const foodBySlug = new Map<string, Food>(foodsSeed.map((f) => [f.id, f]));

/** Deterministic macro lookup+multiply from the seeded corpus (AQF-09 rule 1). */
function item(foodSlug: string, grams: number): MealLogItem {
  const food = foodBySlug.get(`food-${foodSlug}`);
  if (!food) throw new Error(`Seed references unknown food: ${foodSlug}`);
  const k = grams / 100;
  return {
    foodId: food.id,
    name: food.name,
    grams,
    kcal: round1(food.per100g.kcal * k),
    proteinG: round1(food.per100g.proteinG * k),
    carbsG: round1(food.per100g.carbsG * k),
    fatG: round1(food.per100g.fatG * k),
  };
}

function mealTotals(items: MealLogItem[]) {
  return {
    totalKcal: round1(items.reduce((s, i) => s + i.kcal, 0)),
    totalProteinG: round1(items.reduce((s, i) => s + i.proteinG, 0)),
    totalCarbsG: round1(items.reduce((s, i) => s + i.carbsG, 0)),
    totalFatG: round1(items.reduce((s, i) => s + i.fatG, 0)),
  };
}

// Rotating realistic day menus, each near the ~2,050 kcal demo target.
const BREAKFASTS: MealLogItem[][] = [
  [item('oats-rolled', 60), item('milk-skim', 250), item('blueberries', 80), item('honey', 10)],
  [item('egg-whole', 100), item('bread-wholegrain', 80), item('avocado', 50)],
  [item('yoghurt-greek-lowfat', 170), item('granola', 45), item('strawberries', 100)],
  [item('bread-sourdough', 100), item('egg-whole', 100), item('spinach', 30)],
  [item('oats-rolled', 55), item('whey-protein', 30), item('banana', 118), item('milk-almond', 200)],
];
const LUNCHES: MealLogItem[][] = [
  [item('chicken-breast', 150), item('rice-brown-cooked', 200), item('broccoli', 120), item('olive-oil', 10)],
  [item('tuna-canned-springwater', 95), item('bread-wholegrain', 80), item('lettuce-cos', 50), item('mayonnaise', 15)],
  [item('quinoa-cooked', 185), item('chickpeas-canned', 120), item('cheese-feta', 40), item('cucumber', 100), item('olive-oil', 12)],
  [item('turkey-breast', 120), item('tortilla-wrap', 64), item('avocado', 50), item('tomato', 80)],
  [item('caesar-salad-chicken', 320), item('bread-sourdough', 50)],
];
const DINNERS: MealLogItem[][] = [
  [item('salmon-atlantic', 150), item('sweet-potato', 200), item('green-beans', 120), item('olive-oil', 8)],
  [item('beef-mince-lean', 150), item('pasta-wholemeal-cooked', 220), item('tomato', 120), item('cheese-mozzarella', 25)],
  [item('chicken-thigh', 160), item('rice-white-cooked', 200), item('capsicum-red', 100), item('zucchini', 100)],
  [item('barramundi', 150), item('potato', 220), item('asparagus', 90), item('butter', 8)],
  [item('tofu-firm', 180), item('rice-brown-cooked', 200), item('broccoli', 100), item('soy-sauce', 15), item('olive-oil', 8)],
];
const SNACKS: MealLogItem[][] = [
  [item('almonds', 30), item('apple', 180)],
  [item('yoghurt-greek', 170), item('honey', 10)],
  [item('protein-bar', 60)],
  [item('banana', 118), item('peanut-butter', 20)],
  [item('cottage-cheese', 113), item('rice-cakes', 18)],
];

const WATER_PATTERNS: number[][] = [
  [350, 500, 400, 350, 500],
  [250, 400, 600, 350, 300],
  [500, 500, 350, 400],
  [300, 350, 500, 350, 400, 300],
  [400, 600, 500, 450],
];

// ---------- seeding sections ----------

function seedContent(store: JsonStore): Record<string, number> {
  const counts: Record<string, number> = {};
  const sections: { type: string; docs: { id: string }[] }[] = [
    { type: 'food', docs: foodsSeed },
    { type: 'exercise', docs: exercisesSeed },
    { type: 'recipe', docs: recipesSeed },
    { type: 'achievementDefinition', docs: achievementsSeed },
  ];
  for (const section of sections) {
    const existing = store.where<{ id: string; type?: string }>(
      'content',
      (d) => (d as { type?: string }).type === section.type,
    ).length;
    if (existing === 0) {
      for (const doc of section.docs) store.upsert('content', doc);
      counts[section.type] = section.docs.length;
    } else {
      counts[section.type] = existing;
    }
  }
  return counts;
}

function seedAccount(
  store: JsonStore,
  id: string,
  email: string,
  password: string,
  displayName: string,
  role: User['role'],
  tier: User['tier'],
  createdDaysAgo: number,
): Promise<User> {
  const existing = store.byId<User>('users', id);
  // The user doc alone does not make the account usable: the credentials doc
  // is written after an async bcrypt hash in a worker. Short-circuiting on the
  // user doc let a second seed call resolve while the first call's hash was
  // still in flight, so login on the "seeded" account 401'd. Only skip when
  // both halves exist; re-hashing while another hash is in flight is harmless
  // (idempotent upserts, either hash verifies).
  if (existing && store.byId('users', `cred-${id}`)) return Promise.resolve(existing);
  const createdAt =
    existing?.createdAt ?? new Date(Date.now() - createdDaysAgo * 24 * 3600 * 1000).toISOString();
  const user: User = existing ?? {
    id,
    email,
    emailVerified: true,
    role,
    tier,
    displayName,
    createdAt,
    deletionRequestedAt: null,
  };
  if (!existing) store.upsert('users', user);
  return bcryptHashAsync(password, 10).then((hash) => {
    store.upsert('users', {
      id: `cred-${id}`,
      type: 'credentials',
      userId: id,
      passwordHash: hash,
    });
    const consents: ConsentState & { id: string; type: 'consent'; userId: string } = {
      id: `consent-${id}`,
      type: 'consent',
      userId: id,
      wellnessDataProcessing: true,
      aiPersonalisation: true,
      anonymisedAnalytics: true,
      reminders: true,
      updatedAt: createdAt,
    };
    store.upsert('users', consents);
    return user;
  });
}

function seedDemoHistory(store: JsonStore): Record<string, number> {
  const counts: Record<string, number> = { mealLogs: 0, waterLogs: 0, weightLogs: 0, sessions: 0 };

  // Idempotency: any existing demo meal log means history was already seeded.
  const already = store.findOne<MealLog>(
    'logs',
    (d) => (d as MealLog).type === 'mealLog' && (d as MealLog).userId === DEMO_USER_ID,
  );
  if (already) return counts;

  const today = todayLocal();
  const planStart = shiftDate(today, -14);

  // ----- profile + targets (current weight reflects the latest weigh-in) -----
  const profile: WellnessProfile & { id: string; type: 'wellnessProfile' } = {
    id: `profile-${DEMO_USER_ID}`,
    type: 'wellnessProfile',
    userId: DEMO_USER_ID,
    weightKg: 85.6,
    heightCm: 178,
    age: 34,
    sex: 'male',
    goal: 'lose',
    activityLevel: 'moderate',
    exerciseExperience: 'intermediate',
    dietaryPreferences: ['highProtein'],
    allergies: ['shellfish'],
    equipment: ['dumbbells', 'yogaMat', 'resistanceBands'],
    unitPreference: 'metric',
    targetWeightKg: 78,
    updatedAt: new Date(`${planStart}T08:00:00Z`).toISOString(),
  };
  store.upsert('profiles', profile);
  const targets: DerivedTargets & { id: string; type: 'derivedTargets' } = {
    id: `targets-${DEMO_USER_ID}`,
    type: 'derivedTargets',
    ...computeTargets(profile),
  };
  store.upsert('profiles', targets);

  // ----- 14 days of meal / water / weight history -----
  for (let daysAgo = 13; daysAgo >= 0; daysAgo -= 1) {
    const date = shiftDate(today, -daysAgo);
    const v = 13 - daysAgo; // 0 (oldest) .. 13 (today)

    // Weight: 87.2 -> 85.6 with deterministic noise, one canonical entry/day.
    const weight = round1(87.2 - (1.6 * v) / 13 + Math.sin(v * 2.1) * 0.12);
    const weightLog: WeightLog = {
      id: `wl-${DEMO_USER_ID}-${date}`,
      userId: DEMO_USER_ID,
      type: 'weightLog',
      weightKg: weight,
      loggedAt: new Date(`${date}T07:05:00Z`).toISOString(),
      localDate: date,
    };
    store.upsert('logs', weightLog);
    counts.weightLogs! += 1;

    // Meals: breakfast/lunch/dinner daily, snack most days (3–4 per day).
    const menus: { mealType: MealType; items: MealLogItem[]; time: string }[] = [
      { mealType: 'breakfast', items: BREAKFASTS[v % BREAKFASTS.length]!, time: '07:30' },
      { mealType: 'lunch', items: LUNCHES[v % LUNCHES.length]!, time: '12:30' },
      { mealType: 'dinner', items: DINNERS[v % DINNERS.length]!, time: '19:00' },
    ];
    if (v % 3 !== 0) {
      menus.push({ mealType: 'snack', items: SNACKS[v % SNACKS.length]!, time: '15:30' });
    }
    for (const menu of menus) {
      const log: MealLog = {
        id: `ml-demo-${date}-${menu.mealType}`,
        userId: DEMO_USER_ID,
        type: 'mealLog',
        mealType: menu.mealType,
        items: menu.items,
        ...mealTotals(menu.items),
        source: 'manual',
        loggedAt: new Date(`${date}T${menu.time}:00Z`).toISOString(),
        localDate: date,
      };
      store.upsert('logs', log);
      counts.mealLogs! += 1;
    }

    // Water: several one-tap increments per day (~1.8–2.5 L).
    const pattern = WATER_PATTERNS[v % WATER_PATTERNS.length]!;
    pattern.forEach((amountMl, i) => {
      const water: WaterLog = {
        id: `wtr-demo-${date}-${i}`,
        userId: DEMO_USER_ID,
        type: 'waterLog',
        amountMl,
        loggedAt: new Date(`${date}T${String(8 + i * 2).padStart(2, '0')}:15:00Z`).toISOString(),
        localDate: date,
      };
      store.upsert('logs', water);
      counts.waterLogs! += 1;
    });
  }

  // ----- active 4-day plan (started 14 days ago -> today is iteration 3, day 1) -----
  const plan: TrainingPlan = {
    ...buildPlan({
      userId: DEMO_USER_ID,
      profile,
      exercises: exercisesSeed,
      daysPerWeek: 4,
      focus: 'general',
      startDate: planStart,
      now: new Date(`${planStart}T08:00:00Z`),
    }),
    id: 'plan-demo',
  };
  store.upsert('plans', plan);

  // ----- 8 completed workout sessions on the plan's workout days -----
  const kcalPerMin = (focus: string): number =>
    focus.includes('Cardio') ? 10 : focus.includes('Full Body') ? 8 : 7;
  const workoutOrders = new Set(plan.days.filter((d) => !d.isRest).map((d) => d.order));
  for (let diff = 0; diff < 14; diff += 1) {
    const order = (diff % 7) + 1;
    if (!workoutOrders.has(order)) continue;
    const day = plan.days.find((d) => d.order === order)!;
    const date = shiftDate(planStart, diff);
    const duration = 34 + ((diff * 5) % 12); // 34–45 min, deterministic
    const exercises: SessionExercise[] = day.slots.flatMap((slot) =>
      slot.entries.map((entry) => {
        const exercise = exercisesSeed.find((e: Exercise) => e.id === entry.exerciseId);
        return {
          exerciseId: entry.exerciseId,
          name: exercise?.name ?? entry.exerciseId,
          setsPlanned: entry.sets,
          setsCompleted: entry.sets,
          reps: entry.reps,
          restSeconds: entry.restSeconds,
          skipped: false,
        };
      }),
    );
    const session: WorkoutSession = {
      id: `ws-${DEMO_USER_ID}-${date}`,
      userId: DEMO_USER_ID,
      type: 'workoutSession',
      planId: plan.id,
      planDayOrder: order,
      focus: day.focus,
      exercises,
      status: 'completed',
      startedAt: new Date(`${date}T17:30:00Z`).toISOString(),
      completedAt: new Date(`${date}T18:10:00Z`).toISOString(),
      durationMinutes: duration,
      kcalBurned: Math.round(duration * kcalPerMin(day.focus)),
      localDate: date,
    };
    store.upsert('plans', session);
    counts.sessions! += 1;
  }

  return counts;
}

// ---------- entry points ----------

let seededDirs = new Set<string>();
export function resetSeededDirs(): void {
  seededDirs.clear();
}

/** Called by the store bootstrap; safe to call repeatedly. */
export async function seedIfNeeded(store: JsonStore): Promise<void> {
  if (seededDirs.has(store.dataDir)) return;
  seededDirs.add(store.dataDir);

  // Content corpus (foods/exercises/recipes/achievements) is unconditional.
  const contentCounts = seedContent(store);

  // Account seeding is gated: demo + admin only outside production and only
  // unless explicitly disabled via AZF_SEED_DEMO=false. In production the
  // demo account is never created; the admin account is created only when an
  // operator provides ADMIN_PASSWORD (no well-known credentials in prod).
  const isProduction = process.env.NODE_ENV === 'production';
  const seedDemo = process.env.AZF_SEED_DEMO !== 'false' && !isProduction;
  let historyCounts: Record<string, number> = {};
  if (seedDemo) {
    await seedAccount(store, DEMO_USER_ID, DEMO_EMAIL, DEMO_PASSWORD, 'Alex Waters', 'user', 'premium', 15);
    const adminPassword = adminPasswordForSeed(false);
    if (adminPassword) {
      await seedAccount(store, ADMIN_USER_ID, ADMIN_EMAIL, adminPassword, 'AquaZero Admin', 'admin', 'premium', 30);
    }
    historyCounts = seedDemoHistory(store);
  } else if (isProduction) {
    const adminPassword = adminPasswordForSeed(true);
    if (adminPassword) {
      await seedAccount(store, ADMIN_USER_ID, ADMIN_EMAIL, adminPassword, 'AquaZero Admin', 'admin', 'premium', 30);
    }
  }

  const summary = { ...contentCounts, ...historyCounts };
  if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
    // eslint-disable-next-line no-console
    console.log(`[seed] ${JSON.stringify(summary)}`);
  }
}

// Standalone: `npm run seed` (tsx src/data/seed.ts)
const isDirectRun = (() => {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    return import.meta.url.endsWith(argv1.replace(/\\/g, '/').split('/').slice(-2).join('/'));
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  void (async () => {
    const { getStore } = await import('../platform/store');
    const store = getStore(); // bootstrap runs seedIfNeeded
    await store.flush();
    // eslint-disable-next-line no-console
    console.log('[seed] complete', {
      content: store.count('content'),
      users: store.count('users'),
      logs: store.count('logs'),
      plans: store.count('plans'),
      dataDir: store.dataDir,
    });
  })();
}
