/**
 * Geometry-matched loading placeholders. Prefer these over PageSpinner once
 * the route chrome is known so the hydrated layout does not shift.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`shimmer rounded-lg ${className}`} />;
}

/** Short / medium / long text lines that match body line-height. */
export function SkeletonText({
  lines = 1,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ['w-full', 'w-5/6', 'w-2/3', 'w-4/5'];
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

/** Card-shaped block with reserved min-height to hold CLS at zero. */
export function SkeletonCard({
  className = '',
  minHeightClass = 'min-h-[10rem]',
}: {
  className?: string;
  minHeightClass?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`glass-card p-card-padding ${minHeightClass} ${className}`}
    >
      <Skeleton className="mb-3 h-4 w-1/3" />
      <SkeletonText lines={2} />
      <Skeleton className="mt-4 h-10 w-full rounded-xl" />
    </div>
  );
}

/**
 * Auth / profile gate: mirrors AppLayout column so session restore does not
 * flash a full-screen spinner then jump into the tab shell.
 */
export function AuthGateSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="azf-content max-w-md mx-auto min-h-screen relative safe-bottom px-container-margin pt-6"
    >
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-4 w-36" />
      <Skeleton className="mb-5 h-9 w-48" />
      <Skeleton className="mb-5 h-12 w-full rounded-full" />
      <SkeletonCard className="mb-4" minHeightClass="min-h-[12rem]" />
      <SkeletonCard className="mb-4" minHeightClass="min-h-[8rem]" />
      <Skeleton className="h-40 w-full rounded-card" />
    </div>
  );
}

/** Dashboard first paint: greeting + ring + three stacked cards. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="px-container-margin pt-5">
      <Skeleton className="mb-2 h-4 w-32" />
      <Skeleton className="mb-5 h-9 w-44" />
      <Skeleton className="mb-5 h-10 w-full rounded-full" />
      <div className="mb-5 flex flex-col items-center gap-3">
        <Skeleton className="h-44 w-44 rounded-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      <SkeletonCard className="mb-4" />
      <SkeletonCard className="mb-4" minHeightClass="min-h-[8rem]" />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>
    </div>
  );
}

/** Nutrition day shell: date row + ring + meal list placeholders. */
export function NutritionSkeleton() {
  return (
    <div role="status" aria-label="Loading nutrition" className="space-y-4">
      <Skeleton className="h-56 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>
      <SkeletonCard minHeightClass="min-h-[14rem]" />
    </div>
  );
}

/** Settings profile shell: header card + preference rows. */
export function SettingsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading settings"
      className="max-w-md mx-auto min-h-screen relative safe-bottom px-container-margin pt-6"
    >
      <Skeleton className="mb-6 h-8 w-28" />
      <Skeleton className="mb-4 h-28 w-full rounded-card" />
      <Skeleton className="mb-3 h-14 w-full rounded-xl" />
      <Skeleton className="mb-3 h-14 w-full rounded-xl" />
      <Skeleton className="mb-3 h-14 w-full rounded-xl" />
      <Skeleton className="mb-3 h-14 w-full rounded-xl" />
      <Skeleton className="mt-6 h-40 w-full rounded-card" />
    </div>
  );
}

/** Progress page: range chips + weight hero + chart blocks. */
export function ProgressSkeleton() {
  return (
    <div role="status" aria-label="Loading progress" className="mt-5 space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-9 w-14 rounded-full" />
        <Skeleton className="h-9 w-14 rounded-full" />
        <Skeleton className="h-9 w-14 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
      </div>
      <Skeleton className="h-64 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-40 w-full rounded-card" />
    </div>
  );
}

/** Coach conversation: alternating bubble placeholders. */
export function CoachSkeleton() {
  return (
    <div role="status" aria-label="Loading conversation" className="space-y-4">
      <Skeleton className="h-20 w-3/4 rounded-card" />
      <Skeleton className="ml-auto h-14 w-2/3 rounded-card" />
      <Skeleton className="h-24 w-3/4 rounded-card" />
      <Skeleton className="ml-auto h-16 w-1/2 rounded-card" />
      <Skeleton className="h-20 w-2/3 rounded-card" />
    </div>
  );
}

/** Setup targets reveal: centered ring + macro cards. */
export function SetupTargetsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading your targets"
      className="max-w-md mx-auto min-h-screen flex flex-col items-center px-container-margin pt-16"
    >
      <Skeleton className="mb-4 h-12 w-12 rounded-full" />
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-8 h-4 w-72" />
      <Skeleton className="mb-8 h-44 w-44 rounded-full" />
      <div className="grid w-full grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
      </div>
      <Skeleton className="mt-8 h-14 w-full rounded-2xl" />
    </div>
  );
}

/**
 * Lazy-route Suspense fallback: app-column skeleton so code-split chunks do
 * not flash a full-screen spinner then reflow into the tab shell.
 */
export function RouteFallbackSkeleton() {
  return <AuthGateSkeleton />;
}
