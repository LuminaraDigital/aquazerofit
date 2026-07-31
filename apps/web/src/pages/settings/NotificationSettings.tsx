/**
 * Notification settings — pixel reference:
 * Figma_aquazerofit_wellness_platform/notification_settings.
 *
 * The backend stores only the master "reminders" consent (PUT /me/consents);
 * granular per-category toggles and times are device-local (localStorage) and
 * labelled as such.
 */
import { useState } from 'react';
import { useConsents, useUpdateConsents } from '../../lib/queries';
import { haptic } from '../../lib/telegram';
import { AppHeader } from '../../components/ui/AppHeader';
import { BottomNav } from '../../components/ui/BottomNav';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/fields';
import { useToast } from '../../components/ui/Toast';

const STORAGE_KEY = 'azf.notificationPrefs';

interface NotificationPrefs {
  meals: { enabled: boolean; time: string };
  water: { enabled: boolean; frequency: '1h' | '2h' | '4h' };
  workout: { enabled: boolean; time: string };
  weighIn: { enabled: boolean; day: string };
}

const DEFAULT_PREFS: NotificationPrefs = {
  meals: { enabled: true, time: '08:30' },
  water: { enabled: true, frequency: '2h' },
  workout: { enabled: true, time: '17:00' },
  weighIn: { enabled: false, day: 'Monday' },
};

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      meals: { ...DEFAULT_PREFS.meals, ...parsed.meals },
      water: { ...DEFAULT_PREFS.water, ...parsed.water },
      workout: { ...DEFAULT_PREFS.workout, ...parsed.workout },
      weighIn: { ...DEFAULT_PREFS.weighIn, ...parsed.weighIn },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable — prefs simply won't persist
  }
}

export default function NotificationSettings() {
  const toast = useToast();
  const { data: consents, isLoading } = useConsents();
  const updateConsents = useUpdateConsents();
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs);

  const masterOn = consents?.reminders ?? false;

  function update<K extends keyof NotificationPrefs>(
    key: K,
    patch: Partial<NotificationPrefs[K]>,
  ) {
    haptic('selection');
    setPrefs((prev) => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      savePrefs(next);
      return next;
    });
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
        {/* Honest delivery status — preferences persist, delivery ships later */}
        <div className="glass-card mb-6 flex items-start gap-3 border border-primary/20 p-4" role="status">
          <span className="material-symbols-outlined text-primary shrink-0" aria-hidden="true">
            info
          </span>
          <p className="text-sm text-on-surface-variant">
            Reminder delivery is coming soon. Your preferences are saved now and will apply
            automatically once notifications launch.
          </p>
        </div>

        <section className="mb-6">
          <h2 className="font-heading font-semibold uppercase tracking-wider text-xl text-primary mb-2">
            Preferences
          </h2>
          <p className="text-on-surface-variant text-base">
            Stay on track with personalized alerts for your aquatic fitness journey.
          </p>
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
                  <p className="text-sm text-on-surface-variant">
                    Master switch — stored with your consents.
                  </p>
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

        {/* Granular cards */}
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
                  <p className="text-sm text-on-surface-variant">Don't miss a fueling window</p>
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
              <input
                id="meal-time"
                type="time"
                value={prefs.meals.time}
                disabled={!masterOn || !prefs.meals.enabled}
                onChange={(e) => update('meals', { time: e.target.value })}
                className="bg-surface-container-low text-primary font-body font-bold border-none rounded-lg p-2 focus:ring-2 focus:ring-primary/50 cursor-pointer disabled:cursor-not-allowed"
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
                  <p className="text-sm text-on-surface-variant">Stay hydrated and fluid</p>
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
              <label
                htmlFor="water-frequency"
                className="text-sm font-medium text-on-surface-variant uppercase"
              >
                Frequency
              </label>
              <select
                id="water-frequency"
                value={prefs.water.frequency}
                disabled={!masterOn || !prefs.water.enabled}
                onChange={(e) => update('water', { frequency: e.target.value as '1h' | '2h' | '4h' })}
                className="bg-surface-container-low text-secondary font-body font-bold border-none rounded-lg p-2 focus:ring-2 focus:ring-secondary/50 cursor-pointer disabled:cursor-not-allowed"
              >
                <option value="1h">Every 1 hour</option>
                <option value="2h">Every 2 hours</option>
                <option value="4h">Every 4 hours</option>
              </select>
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
                  <p className="text-sm text-on-surface-variant">Your daily performance session</p>
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
              <input
                id="workout-time"
                type="time"
                value={prefs.workout.time}
                disabled={!masterOn || !prefs.workout.enabled}
                onChange={(e) => update('workout', { time: e.target.value })}
                className="bg-surface-container-low text-tertiary font-body font-bold border-none rounded-lg p-2 focus:ring-2 focus:ring-tertiary/50 cursor-pointer disabled:cursor-not-allowed"
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
                  <p className="text-sm text-on-surface-variant">Track your transformation</p>
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
                Day
              </label>
              <select
                id="weighin-day"
                value={prefs.weighIn.day}
                disabled={!masterOn || !prefs.weighIn.enabled}
                onChange={(e) => update('weighIn', { day: e.target.value })}
                className="bg-surface-container-low text-primary-container font-body font-bold border-none rounded-lg p-2 focus:ring-2 focus:ring-primary/50 cursor-pointer disabled:cursor-not-allowed"
              >
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
                  (day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-on-surface-variant/70 text-center px-4">
          Reminder times and per-category choices are stored on this device only. The master
          switch is saved to your account consents.
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
