/**
 * Telegram reminder delivery: preferences over HTTP, and the scheduler tick
 * against a stubbed Bot API and the in-memory engage repository. Ticks take an
 * explicit clock, so no timers are faked. 2026-11-02 is a Monday.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REMINDER_PREFS, type ReminderPrefs } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { getStore } = await import('../platform/store');
const { consentId, purgeUser, saveConsents } = await import('../modules/me/service');
const { engageRepo } = await import('../modules/fightCamp/repo');
const { saveReminderPrefs } = await import('../modules/reminders/prefs');
const { dueReminders, runReminderTick } = await import('../modules/reminders/scheduler');

let h: FightCampHarness;
const DAY = '2026-11-02';
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00.000Z`);

let botAnswer: { ok: boolean; description?: string } = { ok: true };
const sent: Array<Record<string, unknown>> = [];

beforeAll(async () => {
  h = await fightCampHarness('reminders');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as Record<string, unknown>);
      return {
        json: async () =>
          botAnswer.ok ? { ok: true, result: true } : { ok: false, description: botAnswer.description ?? 'Too Many Requests' },
      };
    }),
  );
  process.env.TELEGRAM_BOT_TOKEN = '123456:reminders-integration';
});

afterEach(() => {
  sent.length = 0;
  botAnswer = { ok: true };
});

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
  await h.cleanup();
});

const prefs = (patch: Partial<ReminderPrefs>): ReminderPrefs => ({
  meals: { enabled: false, time: '08:30' },
  water: { enabled: false },
  workout: { enabled: false, time: '17:00' },
  weighIn: { enabled: false, day: 'Monday' },
  timezone: 'UTC',
  ...patch,
});

/** A Telegram-linked person, with the reminders consent on unless told otherwise. */
async function linked(opts: { reminders?: boolean } = {}): Promise<Person & { tgId: number }> {
  const person = await h.register(`Rem${Math.random().toString(36).slice(2, 7)}`);
  const tgId = 8_100_000 + Math.floor(Math.random() * 100_000);
  const user = getStore().byId<{ id: string }>('users', person.userId)!;
  getStore().upsert('users', { ...user, tgId });
  if (opts.reminders !== false) {
    saveConsents(person.userId, {
      wellnessDataProcessing: true,
      aiPersonalisation: false,
      anonymisedAnalytics: false,
      reminders: true,
    });
  }
  return { ...person, tgId };
}

const to = (tgId: number) => sent.filter((m) => m.chat_id === tgId);
const kindsTo = (tgId: number) =>
  to(tgId).map((m) => {
    const text = String(m.text);
    if (/meal/.test(text)) return 'meals';
    if (/Hydration/.test(text)) return 'water';
    if (/workout/.test(text)) return 'workout';
    return 'weighIn';
  });
const claimsOf = async (userId: string) => (await engageRepo().exportUser(userId)).reminders;

describe('dueReminders', () => {
  it('opens each slot for 45 minutes, weigh-in only on its day at 09:00, water at 11:00 and 15:00', () => {
    const p = prefs({
      meals: { enabled: true, time: '08:30' },
      weighIn: { enabled: true, day: 'Monday' },
      water: { enabled: true },
    });
    expect(dueReminders(p, 8 * 60 + 29, 'Monday')).toEqual([]);
    expect(dueReminders(p, 9 * 60 + 14, 'Tuesday')).toEqual([{ kind: 'meals', key: 'meals' }]);
    expect(dueReminders(p, 9 * 60 + 15, 'Tuesday')).toEqual([]);
    expect(dueReminders(p, 9 * 60 + 15, 'Monday')).toEqual([{ kind: 'weighIn', key: 'weighIn' }]);
    const water = Array.from({ length: 24 }, (_, hour) => dueReminders(p, hour * 60, 'Tuesday'))
      .flat()
      .filter((d) => d.kind === 'water')
      .map((d) => d.key);
    expect(water).toEqual(['water@11:00', 'water@15:00']);
  });
});

describe('/me/reminder-prefs', () => {
  it('is null until saved, validates, and round-trips into the export', async () => {
    const person = await h.register('PrefsOwner');
    const get = () => request(h.app).get(`${h.base}/me/reminder-prefs`).set(person.auth());
    expect((await get()).body).toEqual({ reminderPrefs: null });

    const bad = await request(h.app)
      .put(`${h.base}/me/reminder-prefs`)
      .set(person.auth())
      .send({ ...DEFAULT_REMINDER_PREFS, meals: { enabled: true, time: '25:00' } });
    expect(bad.status).toBe(400);

    const body = { ...DEFAULT_REMINDER_PREFS, timezone: 'Europe/London' };
    const put = await request(h.app).put(`${h.base}/me/reminder-prefs`).set(person.auth()).send(body);
    expect(put.status).toBe(200);
    expect((await get()).body.reminderPrefs).toMatchObject(body);

    const exported = await request(h.app).get(`${h.base}/me/export`).set(person.auth());
    expect(exported.body.reminderPrefs).toMatchObject(body);
  });
});

describe('runReminderTick', () => {
  it('sends a due reminder once, with a button into the Mini App, even when the time is then changed', async () => {
    const p = await linked();
    saveReminderPrefs(p.userId, prefs({ meals: { enabled: true, time: '10:00' } }));
    await runReminderTick(at('10:05'));
    await runReminderTick(at('10:20'));
    saveReminderPrefs(p.userId, prefs({ meals: { enabled: true, time: '10:30' } }));
    await runReminderTick(at('10:30'));
    expect(to(p.tgId)).toHaveLength(1);
    expect(to(p.tgId)[0]).toMatchObject({
      text: expect.stringMatching(/log your meal/),
      reply_markup: { inline_keyboard: [[{ text: 'Open AquaZeroFit', web_app: { url: expect.any(String) } }]] },
    });
  });

  it('claims once when two ticks overlap, as two revisions do during a rollout', async () => {
    const p = await linked();
    saveReminderPrefs(p.userId, prefs({ workout: { enabled: true, time: '10:00' } }));
    await Promise.all([runReminderTick(at('10:00')), runReminderTick(at('10:00'))]);
    expect(to(p.tgId)).toHaveLength(1);
  });

  it('keys the day by the saved zone, not UTC', async () => {
    const p = await linked();
    // 10:00 in Sydney (UTC+11 in November) is 23:00 UTC the day before.
    saveReminderPrefs(p.userId, prefs({ workout: { enabled: true, time: '10:00' }, timezone: 'Australia/Sydney' }));
    await runReminderTick(new Date('2026-11-01T23:00:00.000Z'));
    expect(to(p.tgId)).toHaveLength(1);
    expect((await claimsOf(p.userId)).map((c) => c.localDate)).toEqual(['2026-11-02']);
  });

  it('sends every kind once on a weigh-in day, so water cannot crowd out the workout', async () => {
    const p = await linked();
    saveReminderPrefs(
      p.userId,
      prefs({
        meals: { enabled: true, time: '08:30' },
        water: { enabled: true },
        workout: { enabled: true, time: '17:00' },
        weighIn: { enabled: true, day: 'Monday' },
      }),
    );
    for (let minute = 8 * 60; minute < 21 * 60; minute += 5) {
      const hhmm = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      await runReminderTick(at(hhmm));
    }
    expect(kindsTo(p.tgId)).toEqual(['meals', 'weighIn', 'water', 'water', 'workout']);
  });

  it('stays silent with no saved prefs, without consent, without a zone, and in quiet hours', async () => {
    const unsaved = await linked();
    const noConsent = await linked({ reminders: false });
    const noZone = await linked();
    const night = await linked();
    saveReminderPrefs(noConsent.userId, prefs({ meals: { enabled: true, time: '10:00' } }));
    saveReminderPrefs(noZone.userId, { ...prefs({ meals: { enabled: true, time: '10:00' } }), timezone: undefined });
    saveReminderPrefs(night.userId, prefs({ meals: { enabled: true, time: '07:30' } }));
    for (const hhmm of ['07:30', '07:59', '10:00']) await runReminderTick(at(hhmm));
    expect([unsaved, noConsent, noZone, night].flatMap((p) => to(p.tgId))).toEqual([]);
    // Reading the consent must not create one for someone who never chose.
    expect(getStore().byId('users', consentId(noConsent.userId))).toBeUndefined();
  });

  it('does not retry a failed send inside the window', async () => {
    const p = await linked();
    saveReminderPrefs(p.userId, prefs({ workout: { enabled: true, time: '10:00' } }));
    botAnswer = { ok: false, description: 'Forbidden: bot was blocked by the user' };
    for (const hhmm of ['10:00', '10:01', '10:30']) await runReminderTick(at(hhmm));
    expect(to(p.tgId)).toHaveLength(1);
  });

  it('skips an account flagged for deletion and leaves nothing behind once it is erased', async () => {
    const flagged = await linked();
    saveReminderPrefs(flagged.userId, prefs({ meals: { enabled: true, time: '10:00' } }));
    const user = getStore().byId<{ id: string }>('users', flagged.userId)!;
    getStore().upsert('users', { ...user, deletionRequestedAt: '2026-11-01T00:00:00.000Z' });
    await runReminderTick(at('10:00'));
    expect(to(flagged.tgId)).toEqual([]);

    const p = await linked();
    saveReminderPrefs(p.userId, prefs({ meals: { enabled: true, time: '10:00' } }));
    await runReminderTick(at('10:00'));
    expect(await claimsOf(p.userId)).toHaveLength(1);
    await purgeUser(p.userId);
    expect(await claimsOf(p.userId)).toEqual([]);
    expect(getStore().where<{ id: string; userId?: string }>('users', (d) => d.userId === p.userId)).toEqual([]);
  });
});
