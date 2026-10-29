/**
 * Telegram reminder delivery: preferences over HTTP, and the scheduler tick
 * against a stubbed Bot API. Ticks take an explicit clock, so no timers are
 * faked. 2026-11-02 is a Monday.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REMINDER_PREFS, type ReminderPrefs } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { getStore } = await import('../platform/store');
const { purgeUser, saveConsents } = await import('../modules/me/service');
const { saveReminderPrefs } = await import('../modules/reminders/prefs');
const { DAILY_CAP, WATER_CAP, dueReminders, runReminderTick } = await import('../modules/reminders/scheduler');

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
  water: { enabled: false, frequency: '2h' },
  workout: { enabled: false, time: '17:00' },
  weighIn: { enabled: false, day: 'Monday' },
  ...patch,
});

/** A Telegram-linked person with the reminders consent on (or off). */
async function linked(opts: { timezone?: string; reminders?: boolean } = {}): Promise<Person & { tgId: number }> {
  const person = await h.register(`Rem${Math.random().toString(36).slice(2, 7)}`);
  const tgId = 8_100_000 + Math.floor(Math.random() * 100_000);
  const user = getStore().byId<{ id: string }>('users', person.userId)!;
  getStore().upsert('users', { ...user, tgId, timezone: opts.timezone ?? 'UTC' });
  saveConsents(person.userId, {
    wellnessDataProcessing: true,
    aiPersonalisation: false,
    anonymisedAnalytics: false,
    reminders: opts.reminders ?? true,
  });
  return { ...person, tgId };
}

const to = (tgId: number) => sent.filter((m) => m.chat_id === tgId);

describe('dueReminders', () => {
  it('opens each slot for 45 minutes and weigh-in only on its day', () => {
    const p = prefs({ meals: { enabled: true, time: '08:30' }, weighIn: { enabled: true, day: 'Monday' } });
    expect(dueReminders(p, 8 * 60 + 29, 'Monday')).toEqual([]);
    expect(dueReminders(p, 8 * 60 + 30, 'Tuesday')).toEqual([{ kind: 'meals', slot: '08:30' }]);
    expect(dueReminders(p, 9 * 60 + 14, 'Tuesday')).toEqual([{ kind: 'meals', slot: '08:30' }]);
    expect(dueReminders(p, 9 * 60 + 15, 'Tuesday')).toEqual([]);
    expect(dueReminders(p, 9 * 60 + 15, 'Monday')).toEqual([{ kind: 'weighIn', slot: '09:00' }]);
  });

  it('spaces water by its frequency from 09:00 and stops before quiet hours', () => {
    const p = prefs({ water: { enabled: true, frequency: '4h' } });
    const slots = Array.from({ length: 24 }, (_, hour) => dueReminders(p, hour * 60, 'Monday'))
      .flat()
      .map((d) => d.slot);
    expect(slots).toEqual(['09:00', '13:00', '17:00']);
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
  it('sends a due reminder once, with a button into the Mini App', async () => {
    const p = await linked();
    saveReminderPrefs(p.userId, prefs({ meals: { enabled: true, time: '10:00' } }));
    await runReminderTick(at('10:05'));
    await runReminderTick(at('10:20'));
    expect(to(p.tgId)).toHaveLength(1);
    expect(to(p.tgId)[0]).toMatchObject({
      text: expect.stringMatching(/log your meal/),
      reply_markup: { inline_keyboard: [[{ text: 'Open AquaZeroFit', web_app: { url: expect.any(String) } }]] },
    });
  });

  it('uses the zone saved with the preferences over the account zone', async () => {
    const p = await linked({ timezone: 'UTC' });
    // 10:00 in Sydney (UTC+11 in November) is 23:00 UTC the day before.
    saveReminderPrefs(p.userId, { ...prefs({ workout: { enabled: true, time: '10:00' } }), timezone: 'Australia/Sydney' });
    await runReminderTick(new Date('2026-11-01T23:00:00.000Z'));
    expect(to(p.tgId)).toHaveLength(1);
  });

  it('stays silent without consent, without a timezone, and in quiet hours', async () => {
    const noConsent = await linked({ reminders: false });
    const noZone = await linked({ timezone: '' });
    const night = await linked();
    for (const p of [noConsent, noZone]) saveReminderPrefs(p.userId, prefs({ meals: { enabled: true, time: '10:00' } }));
    saveReminderPrefs(night.userId, prefs({ meals: { enabled: true, time: '22:30' } }));
    await runReminderTick(at('10:00'));
    await runReminderTick(at('22:30'));
    expect([...to(noConsent.tgId), ...to(noZone.tgId), ...to(night.tgId)]).toEqual([]);
  });

  it('gives a failed send back so the next tick in the window retries it', async () => {
    const p = await linked();
    saveReminderPrefs(p.userId, prefs({ workout: { enabled: true, time: '10:00' } }));
    botAnswer = { ok: false };
    await runReminderTick(at('10:00'));
    botAnswer = { ok: true };
    await runReminderTick(at('10:01'));
    await runReminderTick(at('10:02'));
    expect(to(p.tgId)).toHaveLength(2); // the failed attempt, then one delivery
  });

  it('does not retry someone who blocked the bot', async () => {
    const p = await linked();
    saveReminderPrefs(p.userId, prefs({ workout: { enabled: true, time: '10:00' } }));
    botAnswer = { ok: false, description: 'Forbidden: bot was blocked by the user' };
    for (const hhmm of ['10:00', '10:01', '10:02']) await runReminderTick(at(hhmm));
    expect(to(p.tgId)).toHaveLength(1);
  });

  it(`caps water at ${WATER_CAP} and the day at ${DAILY_CAP}`, async () => {
    const thirsty = await linked();
    saveReminderPrefs(thirsty.userId, prefs({ water: { enabled: true, frequency: '1h' } }));
    for (const hhmm of ['09:00', '10:00', '11:00', '12:00']) await runReminderTick(at(hhmm));
    expect(to(thirsty.tgId)).toHaveLength(WATER_CAP);

    const busy = await linked();
    saveReminderPrefs(
      busy.userId,
      prefs({
        meals: { enabled: true, time: '09:00' },
        workout: { enabled: true, time: '09:10' },
        weighIn: { enabled: true, day: 'Monday' },
        water: { enabled: true, frequency: '1h' },
      }),
    );
    for (const hhmm of ['09:00', '09:10', '10:00', '11:00']) await runReminderTick(at(hhmm));
    expect(to(busy.tgId)).toHaveLength(DAILY_CAP);
  });

  it('leaves nothing behind when the account is erased', async () => {
    const p = await linked();
    saveReminderPrefs(p.userId, prefs({ meals: { enabled: true, time: '10:00' } }));
    await runReminderTick(at('10:00'));
    await purgeUser(p.userId);
    expect(getStore().where<{ id: string; userId?: string }>('users', (d) => d.userId === p.userId)).toEqual([]);
  });
});
