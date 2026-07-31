/**
 * Workout Detail + guided session — pixel reference: full_body_strength_details.
 * Session view for GET /workouts/today (the :id route param is the session id;
 * today's session is always the source of truth). Renders the optional
 * pre-computed `resolved` read model verbatim when present (weight per set,
 * RiR targets, rest timers) and falls back to the legacy rendering when it is
 * absent. Includes per-exercise swap, a guided stepper with rest countdown
 * ring, per-set actuals logging (weight/reps/RiR → setLogs), editable summary
 * sheet and POST /workouts/:id/complete with celebration + achievement toast.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Exercise,
  ProgressSummary,
  SessionExercise,
  SetLog,
  WorkoutSession,
} from '@aquazerofit/shared';
import { api, ApiError } from '@/lib/api';
import {
  unwrapResolved,
  type CompleteExerciseInput,
  type ResolvedToday,
  type ResolvedTodayEntry,
} from '@/lib/contracts';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { RingProgress } from '@/components/ui/RingProgress';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { BottomSheet } from './BottomSheet';
import { asList, estimateKcal, estimateMinutes, ExerciseImage, unwrapSession } from './WorkoutLibrary';

type Phase = 'overview' | 'work' | 'rest' | 'summary';

interface TodayPayload {
  session: WorkoutSession | null;
  resolved: ResolvedToday | null;
}

async function fetchToday(): Promise<TodayPayload> {
  try {
    const data = await api<unknown>('/workouts/today');
    return { session: unwrapSession(data), resolved: unwrapResolved(data) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { session: null, resolved: null };
    throw e;
  }
}

function localDateToday(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** "3 × 8–10" style rep prescription from a resolved entry. */
function repScheme(entry: ResolvedTodayEntry): string {
  const reps = entry.repsMax != null && entry.repsMax !== entry.reps
    ? `${entry.reps}–${entry.repsMax}`
    : String(entry.reps);
  return `${entry.sets} × ${reps}`;
}

export default function WorkoutDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  // The :id route param is the session id; we always render today's session
  // (if the id mismatches we still show today's — noted deviation per brief).
  const sessionQuery = useQuery({ queryKey: ['workout', 'today'], queryFn: fetchToday });
  const session = sessionQuery.data?.session ?? null;
  const resolved = sessionQuery.data?.resolved ?? null;
  const sessionId = session?.id ?? id ?? '';

  const resolvedByExerciseId = useMemo(() => {
    const map = new Map<string, ResolvedTodayEntry>();
    for (const entry of resolved?.entries ?? []) map.set(entry.exerciseId, entry);
    return map;
  }, [resolved]);

  // Session exercises only carry exerciseId + name; fetch the library once to
  // resolve each exercise's demonstration media (PRD F7). Best-effort — the
  // icon placeholder remains if the library is unavailable.
  const libraryQuery = useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: async () => asList<Exercise>(await api<unknown>('/exercises')),
    staleTime: 5 * 60 * 1000,
  });
  const mediaByExerciseId = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of libraryQuery.data ?? []) {
      const url = ex.media?.[0]?.url;
      if (url) map.set(ex.id, url);
    }
    return map;
  }, [libraryQuery.data]);

  // ---- guided session state ----
  const [phase, setPhase] = useState<Phase>('overview');
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [setsDone, setSetsDone] = useState<number[]>([]);
  const [skippedFlags, setSkippedFlags] = useState<boolean[]>([]);
  const [setLogs, setSetLogs] = useState<SetLog[][]>([]);
  const [actualInput, setActualInput] = useState<{ weightKg: string; reps: string; rir: string }>({
    weightKg: '',
    reps: '',
    rir: '',
  });
  const [restLeft, setRestLeft] = useState(0);
  const [restTotal, setRestTotal] = useState(0);
  const [announce, setAnnounce] = useState('');
  const startedAtRef = useRef<number | null>(null);
  const [swapTarget, setSwapTarget] = useState<SessionExercise | null>(null);

  const exercises = useMemo(() => session?.exercises ?? [], [session]);
  const totalSets = useMemo(
    () => exercises.reduce((acc, ex) => acc + ex.setsPlanned, 0),
    [exercises],
  );
  const completedSets = setsDone.reduce((a, b) => a + b, 0);
  const current = exercises[exerciseIdx];
  const nextUp = exercises[exerciseIdx + 1];
  const currentEntry = current ? resolvedByExerciseId.get(current.exerciseId) : undefined;

  useEffect(() => {
    if (exercises.length > 0 && setsDone.length !== exercises.length) {
      setSetsDone(exercises.map(() => 0));
      setSkippedFlags(exercises.map(() => false));
      setSetLogs(exercises.map(() => []));
    }
  }, [exercises, setsDone.length]);

  // Prefill the actuals inputs from the resolved targets each time the
  // current exercise changes (targets stay the source of truth — AQF: code
  // computes, the user only confirms actuals).
  useEffect(() => {
    if (!currentEntry) {
      setActualInput({ weightKg: '', reps: '', rir: '' });
      return;
    }
    setActualInput({
      weightKg: currentEntry.weightKg != null ? String(currentEntry.weightKg) : '',
      reps: String(currentEntry.reps),
      rir: currentEntry.rir != null ? String(currentEntry.rir) : '',
    });
  }, [currentEntry]);

  // rest countdown (beep-free)
  useEffect(() => {
    if (phase !== 'rest' || restLeft <= 0) return;
    const t = window.setTimeout(() => {
      if (restLeft - 1 <= 0) {
        setPhase('work');
        setAnnounce('Rest complete. Next set.');
      }
      setRestLeft((s) => s - 1);
    }, 1000);
    return () => window.clearTimeout(t);
  }, [phase, restLeft]);

  const startSession = () => {
    startedAtRef.current = Date.now();
    setPhase('work');
    setExerciseIdx(0);
    setAnnounce(`Workout started. First exercise: ${exercises[0]?.name ?? ''}.`);
  };

  const advance = useCallback(
    (idx: number, done: number[]) => {
      if (idx + 1 < exercises.length) {
        setExerciseIdx(idx + 1);
        setPhase('work');
        setAnnounce(`Next exercise: ${exercises[idx + 1].name}.`);
      } else {
        setPhase('summary');
        setAnnounce('Workout finished. Review your summary.');
      }
      void done;
    },
    [exercises],
  );

  const completeSet = () => {
    if (!current) return;
    const done = [...setsDone];
    const setNumber = Math.min(current.setsPlanned, done[exerciseIdx] + 1);
    done[exerciseIdx] = setNumber;
    setSetsDone(done);

    // Capture per-set actuals when a resolved target exists for this exercise.
    if (currentEntry) {
      const weightKg = actualInput.weightKg.trim() === '' ? null : Number(actualInput.weightKg);
      const rir = actualInput.rir.trim() === '' ? null : Number(actualInput.rir);
      const reps = actualInput.reps.trim() === '' ? currentEntry.reps : Number(actualInput.reps);
      const log: SetLog = {
        set: setNumber,
        reps: Number.isFinite(reps) && reps > 0 ? reps : currentEntry.reps,
        weightKg: weightKg !== null && Number.isFinite(weightKg) && weightKg >= 0 ? weightKg : null,
        rir: rir !== null && Number.isFinite(rir) && rir >= 0 ? rir : null,
        completed: true,
      };
      setSetLogs((prev) => {
        const next = [...prev];
        next[exerciseIdx] = [...(next[exerciseIdx] ?? []), log];
        return next;
      });
    }

    const finishedExercise = done[exerciseIdx] >= current.setsPlanned;
    if (finishedExercise) {
      advance(exerciseIdx, done);
    } else {
      const restSeconds = currentEntry?.restSeconds ?? current.restSeconds;
      setRestTotal(restSeconds);
      setRestLeft(restSeconds);
      setPhase('rest');
      setAnnounce(`Set ${done[exerciseIdx]} of ${current.setsPlanned} done. Rest ${restSeconds} seconds.`);
    }
  };

  const skipExercise = () => {
    const flags = [...skippedFlags];
    flags[exerciseIdx] = true;
    setSkippedFlags(flags);
    advance(exerciseIdx, setsDone);
  };

  const durationMinutes = () =>
    Math.max(1, Math.round((Date.now() - (startedAtRef.current ?? Date.now())) / 60000));

  // ---- swap exercise ----
  const swapMutation = useMutation({
    mutationFn: (exerciseId: string) =>
      api<WorkoutSession>(`/workouts/${sessionId}/swap-exercise`, {
        method: 'POST',
        body: { exerciseId },
      }),
    onSuccess: () => {
      setSwapTarget(null);
      toast.success('Exercise swapped');
      void queryClient.invalidateQueries({ queryKey: ['workout'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Swap failed'),
  });

  // ---- complete workout ----
  const completeMutation = useMutation({
    mutationFn: (payload: {
      exercises: CompleteExerciseInput[];
      durationMinutes: number;
      localDate: string;
    }) => api<WorkoutSession>(`/workouts/${sessionId}/complete`, { method: 'POST', body: payload }),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ['workout'] });
      void queryClient.invalidateQueries({ queryKey: ['plan'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      void queryClient.invalidateQueries({ queryKey: ['workout-stats'] });
      toast.success('Workout complete — great session!');
      try {
        const summary = await queryClient.fetchQuery({
          queryKey: ['progress'],
          queryFn: () => api<ProgressSummary>('/progress/summary'),
        });
        const since = startedAtRef.current ?? Date.now() - 60_000;
        const unlocked = summary.achievements.find(
          (a) => a.earnedAt !== null && Date.parse(a.earnedAt) >= since,
        );
        if (unlocked) toast.success(`Achievement unlocked: ${unlocked.definition.name}`);
      } catch {
        // achievements toast is best-effort only
      }
      navigate('/workouts');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save the workout'),
  });

  const submitSummary = () => {
    completeMutation.mutate({
      exercises: exercises.map((ex, i) => {
        const logs = setLogs[i] ?? [];
        const last = logs[logs.length - 1];
        const base: CompleteExerciseInput = {
          exerciseId: ex.exerciseId,
          setsCompleted: setsDone[i] ?? 0,
          skipped: skippedFlags[i] ?? false,
        };
        // Attach actuals only when sets were logged — the legacy payload shape
        // is preserved exactly for sessions without resolved targets.
        if (logs.length > 0) {
          base.setLogs = logs;
          base.weightKg = last?.weightKg ?? null;
          base.rir = last?.rir ?? null;
        }
        return base;
      }),
      durationMinutes: durationMinutes(),
      localDate: localDateToday(),
    });
  };

  // ---------------- render ----------------

  if (sessionQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-10">
        <AppHeader back />
        <Skeleton className="mt-4 h-56 w-full rounded-card" />
        <Skeleton className="mt-4 h-20 w-full rounded-card" />
        <Skeleton className="mt-3 h-20 w-full rounded-card" />
        <Skeleton className="mt-3 h-20 w-full rounded-card" />
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-10">
        <AppHeader back />
        <div className="mt-6">
          <ErrorState
            message="Could not load the workout."
            retry={() => void sessionQuery.refetch()}
          />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-10">
        <AppHeader back />
        <div className="mt-6">
          <EmptyState
            icon="self_improvement"
            title="No session today"
            body="Today is a rest day, or you have no active plan yet."
            action={<SecondaryButton onClick={() => navigate('/workouts')}>Back to Training</SecondaryButton>}
          />
        </div>
      </div>
    );
  }

  const inGuided = phase === 'work' || phase === 'rest';

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-28">
      <AppHeader back />
      {/* polite announcements for timer / step changes */}
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      {!inGuided && phase !== 'summary' && (
        <>
          {/* ---- Hero ---- */}
          <section className="relative -mx-5 overflow-hidden">
            <div
              aria-hidden="true"
              className="h-56 w-full bg-[radial-gradient(circle_at_30%_20%,rgba(47,217,244,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(69,223,164,0.18),transparent_55%)] bg-surface-container-low"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
            <div className="absolute bottom-0 left-0 w-full space-y-2 p-5">
              <div className="flex gap-2">
                <span className="rounded-full border border-secondary/20 bg-secondary/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-secondary">
                  {session.exercises.length} exercises
                </span>
                <span className="rounded-full border border-primary/20 bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary tabular-nums">
                  ~{estimateMinutes(session)} min
                </span>
              </div>
              <h1 className="heading-display font-heading text-3xl leading-tight text-on-surface">
                {session.focus}
              </h1>
              <p className="text-sm text-on-surface-variant">Aqua Coach • personalised session</p>
            </div>
          </section>

          {/* ---- Meta chips ---- */}
          <section className="relative z-10 -mt-2 grid grid-cols-3 gap-3">
            {[
              { icon: 'timer', value: `${estimateMinutes(session)} min`, label: 'Duration' },
              { icon: 'local_fire_department', value: `~${estimateKcal(session)}`, label: 'kcal' },
              { icon: 'format_list_numbered', value: String(totalSets), label: 'Total sets' },
            ].map((m) => (
              <GlassCard key={m.label} className="flex flex-col items-center justify-center space-y-1 p-3">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  {m.icon}
                </span>
                <span className="text-sm font-bold text-on-surface tabular-nums">{m.value}</span>
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                  {m.label}
                </span>
              </GlassCard>
            ))}
          </section>

          {/* ---- Exercise list ---- */}
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="heading-display font-heading text-2xl text-on-surface">
                Workout Circuit
              </h2>
              <span className="text-sm text-on-surface-variant">
                {session.exercises.length} Exercises
              </span>
            </div>
            <ul className="space-y-3">
              {session.exercises.map((ex) => {
                const entry = resolvedByExerciseId.get(ex.exerciseId);
                return (
                  <li
                    key={ex.exerciseId}
                    className="flex items-center rounded-card border border-outline-variant/40 bg-surface-container-low p-3"
                  >
                    <ExerciseImage
                      src={mediaByExerciseId.get(ex.exerciseId)}
                      alt={`${ex.name} demonstration`}
                      className="h-16 w-16 flex-shrink-0 rounded-lg bg-surface-container-high object-cover"
                      fallback={
                        <div
                          aria-hidden="true"
                          className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-surface-container-high"
                        >
                          <span className="material-symbols-outlined text-xl text-primary">
                            play_circle
                          </span>
                        </div>
                      }
                    />
                    <div className="ml-4 min-w-0 flex-grow">
                      <h3 className="truncate text-sm font-bold text-on-surface">{ex.name}</h3>
                      {entry ? (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs text-on-surface-variant tabular-nums">
                            {repScheme(entry)}
                            {entry.weightKg != null && ` • ${entry.weightKg} kg`}
                            {` • ${entry.restSeconds}s rest`}
                          </span>
                          {entry.rir != null && (
                            <span className="rounded-full border border-secondary/25 bg-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary tabular-nums">
                              RiR {entry.rir}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-on-surface-variant tabular-nums">
                          {ex.setsPlanned} sets of {ex.reps} reps • {ex.restSeconds}s rest
                        </p>
                      )}
                    </div>
                    <button
                      aria-label={`Swap ${ex.name} for another exercise`}
                      onClick={() => setSwapTarget(ex)}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-on-surface-variant transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="material-symbols-outlined text-xl" aria-hidden="true">
                        swap_horiz
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ---- Sticky start ---- */}
          <div className="fixed bottom-0 left-0 z-[60] w-full bg-gradient-to-t from-surface via-surface to-transparent p-5">
            <div className="mx-auto w-full max-w-md">
              <PrimaryButton onClick={startSession}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  play_arrow
                </span>
                Start Workout
              </PrimaryButton>
            </div>
          </div>
        </>
      )}

      {/* ---- Guided session stepper ---- */}
      {inGuided && current && (
        <section aria-label="Guided workout session" className="mt-4 space-y-5">
          {/* overall progress bar */}
          <div>
            <div className="mb-1 flex justify-between text-xs text-on-surface-variant tabular-nums">
              <span>
                Exercise {exerciseIdx + 1}/{exercises.length}
              </span>
              <span>
                {completedSets}/{totalSets} sets
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={completedSets}
              aria-valuemin={0}
              aria-valuemax={totalSets}
              aria-label="Workout progress"
              className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
            >
              <div
                className="h-full rounded-full cta-gradient transition-all duration-500"
                style={{ width: `${totalSets ? (completedSets / totalSets) * 100 : 0}%` }}
              />
            </div>
          </div>

          {phase === 'work' ? (
            <GlassCard className="p-6 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Current exercise
              </p>
              <h2 className="heading-display mt-2 font-heading text-3xl text-on-surface">
                {current.name}
              </h2>
              {currentEntry ? (
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-on-surface-variant tabular-nums">
                  <span>
                    Target: {repScheme(currentEntry)}
                    {currentEntry.weightKg != null && ` @ ${currentEntry.weightKg} kg`}
                  </span>
                  {currentEntry.rir != null && (
                    <span className="rounded-full border border-secondary/25 bg-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary tabular-nums">
                      RiR {currentEntry.rir}
                    </span>
                  )}
                  <span>• {currentEntry.restSeconds}s rest</span>
                </div>
              ) : (
                <p className="mt-1 text-sm text-on-surface-variant tabular-nums">
                  {current.reps} reps • {current.restSeconds}s rest between sets
                </p>
              )}
              <ExerciseImage
                src={mediaByExerciseId.get(current.exerciseId)}
                alt={`${current.name} demonstration`}
                className="mt-4 aspect-video w-full rounded-card bg-surface-container-high object-cover"
                fallback={
                  <div
                    aria-hidden="true"
                    className="mt-4 flex aspect-video w-full items-center justify-center rounded-card bg-surface-container-high bg-[radial-gradient(circle_at_30%_20%,rgba(47,217,244,0.18),transparent_60%)]"
                  >
                    <span className="material-symbols-outlined text-5xl text-primary/60">
                      fitness_center
                    </span>
                  </div>
                }
              />

              {/* Per-set actuals (only when resolved targets exist — otherwise
                  the legacy tap-through flow is unchanged) */}
              {currentEntry && (
                <fieldset className="mt-5">
                  <legend className="sr-only">
                    Log actuals for set {(setsDone[exerciseIdx] ?? 0) + 1}
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        Weight kg
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={1000}
                        step={0.5}
                        value={actualInput.weightKg}
                        onChange={(e) =>
                          setActualInput((s) => ({ ...s, weightKg: e.target.value }))
                        }
                        placeholder="BW"
                        aria-label={`Weight in kilograms for set ${(setsDone[exerciseIdx] ?? 0) + 1} of ${current.name}`}
                        className="w-full rounded-lg border border-outline-variant bg-surface-container px-2 py-2 text-center font-bold text-on-surface tabular-nums placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        Reps
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={200}
                        value={actualInput.reps}
                        onChange={(e) => setActualInput((s) => ({ ...s, reps: e.target.value }))}
                        aria-label={`Reps for set ${(setsDone[exerciseIdx] ?? 0) + 1} of ${current.name}`}
                        className="w-full rounded-lg border border-outline-variant bg-surface-container px-2 py-2 text-center font-bold text-on-surface tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        RiR
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={9.5}
                        step={0.5}
                        value={actualInput.rir}
                        onChange={(e) => setActualInput((s) => ({ ...s, rir: e.target.value }))}
                        placeholder="—"
                        aria-label={`Reps in reserve for set ${(setsDone[exerciseIdx] ?? 0) + 1} of ${current.name}`}
                        className="w-full rounded-lg border border-outline-variant bg-surface-container px-2 py-2 text-center font-bold text-on-surface tabular-nums placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </label>
                  </div>
                  {currentEntry.notes && (
                    <p className="mt-2 text-xs text-on-surface-variant">{currentEntry.notes}</p>
                  )}
                </fieldset>
              )}

              <button
                onClick={completeSet}
                className="mx-auto mt-6 flex h-40 w-40 flex-col items-center justify-center rounded-full cta-gradient text-on-primary shadow-[0_8px_24px_rgba(34,211,238,0.3)] transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={`Complete set ${(setsDone[exerciseIdx] ?? 0) + 1} of ${current.setsPlanned}`}
              >
                <span className="text-4xl font-bold tabular-nums">
                  {(setsDone[exerciseIdx] ?? 0) + 1}
                  <span className="text-xl">/{current.setsPlanned}</span>
                </span>
                <span className="text-xs font-bold uppercase tracking-widest">Tap when done</span>
              </button>
              <div className="mt-6">
                <SecondaryButton onClick={skipExercise}>Skip exercise</SecondaryButton>
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="p-6 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-secondary">Rest</p>
              <div className="mt-4 flex justify-center">
                <RingProgress
                  value={restTotal - restLeft}
                  target={restTotal || 1}
                  size={160}
                  strokeWidth={8}
                  tone="green"
                  label="Rest"
                >
                  <span className="text-4xl font-bold text-on-surface tabular-nums">{restLeft}</span>
                </RingProgress>
              </div>
              <p className="mt-3 text-sm text-on-surface-variant">
                Breathe. Next set of {current.name}.
              </p>
              <div className="mt-5">
                <SecondaryButton
                  onClick={() => {
                    setPhase('work');
                    setAnnounce('Rest skipped.');
                  }}
                >
                  Skip rest
                </SecondaryButton>
              </div>
            </GlassCard>
          )}

          {nextUp && (
            <GlassCard className="flex items-center gap-3 p-4">
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                skip_next
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Next up
                </p>
                <p className="text-sm font-bold text-on-surface">
                  {nextUp.name}
                  <span className="ml-2 font-normal text-on-surface-variant tabular-nums">
                    {(() => {
                      const entry = resolvedByExerciseId.get(nextUp.exerciseId);
                      return entry
                        ? `${repScheme(entry)}${entry.weightKg != null ? ` @ ${entry.weightKg} kg` : ''}`
                        : `${nextUp.setsPlanned}×${nextUp.reps}`;
                    })()}
                  </span>
                </p>
              </div>
            </GlassCard>
          )}
        </section>
      )}

      {/* ---- Summary sheet ---- */}
      <BottomSheet
        open={phase === 'summary'}
        onClose={() => setPhase('overview')}
        title="Session Summary"
      >
        <div className="space-y-5">
          <GlassCard className="flex items-center justify-between p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Duration
              </p>
              <p className="text-2xl font-bold text-primary tabular-nums">{durationMinutes()} min</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Sets completed
              </p>
              <p className="text-2xl font-bold text-secondary tabular-nums">
                {completedSets}/{totalSets}
              </p>
            </div>
          </GlassCard>

          <ul className="space-y-3">
            {exercises.map((ex, i) => {
              const logs = setLogs[i] ?? [];
              const lastLog = logs[logs.length - 1];
              return (
                <li
                  key={ex.exerciseId}
                  className="flex items-center justify-between rounded-card border border-outline-variant/40 bg-surface-container-low p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-on-surface">{ex.name}</p>
                    <p className="text-xs text-on-surface-variant">
                      {skippedFlags[i] ? 'Skipped' : `${setsDone[i] ?? 0} of ${ex.setsPlanned} sets`}
                    </p>
                    {logs.length > 0 && (
                      <p className="text-xs text-secondary tabular-nums">
                        {lastLog?.weightKg != null ? `${lastLog.weightKg} kg` : 'Bodyweight'}
                        {lastLog?.rir != null ? ` • RiR ${lastLog.rir}` : ''}
                        {` • ${logs.length} set${logs.length === 1 ? '' : 's'} logged`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label={`Decrease sets completed for ${ex.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      onClick={() => {
                        const d = [...setsDone];
                        d[i] = Math.max(0, (d[i] ?? 0) - 1);
                        setSetsDone(d);
                        setSetLogs((prev) => {
                          const next = [...prev];
                          next[i] = (next[i] ?? []).slice(0, d[i]);
                          return next;
                        });
                      }}
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden="true">
                        remove
                      </span>
                    </button>
                    <span className="w-6 text-center text-sm font-bold text-on-surface tabular-nums">
                      {setsDone[i] ?? 0}
                    </span>
                    <button
                      aria-label={`Increase sets completed for ${ex.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      onClick={() => {
                        const d = [...setsDone];
                        d[i] = Math.min(20, (d[i] ?? 0) + 1);
                        setSetsDone(d);
                      }}
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden="true">
                        add
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-3">
            <PrimaryButton disabled={completeMutation.isPending} onClick={submitSummary}>
              {completeMutation.isPending ? 'Saving…' : 'Finish & save'}
            </PrimaryButton>
            <SecondaryButton onClick={() => setPhase('overview')}>Back to workout</SecondaryButton>
          </div>
        </div>
      </BottomSheet>

      {/* ---- Swap confirm sheet ---- */}
      <BottomSheet
        open={swapTarget !== null}
        onClose={() => setSwapTarget(null)}
        title="Swap Exercise"
      >
        {swapTarget && (
          <div className="space-y-5">
            <p className="text-base text-on-surface">
              Replace <span className="font-bold">{swapTarget.name}</span> with a similar exercise
              for the same muscle group and your available equipment?
            </p>
            <div className="flex flex-col gap-3">
              <PrimaryButton
                disabled={swapMutation.isPending}
                onClick={() => swapMutation.mutate(swapTarget.exerciseId)}
              >
                {swapMutation.isPending ? 'Swapping…' : 'Swap it'}
              </PrimaryButton>
              <SecondaryButton onClick={() => setSwapTarget(null)}>Keep it</SecondaryButton>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
