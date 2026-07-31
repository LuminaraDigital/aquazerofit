import { Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * Top app bar. Two variants:
 * - back header: pass `back` (and usually `title`) for sub-pages
 * - brand header: default - waves logo + wordmark
 *
 * Uses glass-blur instead of a hard border line. The header fades
 * into the surface rather than cutting the page with a visible line.
 */
export function AppHeader({
  title,
  back = false,
  right,
}: {
  title?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 glass-blur border-b border-outline-variant/40">
      <div className="mx-auto max-w-md flex items-center justify-between px-container-margin py-3.5 gap-3">
        {back ? (
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high/60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                arrow_back
              </span>
            </button>
            {title && (
              <h1 className="font-heading font-semibold uppercase tracking-[0.03em] text-lg text-on-surface truncate">
                {title}
              </h1>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="material-symbols-outlined text-primary text-2xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              waves
            </span>
            <h1 className="font-heading font-bold tracking-tight text-xl text-primary truncate">
              {title ?? 'AquaZeroFit'}
            </h1>
          </div>
        )}
        {right ?? (
          !back && (
            <Link
              to="/settings"
              aria-label="Profile and settings"
              className="w-9 h-9 rounded-full border border-primary/50 bg-surface-container-high/60 flex items-center justify-center text-primary hover:bg-surface-container-highest transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                person
              </span>
            </Link>
          )
        )}
      </div>
    </header>
  );
}