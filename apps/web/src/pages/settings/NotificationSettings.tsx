/**
 * Notification settings - pixel reference:
 * Figma_aquazerofit_wellness_platform/notification_settings.
 *
 * The master "reminders" consent (PUT /me/consents) decides whether anything
 * is sent; the per-category toggles and times (PUT /me/reminder-prefs) decide
 * what and when. The bot delivers them as Telegram messages.
 *
 * The server's copy is read once and then this screen owns the choices: saves
 * run one after another with the whole set, so the last edit is what the
 * server keeps, and a reply arriving late can never undo a newer edit. Every
 * save carries the device's timezone, which is how the server knows when
 * 08:30 is for this person. Nothing is sent until the server holds a saved
 * set, so the first visit saves what it shows (carrying over choices this
 * device kept in localStorage before the server did, forgotten only once
 * that save succeeds), and a visit from a new timezone saves the new zone.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_REMINDER_PREFS,
  WATER_REMINDER_TIMES,
  WEEKDAYS,
  WEIGH_IN_REMINDER_TIME,
  type ReminderPrefs,
} from '@aquazerofit/shared';
import { useConsents, useMe, useReminderPrefs, useSaveReminderPrefs, useUpdateConsents } from '../../lib/queries';
import { haptic } from '../../lib/telegram';
import { AppHeader } from '../../components/ui/AppHeader';
import { BottomNav } from '../../components/ui/BottomNav';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/fields';
import { useToast } from '../../components/ui/Toast';
import { useFightCamp } from '../../lib/fightRecord';
import { useNudgeSettings, useSetNudgeSettings } from '../../lib/fightCamp';

const LEGACY_STORAGE_KEY = 'azf.notificationPrefs';

/** Choices this device kept before the server did, or null when there are none. */
function legacyPrefs(): ReminderPrefs | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReminderPrefs>;
    // Only the switches and times: the old water frequency has no server
    // meaning, and a stored value of the wrong type would fail validation.
    return {
      meals: { ...DEFAULT_REMINDER_PREFS.meals, ...parsed.meals },
      water: { enabled: parsed.water?.enabled ?? DEFAULT_REMINDER_PREFS.water.enabled },
      workout: { ...DEFAULT_REMINDER_PREFS.workout, ...parsed.workout },
      weighIn: { ...DEFAULT_REMINDER_PREFS.weighIn, ...parsed.weighIn },
    };
  } catch {
    return null;
  }
}

function forgetLegacyPrefs(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // storage unavailable: nothing to forget
  }
}

const deviceTimeZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

export default function NotificationSettings() {
  const toast = useToast();
  const { data: consents, isLoading } = useConsents();
  const updateConsents = useUpdateConsents();
  const saved = useReminderPrefs();
  const saveReminderPrefs = useSaveReminderPrefs();
  const telegramLinked = useMe().data?.telegramLinked;
  /** Null until the server has answered; from then on this screen owns the choices. */
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const masterOn = consents?.reminders ?? false;

  /** Queue a save of the whole set; resolves whether it reached the server. */
  function persist(next: ReminderPrefs): Promise<boolean> {
    const run = saveQueue.current.then(() =>
      saveReminderPrefs.mutateAsync({ ...next, timezone: deviceTimeZone() }).then(
        () => true,
        () => {
          toast.error('Could not save your reminder times. Try again.');
          return false;
        },
      ),
    );
    saveQueue.current = run;
    return run;
  }

  useEffect(() => {
    if (prefs || !saved.isSuccess) return;
    const legacy = legacyPrefs();
    const initial = saved.data ?? legacy ?? DEFAULT_REMINDER_PREFS;
    setPrefs(initial);
    const needsSave = !saved.data || saved.data.timezone !== deviceTimeZone();
    void (needsSave ? persist(initial) : Promise.resolve(true)).then((ok) => ok && forgetLegacyPrefs());
    // Runs once, on the server's first answer; `persist` is a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.isSuccess, saved.data]);

  function update<K extends Exclude<keyof ReminderPrefs, 'timezone'>>(
    key: K,
    patch: Partial<ReminderPrefs[K]>,
  ) {
    if (!prefs) return;
    haptic('selection');
    const next = { ...prefs, [key]: { ...prefs[key], ...patch } };
    setPrefs(next);
    void persist(next);
  }

  async function toggleMaster(value: boolean) {
    if (!consents) return;
    try {
      await updateConsents.mutateAsync({
        wellnessDataProcessing: consents.wellnessDataProcessing,
        aiPersonalisation: consents.aiPersonalisation,
        anonymisedAnalytics: consents.anonymisedAnalytics,
        reminders: value,
      });
      // Turning reminders on is the moment the server needs a current timezone.
      if (value && prefs) void persist(prefs);
      haptic('success');
      toast.success(value ? 'Reminders enabled.' : 'Reminders disabled.');
    } catch {
      haptic('error');
      toast.error('Could not update the reminders consent.');
    }
  }

  return (
    <div className="max-w-md mx-auto min-h-screen relative safe-bottom">
      <AppHeader back title="Notifications" />

      <main className="pt-6 px-container-margin">
        <div className="glass-card mb-6 flex items-start gap-3 border border-primary/20 p-4" role="status">
          <span className="material-symbols-outlined text-primary shrink-0" aria-hidden="true">
            info
          </span>
          <p className="text-sm text-on-surface-variant text-pretty">
            Reminders arrive as Telegram messages from the AquaZeroFit bot, at these times wherever
            you are. Each comes once a day, water twice, and nothing is sent between 9 pm and 8 am.
          </p>
        </div>

        {telegramLinked === false && (
          <div className="glass-card mb-6 flex items-start gap-3 border border-outline-variant/40 p-4" role="note">
            <span className="material-symbols-outlined text-on-surface-variant shrink-0" aria-hidden="true">
              link_off
            </span>
            <p className="text-sm text-on-surface-variant text-pretty">
              This account isn’t linked to Telegram yet, so reminders have nowhere to go.{' '}
              <Link to="/settings" className="text-primary underline underline-offset-2">
                Link Telegram in Settings
              </Link>{' '}
              to receive them.
            </p>
          </div>
        )}

        <section className="mb-6">
          <h2 className="font-heading font-semibold uppercase tracking-wider text-xl text-primary mb-2">
            Preferences
          </h2>
        </section>

        {/* Master consent */}
        <div className="glass-card p-card-padding mb-4">
          {isLoading || !consents ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-secondary shrink-0"
                  aria-hidden="true"
                >
                  <span className="material-symbols-outlined">notifications_active</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading font-semibold text-lg text-on-surface">
                    All reminders
                  </h3>
                </div>
              </div>
              <Switch
                checked={masterOn}
                onChange={(v) => void toggleMaster(v)}
                label="All reminders"
                disabled={updateConsents.isPending}
              />
            </div>
          )}
        </div>

        <CheerMessagesSetting masterOn={masterOn} />

        {/* Granular cards: only once the server's copy is in, so an edit can never overwrite it with defaults */}
        {!prefs ? (
          saved.isError ? (
            <div className="glass-card p-card-padding flex items-center justify-between gap-3" role="alert">
              <p className="text-sm text-on-surface-variant">Could not load your reminder times.</p>
              <button
                type="button"
                onClick={() => void saved.refetch()}
                className="min-h-[44px] px-4 rounded-lg bg-surface-container-low text-primary font-semibold focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="glass-card p-card-padding space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              ))}
            </div>
          )
        ) : (
        <div className={`flex flex-col gap-4 ${masterOn ? '' : 'opacity-50'}`}>
          {/* Meal reminders */}
          <div className="glass-card p-card-padding flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0"
                  aria-hidden="true"
                >
                  <span className="material-symbols-outlined">restaurant</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading font-semibold text-lg text-on-surface">
                    Meal reminders
                  </h3>
                </div>
              </div>
              <Switch
                checked={prefs.meals.enabled}
                onChange={(v) => update('meals', { enabled: v })}
                label="Meal reminders"
                disabled={!masterOn}
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30">
              <label
                htmlFor="meal-time"
                className="text-sm font-medium text-on-surface-variant uppercase"
              >
                Next alert
              </label>
              <TimeField
                id="meal-time"
                label="Meal reminder time"
                value={prefs.meals.time}
                disabled={!masterOn || !prefs.meals.enabled}
                onCommit={(time) => update('meals', { time })}
                className="text-primary focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Water reminders */}
          <div className="glass-card p-card-padding flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-secondary shrink-0"
                  aria-hidden="true"
                >
                  <span className="material-symbols-outlined">water_drop</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading font-semibold text-lg text-on-surface">
                    Water reminders
                  </h3>
                </div>
              </div>
              <Switch
                checked={prefs.water.enabled}
                onChange={(v) => update('water', { enabled: v })}
                label="Water reminders"
                disabled={!masterOn}
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30">
              <span className="text-sm font-medium text-on-surface-variant uppercase">Times</span>
              <span className="text-secondary font-body font-bold p-2 tabular-nums">
                {WATER_REMINDER_TIMES.join(' and ')}
              </span>
            </div>
          </div>

          {/* Workout time */}
          <div className="glass-card p-card-padding flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-12 h-12 rounded-full bg-tertiary/10 flex items-center justify-center text-tertiary shrink-0"
                  aria-hidden="true"
                >
                  <span className="material-symbols-outlined">fitness_center</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading font-semibold text-lg text-on-surface">
                    Workout time
                  </h3>
                </div>
              </div>
              <Switch
                checked={prefs.workout.enabled}
                onChange={(v) => update('workout', { enabled: v })}
                label="Workout time"
                disabled={!masterOn}
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30">
              <label
                htmlFor="workout-time"
                className="text-sm font-medium text-on-surface-variant uppercase"
              >
                Session start
              </label>
              <TimeField
                id="workout-time"
                label="Workout reminder time"
                value={prefs.workout.time}
                disabled={!masterOn || !prefs.workout.enabled}
                onCommit={(time) => update('workout', { time })}
                className="text-tertiary focus:ring-tertiary/50"
              />
            </div>
          </div>

          {/* Weekly weigh-in */}
          <div className="glass-card p-card-padding flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-12 h-12 rounded-full bg-primary-container/10 flex items-center justify-center text-primary-container shrink-0"
                  aria-hidden="true"
                >
                  <span className="material-symbols-outlined">monitoring</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading font-semibold text-lg text-on-surface">
                    Weekly weigh-in
                  </h3>
                </div>
              </div>
              <Switch
                checked={prefs.weighIn.enabled}
                onChange={(v) => update('weighIn', { enabled: v })}
                label="Weekly weigh-in"
                disabled={!masterOn}
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30">
              <label
                htmlFor="weighin-day"
                className="text-sm font-medium text-on-surface-variant uppercase"
              >
                Day, at {WEIGH_IN_REMINDER_TIME}
              </label>
              <select
                id="weighin-day"
                value={prefs.weighIn.day}
                disabled={!masterOn || !prefs.weighIn.enabled}
                onChange={(e) => update('weighIn', { day: e.target.value as ReminderPrefs['weighIn']['day'] })}
                className="bg-surface-container-low text-primary-container font-body font-bold border-none rounded-lg p-2 focus:ring-2 focus:ring-primary/50 cursor-pointer disabled:cursor-not-allowed"
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        )}

        <p className="mt-6 text-xs text-on-surface-variant text-center px-4">
          Your reminder choices are saved to your account and follow you to any device.
        </p>
      </main>

      <BottomNav />
    </div>
  );
}

/**
 * A time input that keeps what is being typed to itself and commits only a
 * complete HH:MM. A segment cleared mid-edit reads as '', which is neither
 * saved nor allowed to snap the field back to the old value.
 */
function TimeField({
  id,
  label,
  value,
  disabled,
  onCommit,
  className,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onCommit: (time: string) => void;
  className: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      id={id}
      type="time"
      aria-label={label}
      value={draft}
      disabled={disabled}
      onChange={(e) => {
        setDraft(e.target.value);
        if (/^\d{2}:\d{2}$/.test(e.target.value) && e.target.value !== value) onCommit(e.target.value);
      }}
      className={`bg-surface-container-low font-body font-bold border-none rounded-lg p-2 focus:ring-2 cursor-pointer disabled:cursor-not-allowed tabular-nums ${className}`}
    />
  );
}

/**
 * Fight Camp cheers by Telegram (AZF-P1 US-D3), under their own cap of one a
 * day, separate from the scheduled reminders above. Shown only
 * while cheers are on for the account. It sends at most one message a day,
 * never 21:00 to 08:00, and only with "All reminders" on.
 */
function CheerMessagesSetting({ masterOn }: { masterOn: boolean }) {
  const available = Boolean(useFightCamp().data?.cheers);
  const settings = useNudgeSettings(available);
  const save = useSetNudgeSettings();
  const toast = useToast();
  if (!available) return null;
  const on = settings.data?.cheer ?? true;
  return (
    <div className="glass-card p-card-padding mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-lg text-on-surface">Cheers from your squad</h3>
          <p className="mt-1 text-sm text-on-surface-variant text-pretty">
            A Telegram message when a squad mate cheers you. At most one a day, never between 9 pm
            and 8 am.
          </p>
        </div>
        <Switch
          checked={masterOn && on}
          onChange={(v) =>
            save.mutate({ cheer: v }, { onError: () => toast.error('Could not save that. Try again.') })
          }
          label="Cheers from your squad"
          disabled={!masterOn || settings.isPending || save.isPending}
        />
      </div>
    </div>
  );
}
