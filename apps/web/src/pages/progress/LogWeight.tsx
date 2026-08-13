/**
 * Log Weight — pixel reference: log_your_weight (bottom-sheet styled page).
 * Big numeric input with kg/lb toggle honouring profile unitPreference
 * (display conversion only — always submits canonical kg), date (max today),
 * optional note with quick chips, recent entries with delta badges, and
 * POST /weight-logs with an Idempotency-Key.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UnitPreference, WeightLog } from '@aquazerofit/shared';
import { api, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/queries';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Chip } from '@/components/ui/Chip';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';

const KG_PER_LB = 0.45359237;
type Unit = 'kg' | 'lb';

/** Server may attach clamp / target-recompute advisories to the response. */
type WeightLogResponse = WeightLog & {
  clamped?: boolean;
  clampReason?: string | null;
  advisory?: string;
};

/** Accept bare arrays and the API's { items } / { logs } envelopes. */
function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of ['items', 'logs']) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA');
}

const QUICK_NOTES = ['Morning fasted', 'Post-workout', 'After meal'];

export default function LogWeight() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [unit, setUnit] = useState<Unit>('kg');
  const [unitTouched, setUnitTouched] = useState(false);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const idemKeyRef = useRef<string>(crypto.randomUUID());

  // Shared ['profile'] cache key: the data-layer hook caches the *unwrapped*
  // profile, so reading /me/profile raw here would cache the { profile }
  // envelope instead and hand every other consumer the wrong shape.
  const profileQuery = useProfile();

  // Honour the profile's unit preference until the user toggles manually.
  useEffect(() => {
    if (!unitTouched && profileQuery.data) {
      const pref: UnitPreference = profileQuery.data.unitPreference;
      setUnit(pref === 'imperial' ? 'lb' : 'kg');
    }
  }, [profileQuery.data, unitTouched]);

  const recentQuery = useQuery({
    queryKey: ['weight', '30d'],
    queryFn: async () =>
      asList<WeightLog>(await api<unknown>('/weight-logs', { query: { range: '30d' } })),
  });

  const recent = useMemo(
    () => [...(recentQuery.data ?? [])].sort((a, b) => (a.localDate < b.localDate ? 1 : -1)),
    [recentQuery.data],
  );
  const latest = recent[0];

  const toKg = (v: number) => (unit === 'lb' ? v * KG_PER_LB : v);
  const display = (kg: number) => (unit === 'lb' ? kg / KG_PER_LB : kg);

  const parsed = Number.parseFloat(value.replace(',', '.'));
  const parsedKg = Number.isFinite(parsed) ? toKg(parsed) : null;
  const deltaVsLast =
    parsedKg !== null && latest ? parsedKg - latest.weightKg : null;

  const mutation = useMutation({
    mutationFn: (payload: { weightKg: number; note?: string; localDate: string }) =>
      api<WeightLogResponse>('/weight-logs', {
        method: 'POST',
        body: payload,
        idempotencyKey: idemKeyRef.current,
      }),
    onSuccess: (res) => {
      const hint =
        res.advisory ??
        (res.clamped && res.clampReason
          ? `Saved. ${res.clampReason}`
          : 'Weight saved — your daily targets have been recomputed.');
      toast.success(hint);
      idemKeyRef.current = crypto.randomUUID();
      void queryClient.invalidateQueries({ queryKey: ['weight'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      void queryClient.invalidateQueries({ queryKey: ['targets'] });
      navigate('/progress');
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : 'Could not save your weigh-in');
    },
  });

  const submit = () => {
    setError(null);
    if (parsedKg === null) {
      setError('Enter your weight first');
      return;
    }
    const kg = Math.round(parsedKg * 10) / 10;
    if (kg < 30 || kg > 300) {
      setError(`Weight must be between ${unit === 'kg' ? '30 and 300 kg' : '66 and 661 lb'}`);
      return;
    }
    if (date > todayLocal()) {
      setError('Date cannot be in the future');
      return;
    }
    mutation.mutate({
      weightKg: kg,
      note: note.trim() ? note.trim() : undefined,
      localDate: date,
    });
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10">
      <AppHeader title="Log Weight" back />

      {/* ---- big numeric input ---- */}
      <section className="mt-6 flex flex-col items-center" aria-label="Weight entry">
        <div className="relative">
          <label className="sr-only" htmlFor="weight-input">
            Weight in {unit === 'kg' ? 'kilograms' : 'pounds'}
          </label>
          <input
            id="weight-input"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="00.0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-56 border-none bg-transparent p-0 text-center font-heading text-[64px] font-semibold text-primary tabular-nums placeholder-primary/20 focus:outline-none focus:ring-0"
          />
          <div
            aria-hidden="true"
            className="mx-auto h-1 w-16 rounded-full bg-secondary shadow-[0_0_15px_rgba(69,223,164,0.5)]"
          />
        </div>

        {/* unit toggle */}
        <div
          role="group"
          aria-label="Unit"
          className="mt-4 flex rounded-full border border-outline-variant bg-surface-container p-1"
        >
          {(['kg', 'lb'] as Unit[]).map((u) => (
            <button
              key={u}
              aria-pressed={unit === u}
              onClick={() => {
                if (u === unit) return;
                // convert the display value so the physical weight is preserved
                if (Number.isFinite(parsed)) {
                  const kg = toKg(parsed);
                  setValue(((u === 'lb' ? kg / KG_PER_LB : kg)).toFixed(1));
                }
                setUnit(u);
                setUnitTouched(true);
              }}
              className={`rounded-full px-5 py-1.5 text-sm font-bold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                unit === u
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface-variant'
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        {deltaVsLast !== null && (
          <div className="mt-4 flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/10 px-4 py-2">
            <span
              className={`material-symbols-outlined text-[20px] ${deltaVsLast <= 0 ? 'text-secondary' : 'text-coral'}`}
              aria-hidden="true"
            >
              {deltaVsLast <= 0 ? 'trending_down' : 'trending_up'}
            </span>
            <span
              className={`text-sm font-medium tabular-nums ${deltaVsLast <= 0 ? 'text-secondary' : 'text-coral'}`}
            >
              {Math.abs(display(deltaVsLast)).toFixed(1)} {unit}{' '}
              {deltaVsLast <= 0 ? 'down' : 'up'} since last entry
            </span>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-error">
            {error}
          </p>
        )}
      </section>

      {/* ---- form fields ---- */}
      <section className="mt-8 space-y-6">
        <div>
          <label
            htmlFor="weight-date"
            className="mb-2 block text-xs font-bold uppercase tracking-widest text-on-surface-variant"
          >
            Date
          </label>
          <div className="flex items-center gap-3 rounded-card border border-outline-variant bg-surface-container p-4 transition-colors focus-within:border-primary">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              calendar_today
            </span>
            <input
              id="weight-date"
              type="date"
              value={date}
              max={todayLocal()}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 appearance-none border-none bg-transparent text-on-surface focus:outline-none focus:ring-0"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="weight-note"
            className="mb-2 block text-xs font-bold uppercase tracking-widest text-on-surface-variant"
          >
            Notes (optional)
          </label>
          <div className="flex items-start gap-3 rounded-card border border-outline-variant bg-surface-container p-4 transition-colors focus-within:border-primary">
            <span className="material-symbols-outlined mt-1 text-primary" aria-hidden="true">
              notes
            </span>
            <textarea
              id="weight-note"
              rows={3}
              maxLength={300}
              placeholder="How are you feeling today?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="flex-1 resize-none border-none bg-transparent text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-0"
            />
          </div>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {QUICK_NOTES.map((q) => (
              <Chip
                key={q}
                label={q}
                active={note.includes(q)}
                onClick={() => setNote((n) => (n.includes(q) ? n : n ? `${n} · ${q}` : q))}
              />
            ))}
          </div>
        </div>

        <PrimaryButton disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? 'Saving…' : 'Save Entry'}
          <span className="material-symbols-outlined" aria-hidden="true">
            arrow_forward
          </span>
        </PrimaryButton>
      </section>

      {/* ---- recent entries ---- */}
      <section className="mt-10" aria-label="Recent entries">
        <h2 className="heading-display mb-4 font-heading text-2xl text-on-surface">
          Recent Entries
        </h2>
        {recentQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-card" />
            <Skeleton className="h-16 w-full rounded-card" />
          </div>
        ) : recentQuery.isError ? (
          <ErrorState
            message="Could not load recent weigh-ins."
            retry={() => void recentQuery.refetch()}
          />
        ) : recent.length === 0 ? (
          <EmptyState
            icon="monitor_weight"
            title="No entries yet"
            body="Your last 30 days of weigh-ins will appear here."
          />
        ) : (
          <ul className="space-y-3">
            {recent.map((log, i) => {
              const prev = recent[i + 1];
              const d = prev ? log.weightKg - prev.weightKg : null;
              return (
                <li key={log.id}>
                  <GlassCard className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-bold text-on-surface tabular-nums">
                        {display(log.weightKg).toFixed(1)} {unit}
                      </p>
                      <p className="text-xs text-on-surface-variant tabular-nums">
                        {new Date(`${log.localDate}T00:00:00`).toLocaleDateString(undefined, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                        {log.note ? ` · ${log.note}` : ''}
                      </p>
                    </div>
                    {d !== null && (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                          d <= 0
                            ? 'bg-secondary/15 text-secondary'
                            : 'bg-tertiary-container/20 text-coral'
                        }`}
                      >
                        {d > 0 ? '+' : ''}
                        {display(d).toFixed(1)} {unit}
                      </span>
                    )}
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
