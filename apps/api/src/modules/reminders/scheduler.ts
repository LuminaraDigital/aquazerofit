/**
 * Telegram reminder delivery: the meal, water, workout and weigh-in times a
 * person set in Settings, sent by the bot in their own timezone. A one-minute
 * tick decides what is due.
 *
 * Every condition fails toward silence, as Fight Camp's nudges do:
 *  - no bot, no linked Telegram account, or the `reminders` consent off;
 *  - no timezone, neither saved with the preferences nor on the account;
 *  - quiet hours, the same 21:00 to 08:00 as nudges;
 *  - more than SEND_WINDOW_MIN past the slot, so a server that was down over
 *    a slot never sends it late;
 *  - the day's cap: DAILY_CAP reminders, at most WATER_CAP of them water, so
 *    an hourly water setting cannot crowd out a meal or workout reminder.
 *
 * The cap is separate from Fight Camp's one nudge a day. That cap governs
 * messages nobody asked for; these are times the person chose.
 *
 * Each send is claimed in a per-person day document before the Bot API call,
 * so a restart cannot send the same slot twice, and a send that failed for a
 * passing reason gives the claim back for the next tick inside the window.
 * The document carries the person's id, so account deletion takes it with
 * everything else.
 */
import { DEFAULT_REMINDER_PREFS, type ReminderPrefs, type User } from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { addDays, localDateFor } from '../../platform/dates';
import { getStore } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { inQuietHours, QUIET_HOURS } from '../fightCamp/nudges';
import { hasConsent } from '../me/service';
import { botConfigured, sendBotMessage } from '../payments/telegramBot';
import { savedReminderPrefs } from './prefs';

export const SEND_WINDOW_MIN = 45;
export const DAILY_CAP = 4;
export const WATER_CAP = 2;
const WATER_FROM_HOUR = 9;
const WEIGH_IN_TIME = '09:00';

export type ReminderKind = 'meals' | 'water' | 'workout' | 'weighIn';

export interface DueReminder {
  kind: ReminderKind;
  /** The scheduled local HH:MM, which tells water's several daily slots apart. */
  slot: string;
}

const TEXT: Record<ReminderKind, string> = {
  meals: '🍽 Time to log your meal while it is fresh in your mind.',
  water: '💧 Hydration check: a glass of water keeps your energy steady.',
  workout: '🏋️ Your workout is ready. Even 15 minutes counts today.',
  weighIn: '⚖️ Weekly weigh-in day. The trend matters more than today’s number.',
};

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const within = (now: number, target: number): boolean => now >= target && now < target + SEND_WINDOW_MIN;

/** Minutes past local midnight and the English weekday in `timeZone`, or null for a zone the runtime does not know. */
export function localClock(timeZone: string, at: Date): { minutes: number; weekday: string } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'long',
    }).formatToParts(at);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const minutes = Number(part('hour')) * 60 + Number(part('minute'));
    return Number.isInteger(minutes) ? { minutes, weekday: part('weekday') } : null;
  } catch {
    return null;
  }
}

/** The reminders whose send window is open at this local time. The cap and claims decide what actually sends. */
export function dueReminders(prefs: ReminderPrefs, minutes: number, weekday: string): DueReminder[] {
  const due: DueReminder[] = [];
  if (prefs.meals.enabled && within(minutes, minutesOf(prefs.meals.time))) {
    due.push({ kind: 'meals', slot: prefs.meals.time });
  }
  if (prefs.workout.enabled && within(minutes, minutesOf(prefs.workout.time))) {
    due.push({ kind: 'workout', slot: prefs.workout.time });
  }
  if (prefs.weighIn.enabled && weekday === prefs.weighIn.day && within(minutes, minutesOf(WEIGH_IN_TIME))) {
    due.push({ kind: 'weighIn', slot: WEIGH_IN_TIME });
  }
  if (prefs.water.enabled) {
    const step = Number.parseInt(prefs.water.frequency, 10);
    for (let hour = WATER_FROM_HOUR; hour < QUIET_HOURS.from; hour += step) {
      if (within(minutes, hour * 60)) {
        due.push({ kind: 'water', slot: `${String(hour).padStart(2, '0')}:00` });
        break;
      }
    }
  }
  return due;
}

interface ReminderDayDoc {
  id: string;
  type: 'reminderDay';
  userId: string;
  localDate: string;
  /** `kind@HH:MM` for every slot claimed today. */
  claimed: string[];
}

const dayId = (userId: string, localDate: string): string => `remday-${userId}-${localDate}`;

/** Claim `key` in today's document unless the cap is reached or it is already claimed. Synchronous, so two ticks cannot both win. */
function claim(userId: string, localDate: string, kind: ReminderKind, key: string): boolean {
  const store = getStore();
  const day = store.byId<ReminderDayDoc>('users', dayId(userId, localDate)) ?? {
    id: dayId(userId, localDate),
    type: 'reminderDay' as const,
    userId,
    localDate,
    claimed: [],
  };
  if (day.claimed.includes(key) || day.claimed.length >= DAILY_CAP) return false;
  if (kind === 'water' && day.claimed.filter((k) => k.startsWith('water@')).length >= WATER_CAP) return false;
  store.upsert('users', { ...day, claimed: [...day.claimed, key] });
  return true;
}

function release(userId: string, localDate: string, key: string): void {
  const store = getStore();
  const day = store.byId<ReminderDayDoc>('users', dayId(userId, localDate));
  if (day) store.upsert('users', { ...day, claimed: day.claimed.filter((k) => k !== key) });
}

const isAccount = (d: object): boolean => {
  const type = (d as { type?: string }).type;
  return type === undefined || type === 'user';
};

/** Send every reminder that is due now. Resolves the number sent; one person's failure never stops the rest. */
export async function runReminderTick(now: Date = new Date()): Promise<number> {
  if (!botConfigured()) return 0;
  const store = getStore();
  const people = store.where<User>(
    'users',
    (d) => isAccount(d) && typeof d.tgId === 'number' && !d.deletionRequestedAt,
  );
  let sent = 0;
  for (const user of people) {
    if (!hasConsent(user.id, 'reminders')) continue;
    const prefs = savedReminderPrefs(user.id) ?? DEFAULT_REMINDER_PREFS;
    const timeZone = prefs.timezone ?? user.timezone;
    const clock = timeZone ? localClock(timeZone, now) : null;
    if (!timeZone || !clock || inQuietHours(Math.floor(clock.minutes / 60))) continue;
    const localDate = localDateFor(timeZone, now);
    for (const due of dueReminders(prefs, clock.minutes, clock.weekday)) {
      const key = `${due.kind}@${due.slot}`;
      if (!claim(user.id, localDate, due.kind, key)) continue;
      const result = await sendBotMessage(user.tgId!, TEXT[due.kind], {
        parseMode: 'plain',
        buttons: [{ text: 'Open AquaZeroFit', webAppUrl: config.telegramMiniAppUrl }],
      }).catch(() => ({ ok: false as const, error: 'threw' }));
      if (result.ok) {
        sent += 1;
        logEvent('reminder_sent', { kind: due.kind });
      } else {
        // A person who blocked the bot (Forbidden) or a chat that is gone
        // (Bad Request) will fail every minute of the window; only network
        // and rate-limit failures are worth another try.
        if (!/^(Forbidden|Bad Request)/.test(result.error)) release(user.id, localDate, key);
        logEvent('reminder_failed', { kind: due.kind });
      }
    }
  }
  // Day documents only matter for the day they count; keep two days' slack
  // for zones ahead of UTC.
  if (now.getUTCMinutes() === 0) {
    const cutoff = addDays(now.toISOString().slice(0, 10), -2);
    store.deleteWhere<ReminderDayDoc>('users', (d) => d.type === 'reminderDay' && d.localDate < cutoff);
  }
  return sent;
}

/** Tick once a minute. A tick still sending when the next is due is left to finish rather than overlapped. */
export function startReminderScheduler(): void {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    runReminderTick()
      .catch((err) => console.error('[reminders] tick failed', err))
      .finally(() => {
        running = false;
      });
  }, 60_000).unref();
}
