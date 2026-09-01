/**
 * Workout Library — pixel reference: Figma workout_library.
 * Weekly plan strip (GET /plans/current), Today's Workout hero
 * (GET /workouts/today), server-driven exercise search with pagination
 * (GET /exercises?search=&category=&muscle=&equipment=&limit=&offset=),
 * exercise detail bottom-sheet with CC-BY-SA attribution (AQF-12), a
 * variations strip (GET /exercises/:id/variations), and a plan-generation
 * options sheet (POST /plans/generate).
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  EQUIPMENT,
  type Exercise,
  type TrainingPlan,
  type WorkoutSession,
} from '@aquazerofit/shared';
import { api, ApiError, mediaUrl } from '@/lib/api';
import { todayWorkoutQuery, unwrapWorkoutSession } from '@/lib/queries';
import { EQUIPMENT_ICONS, EQUIPMENT_LABELS } from '@/lib/equipmentMeta';
import { normalizeExercisesPage } from '@/lib/contracts';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { BottomSheet } from './BottomSheet';

const PAGE_SIZE = 24;

const CATEGORIES = [
  { key: '', label: 'All' },
  { key: 'strength', label: 'Strength' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'core', label: 'Core' },
  { key: 'mobility', label: 'Mobility' },
] as const;

/** Plan-engine muscle vocabulary (wger imports map onto the same strings). */
const MUSCLES = [
  { key: '', label: 'All muscles' },
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'triceps', label: 'Triceps' },
  { key: 'core', label: 'Core' },
  { key: 'glutes', label: 'Glutes' },
  { key: 'quadriceps', label: 'Quadriceps' },
  { key: 'hamstrings', label: 'Hamstrings' },
  { key: 'calves', label: 'Calves' },
] as const;

/** Treat NOT_FOUND as "no data yet" rather than an error. */
async function orNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: T[] }).items;
  }
  return [];
}

/** /plans/current responds { plan }; accept both wrapped and bare shapes. */
function unwrapPlan(data: unknown): TrainingPlan | null {
  if (!data || typeof data !== 'object') return null;
  const maybe = (data as { plan?: unknown }).plan ?? data;
  return maybe && typeof maybe === 'object' && Array.isArray((maybe as TrainingPlan).days)
    ? (maybe as TrainingPlan)
    : null;
}

/**
 * /workouts/today responds { rest, focus, iteration, session }; session is
 * null on rest days. Re-exported from the data layer so this page and
 * WorkoutDetail share one definition with useTodayWorkout.
 */
export const unwrapSession = unwrapWorkoutSession;

export function estimateMinutes(session: WorkoutSession): number {
  const seconds = session.exercises.reduce(
    (acc, ex) => acc + ex.setsPlanned * (ex.reps * 4 + ex.restSeconds),
    0,
  );
  return session.durationMinutes ?? Math.max(10, Math.round(seconds / 60));
}

export function estimateKcal(session: WorkoutSession): number {
  return session.kcalBurned ?? Math.round((estimateMinutes(session) * 5.5) / 10) * 10;
}

/**
 * Exercise media image (PRD F7) with a graceful fallback: renders the given
 * URL and swaps back to the icon placeholder if the image fails to load.
 * Works for locally mirrored wger images (/uploads) exactly as for seed media.
 *
 * Paths arrive server-relative (`/uploads/...`), so they are resolved through
 * mediaUrl(): same origin by default, VITE_MEDIA_BASE_URL when the API and
 * the static site are hosted on different origins.
 *
 * CONTRACT: `className` must pin the box — every call site passes either an
 * `aspect-*` ratio or explicit `h-`/`w-` sizes. Imported wger media has no
 * fixed intrinsic size, so width/height attributes here would be a guess; the
 * caller's box is what actually keeps this out of the layout-shift budget.
 * Always below the fold (a list or a detail panel), so it stays lazy.
 */
export function ExerciseImage({
  src,
  alt,
  className,
  fallback,
}: {
  src?: string;
  alt: string;
  className: string;
  fallback: ReactNode;
}) {
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [src]);
  const presentation = getExerciseImagePresentation(src, alt, errored);
  if (!presentation.shouldRenderImage) return <>{fallback}</>;
  return (
    <img
      src={mediaUrl(src!)}
      alt={presentation.alt}
      aria-hidden={presentation.ariaHidden}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setErrored(true)}
    />
  );
}

export function getExerciseImagePresentation(src: string | undefined, alt: string, errored: boolean) {
  const isDecorative = Boolean(src?.includes('/uploads/exercises/fallbacks/'));
  return {
    shouldRenderImage: Boolean(src) && !errored,
    alt: isDecorative ? '' : alt,
    ariaHidden: isDecorative || undefined,
  };
}

export function getExerciseMediaPresentation(detail: Exercise) {
  const images = (detail.media ?? []).filter((media) => media.kind === 'image');
  const hasPerMediaAiProvenance = images.some((media) => media.isAiGenerated !== undefined);
  const isAiGenerated =
    images.some((media) => media.isAiGenerated === true) ||
    (!hasPerMediaAiProvenance && detail.isAiGeneratedMedia === true);
  const seen = new Set<string>();
  const attributions = images.flatMap((media) => {
    const hasMediaProvenance = Boolean(
      media.source ||
        media.attributionText ||
        media.licence ||
        media.licenceAuthor ||
        media.licenceUrl,
    );
    if (!hasMediaProvenance) return [];
    const attribution =
      media.attributionText ??
      [media.licenceAuthor ? `© ${media.licenceAuthor}` : '', media.licence ?? '']
        .filter(Boolean)
        .join(', ');
    const text =
      media.attributionText && media.licence
        ? `${media.attributionText}, ${media.licence}`
        : attribution;
    const key = `${text}|${media.licenceUrl ?? ''}|${media.source ?? ''}`;
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [{ key, text, licenceUrl: media.licenceUrl, source: media.source }];
  });
  return { images, isAiGenerated, attributions };
}

function mondayOfThisWeek(): Date {
  const now = new Date();
  const shift = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - shift);
  return monday;
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Exercise detail sheet body — attribution (AQF-12, never omitted), media
 * strip with SVG-icon fallback, and a variations strip when the exercise
 * belongs to a wger variation group.
 */
function ExerciseDetailBody({
  detail,
  onSelect,
}: {
  detail: Exercise;
  onSelect: (exercise: Exercise) => void;
}) {
  const { images, isAiGenerated: displayedMediaIsAiGenerated, attributions: mediaAttributions } =
    useMemo(() => getExerciseMediaPresentation(detail), [detail]);

  // Variations are only meaningful for wger-imported exercises that carry a
  // variation group; the endpoint 404s while the backend rolls out → orNull.
  const variationsQuery = useQuery({
    queryKey: ['exercise-variations', detail.id],
    queryFn: async () =>
      asList<Exercise>(await orNull(() => api<unknown>(`/exercises/${detail.id}/variations`))),
    enabled: Boolean(detail.variationGroup),
    staleTime: 5 * 60 * 1000,
  });
  const variations = (variationsQuery.data ?? []).filter((v) => v.id !== detail.id);

  const fallbackIcon = (size: string) => (
    <span className={`material-symbols-outlined ${size} text-primary/60`} aria-hidden="true">
      {EQUIPMENT_ICONS[detail.equipment[0] ?? 'none']}
    </span>
  );

  return (
    <div className="space-y-4">
      {/* Media: single hero image, or a horizontal strip when several exist */}
      {images.length <= 1 ? (
        <ExerciseImage
          src={images[0]?.url}
          alt={`${detail.name} demonstration`}
          className="aspect-video w-full rounded-card bg-surface-container-high object-cover"
          fallback={
            <div
              aria-hidden="true"
              className="flex aspect-video w-full items-center justify-center rounded-card bg-surface-container-high"
            >
              {fallbackIcon('text-6xl')}
            </div>
          }
        />
      ) : (
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
          {images.map((m, i) => (
            <ExerciseImage
              key={`${m.url}-${i}`}
              src={m.url}
              alt={m.caption ?? `${detail.name} demonstration ${i + 1}`}
              className="aspect-video w-64 flex-shrink-0 rounded-card bg-surface-container-high object-cover"
              fallback={
                <div
                  aria-hidden="true"
                  className="flex aspect-video w-64 flex-shrink-0 items-center justify-center rounded-card bg-surface-container-high"
                >
                  {fallbackIcon('text-4xl')}
                </div>
              }
            />
          ))}
        </div>
      )}
      {displayedMediaIsAiGenerated && (
        <p className="flex items-center gap-1 text-[11px] text-on-surface-variant">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            auto_awesome
          </span>
          Workout image generated with AI
        </p>
      )}

      <p className="text-base leading-relaxed text-on-surface">{detail.description}</p>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          Muscles
        </h3>
        <div className="flex flex-wrap gap-2">
          {detail.primaryMuscles.map((m) => (
            <Chip key={m} label={m} tone="aqua" />
          ))}
          {detail.secondaryMuscles.map((m) => (
            <Chip key={m} label={m} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          Equipment
        </h3>
        <div className="flex flex-wrap gap-2">
          {detail.equipment.map((eq) => (
            <Chip key={eq} label={EQUIPMENT_LABELS[eq]} icon={EQUIPMENT_ICONS[eq]} tone="navy" />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-on-surface-variant">
        <span className="capitalize">Difficulty: {detail.difficulty}</span>
        <span className="capitalize">{detail.category}</span>
      </div>

      {/* Variations strip (wger variation groups) */}
      {detail.variationGroup && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Variations
          </h3>
          {variationsQuery.isPending ? (
            <div className="flex gap-3">
              <Skeleton className="h-24 w-32 flex-shrink-0 rounded-card" />
              <Skeleton className="h-24 w-32 flex-shrink-0 rounded-card" />
            </div>
          ) : variations.length === 0 ? (
            <p className="text-xs text-on-surface-variant">No variations available.</p>
          ) : (
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
              {variations.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelect(v)}
                  aria-label={`View variation ${v.name}`}
                  className="w-32 flex-shrink-0 rounded-card border border-outline-variant/40 bg-surface-container-low p-2 text-left transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <ExerciseImage
                    src={v.media?.[0]?.url}
                    alt={`${v.name} demonstration`}
                    className="h-16 w-full rounded-lg bg-surface-container-high object-cover"
                    fallback={
                      <div
                        aria-hidden="true"
                        className="flex h-16 w-full items-center justify-center rounded-lg bg-surface-container-high"
                      >
                        <span className="material-symbols-outlined text-xl text-primary/60" aria-hidden="true">
                          {EQUIPMENT_ICONS[v.equipment[0] ?? 'none']}
                        </span>
                      </div>
                    }
                  />
                  <p className="mt-1.5 line-clamp-2 text-xs font-bold text-on-surface">{v.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attribute the displayed pixels; legacy wger records retain exercise-level attribution. */}
      <div className="border-t border-outline-variant pt-3 text-xs text-on-surface-variant">
        {mediaAttributions.length > 0 && (
          <ul className="space-y-1" aria-label="Workout image attribution">
            {mediaAttributions.map((attribution) => (
              <li key={attribution.key}>
                Image: {attribution.text}
                {attribution.licenceUrl && (
                  <>
                    {', via '}
                    <a
                      href={attribution.licenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {attribution.source === 'wger' ? 'wger.de' : 'licence'}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className={mediaAttributions.length > 0 ? 'mt-1' : undefined}>
          Exercise data: © {detail.licenceAuthor}, {detail.licence}
          {detail.licenceUrl ? (
            <>
              {', via '}
              <a
                href={detail.licenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                wger.de
              </a>
            </>
          ) : detail.wgerUuid ? (
            ', via wger.de'
          ) : null}
        </p>
      </div>
    </div>
  );
}

export default function WorkoutLibrary() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [category, setCategory] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [focus, setFocus] = useState<'weightLoss' | 'strength' | 'general'>('general');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const planQuery = useQuery({
    queryKey: ['plan'],
    queryFn: async () => unwrapPlan(await orNull(() => api<unknown>('/plans/current'))),
  });

  // Shared cache key ⇒ shared queryFn (raw envelope); carve with `select`.
  const todayQuery = useQuery({ ...todayWorkoutQuery, select: unwrapSession });

  // Server-driven search + pagination (limit/offset). Legacy array responses
  // normalise to a single page so the UI is stable during backend rollout.
  const exercisesQuery = useInfiniteQuery({
    queryKey: ['exercises', { search: debounced, category, muscle, equipment }],
    queryFn: async ({ pageParam }) => {
      const data = await api<unknown>('/exercises', {
        query: {
          search: debounced || undefined,
          category: category || undefined,
          muscle: muscle || undefined,
          equipment: equipment || undefined,
          limit: PAGE_SIZE,
          offset: pageParam,
        },
      });
      return normalizeExercisesPage(data, pageParam);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const consumed = last.offset + last.items.length;
      return consumed < last.total ? consumed : undefined;
    },
  });

  const exercises = useMemo(
    () => exercisesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [exercisesQuery.data],
  );
  const totalExercises = exercisesQuery.data?.pages[0]?.total ?? exercises.length;

  // Infinite scroll: auto-fetch when the sentinel enters the viewport.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && exercisesQuery.hasNextPage && !exercisesQuery.isFetchingNextPage) {
        void exercisesQuery.fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [exercisesQuery]);

  const generatePlan = useMutation({
    mutationFn: () =>
      api<TrainingPlan>('/plans/generate', { method: 'POST', body: { daysPerWeek, focus } }),
    onSuccess: () => {
      setGenerateOpen(false);
      toast.success('Your new training plan is ready');
      void queryClient.invalidateQueries({ queryKey: ['plan'] });
      void queryClient.invalidateQueries({ queryKey: ['workout'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Plan generation failed'),
  });

  const plan = planQuery.data ?? null;
  const today = todayQuery.data ?? null;
  const monday = useMemo(mondayOfThisWeek, []);
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <div className="w-full px-5">
      <AppHeader />

      {/* ---- Weekly plan strip ---- */}
      <section aria-label="This week's plan" className="mt-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="heading-display font-heading text-2xl text-on-surface">This Week</h2>
          {plan && (
            <span className="text-sm font-medium text-secondary">
              {plan.days.filter((d) => !d.isRest).length} training days
            </span>
          )}
        </div>

        {planQuery.isPending ? (
          <Skeleton className="h-24 w-full rounded-card" />
        ) : planQuery.isError ? (
          <ErrorState message="Could not load your plan." retry={() => void planQuery.refetch()} />
        ) : !plan ? (
          <EmptyState
            icon="fitness_center"
            title="No training plan yet"
            body="Generate a personalised weekly plan matched to your equipment and experience."
            action={
              <PrimaryButton onClick={() => setGenerateOpen(true)}>Generate my plan</PrimaryButton>
            }
          />
        ) : (
          <div className="flex items-center justify-between rounded-card border border-outline-variant bg-surface-container-low p-4">
            {plan.days.map((day, i) => {
              const date = new Date(monday);
              date.setDate(monday.getDate() + i);
              const isToday = i === todayIdx;
              const doneToday = isToday && today?.status === 'completed';
              return (
                <div key={day.order} className="flex flex-col items-center gap-1">
                  <span
                    className={`text-sm font-medium ${isToday ? 'font-bold text-primary' : 'text-on-surface-variant'}`}
                  >
                    {DAY_LETTERS[i]}
                  </span>
                  <div
                    aria-label={`${day.focus}${isToday ? ', today' : ''}${doneToday ? ', completed' : ''}`}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm tabular-nums ${
                      doneToday
                        ? 'bg-secondary-container text-on-secondary'
                        : isToday
                          ? 'border-2 border-primary text-primary shadow-[0_0_15px_rgba(138,235,255,0.3)]'
                          : day.isRest
                            ? 'bg-surface-container text-on-surface-variant/50'
                            : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {doneToday ? (
                      <span className="material-symbols-outlined text-xl" aria-hidden="true">
                        check
                      </span>
                    ) : day.isRest ? (
                      <span className="material-symbols-outlined text-base" aria-hidden="true">
                        self_improvement
                      </span>
                    ) : (
                      <span className="font-bold">{date.getDate()}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Today's workout hero ---- */}
      <section aria-label="Today's workout" className="mt-8">
        {todayQuery.isPending ? (
          <Skeleton className="h-64 w-full rounded-card" />
        ) : todayQuery.isError ? (
          <ErrorState
            message="Could not load today's workout."
            retry={() => void todayQuery.refetch()}
          />
        ) : !today ? (
          plan ? (
            <GlassCard className="p-5 text-center">
              <span className="material-symbols-outlined text-4xl text-secondary" aria-hidden="true">
                self_improvement
              </span>
              <p className="mt-2 font-bold text-on-surface">Rest day</p>
              <p className="text-sm text-on-surface-variant">
                Recovery is part of the plan. See you tomorrow.
              </p>
            </GlassCard>
          ) : null
        ) : (
          <GlassCard className="relative overflow-hidden p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(47,217,244,0.18),transparent_60%)]"
            />
            <div className="relative space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-primary">
                  Today
                </span>
                <span className="rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-secondary tabular-nums">
                  {estimateMinutes(today)} min
                </span>
              </div>
              <div>
                <h3 className="heading-display font-heading text-3xl leading-tight text-on-surface">
                  {today.focus}
                </h3>
                <div className="mt-1 flex items-center gap-4 text-on-surface-variant">
                  <span className="flex items-center gap-1 text-xs">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      format_list_numbered
                    </span>
                    {today.exercises.length} exercises
                  </span>
                  <span className="flex items-center gap-1 text-xs tabular-nums">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      local_fire_department
                    </span>
                    ~{estimateKcal(today)} kcal
                  </span>
                </div>
              </div>
              <PrimaryButton onClick={() => navigate(`/workouts/${today.id}`)}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  play_arrow
                </span>
                Start Workout
              </PrimaryButton>
            </div>
          </GlassCard>
        )}
      </section>

      {/* ---- Exercise library ---- */}
      <section aria-label="Exercise library" className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="heading-display font-heading text-2xl text-on-surface">Library</h2>
          {!exercisesQuery.isPending && !exercisesQuery.isError && (
            <span className="text-sm text-on-surface-variant tabular-nums">
              {totalExercises} exercises
            </span>
          )}
        </div>
        <Input
          label="Search exercises"
          icon="search"
          type="search"
          placeholder="Search exercises…"
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />

        <div
          className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1"
          role="tablist"
          aria-label="Exercise category"
        >
          {CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              active={category === c.key}
              onClick={() => setCategory(c.key)}
            />
          ))}
        </div>

        <div
          className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1"
          role="tablist"
          aria-label="Muscle group"
        >
          {MUSCLES.map((m) => (
            <Chip
              key={m.key}
              label={m.label}
              tone="green"
              active={muscle === m.key}
              onClick={() => setMuscle(m.key)}
            />
          ))}
        </div>

        <div
          className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1"
          role="tablist"
          aria-label="Equipment"
        >
          <Chip
            label="All equipment"
            tone="navy"
            active={equipment === ''}
            onClick={() => setEquipment('')}
          />
          {EQUIPMENT.filter((eq) => eq !== 'none').map((eq) => (
            <Chip
              key={eq}
              label={EQUIPMENT_LABELS[eq]}
              icon={EQUIPMENT_ICONS[eq]}
              tone="navy"
              active={equipment === eq}
              onClick={() => setEquipment(eq)}
            />
          ))}
        </div>

        <div className="mt-4 space-y-3" aria-live="polite">
          {exercisesQuery.isPending ? (
            <>
              <Skeleton className="h-20 w-full rounded-card" />
              <Skeleton className="h-20 w-full rounded-card" />
              <Skeleton className="h-20 w-full rounded-card" />
            </>
          ) : exercisesQuery.isError ? (
            <ErrorState
              message="Could not load exercises."
              retry={() => void exercisesQuery.refetch()}
            />
          ) : exercises.length === 0 ? (
            <EmptyState
              icon="search_off"
              title="No exercises found"
              body="Try a different search term or filter."
            />
          ) : (
            <>
              {exercises.map((ex) => (
                <GlassCard key={ex.id} className="p-3" onClick={() => setDetail(ex)}>
                  <div className="flex items-center gap-4">
                    <ExerciseImage
                      src={ex.media?.[0]?.url}
                      alt={`${ex.name} demonstration`}
                      className="h-16 w-16 flex-shrink-0 rounded-lg bg-surface-container-high object-cover"
                      fallback={
                        <div
                          aria-hidden="true"
                          className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-surface-container-high"
                        >
                          <span className="material-symbols-outlined text-2xl text-primary">
                            {EQUIPMENT_ICONS[ex.equipment[0] ?? 'none']}
                          </span>
                        </div>
                      }
                    />
                    <div className="min-w-0 flex-grow">
                      <h4 className="truncate text-sm font-bold text-on-surface">{ex.name}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {ex.primaryMuscles[0] && (
                          <Chip label={ex.primaryMuscles[0]} tone="aqua" />
                        )}
                        <span className="text-xs capitalize text-on-surface-variant">
                          {ex.difficulty}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1 text-on-surface-variant">
                      {ex.equipment.slice(0, 2).map((eq) => (
                        <span
                          key={eq}
                          className="material-symbols-outlined text-[18px]"
                          role="img"
                          aria-label={EQUIPMENT_LABELS[eq]}
                          title={EQUIPMENT_LABELS[eq]}
                        >
                          {EQUIPMENT_ICONS[eq]}
                        </span>
                      ))}
                    </div>
                  </div>
                </GlassCard>
              ))}

              {/* Infinite-scroll sentinel + pager fallback */}
              <div ref={sentinelRef} aria-hidden="true" />
              {exercisesQuery.isFetchingNextPage && (
                <>
                  <Skeleton className="h-20 w-full rounded-card" />
                  <Skeleton className="h-20 w-full rounded-card" />
                </>
              )}
              {exercisesQuery.hasNextPage && !exercisesQuery.isFetchingNextPage && (
                <SecondaryButton onClick={() => void exercisesQuery.fetchNextPage()}>
                  Load more ({exercises.length} of {totalExercises})
                </SecondaryButton>
              )}
            </>
          )}
        </div>
      </section>

      {/* ---- Exercise detail sheet (with AQF-12 attribution) ---- */}
      <BottomSheet open={detail !== null} onClose={() => setDetail(null)} title={detail?.name ?? ''}>
        {detail && <ExerciseDetailBody detail={detail} onSelect={setDetail} />}
      </BottomSheet>

      {/* ---- Generate plan options sheet ---- */}
      <BottomSheet
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate Plan"
      >
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Days per week
            </h3>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map((n) => (
                <Chip
                  key={n}
                  label={String(n)}
                  active={daysPerWeek === n}
                  onClick={() => setDaysPerWeek(n)}
                />
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Focus
            </h3>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['general', 'General fitness'],
                  ['weightLoss', 'Weight loss'],
                  ['strength', 'Strength'],
                ] as const
              ).map(([key, label]) => (
                <Chip key={key} label={label} active={focus === key} onClick={() => setFocus(key)} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <PrimaryButton
              disabled={generatePlan.isPending}
              onClick={() => generatePlan.mutate()}
            >
              {generatePlan.isPending ? 'Generating…' : 'Generate my plan'}
            </PrimaryButton>
            <SecondaryButton onClick={() => setGenerateOpen(false)}>Cancel</SecondaryButton>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
