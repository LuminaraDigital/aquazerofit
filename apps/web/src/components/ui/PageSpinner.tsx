/** Full-page loader with a water-ripple pulse - the brand's identity moment. */
export function PageSpinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="min-h-screen w-full flex flex-col items-center justify-center gap-4 bg-surface"
    >
      <div className="relative w-14 h-14" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border-2 border-primary/15" />
        <span className="absolute inset-0 rounded-full border-2 border-primary/40 border-t-primary animate-spin" style={{ animationDuration: '0.9s' }} />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-[22px] text-primary">water_drop</span>
        </span>
      </div>
      <span className="text-xs text-on-surface-variant/50 uppercase tracking-widest">Loading</span>
    </div>
  );
}