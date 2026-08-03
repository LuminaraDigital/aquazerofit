/**
 * Shared chrome for the public marketing surface (landing page + /features).
 *
 * Kept in one place deliberately: the moment a second marketing route exists,
 * a copied header and footer start drifting — different nav items, a stale
 * copyright line, one CTA updated and the other not. Both pages render these.
 */
import { Link } from 'react-router-dom';
import { SOURCE_CODE_URL, WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { useScrollProgress } from './motion';

/** In-page sections of the landing route. */
export const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#screens', label: 'Screens' },
  { href: '#how', label: 'How it works' },
  { href: '#coach', label: 'Aqua Coach' },
  { href: '#safety', label: 'Safety' },
];

/**
 * Footer "Product" column. Listed explicitly rather than derived from
 * NAV_LINKS: some entries are dedicated routes and some are sections of the
 * landing page, and a filter that silently decides which is which is how one
 * ends up linking a page to its own summary.
 */
const FOOTER_PRODUCT: Array<{ label: string; to?: string; href?: string }> = [
  { label: 'Features', to: '/features' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Aqua Coach', to: '/aqua-coach' },
  { label: 'Safety', to: '/safety' },
  { label: 'Screens', href: '#screens' },
  { label: 'Sign in', to: '/sign-in' },
];

/**
 * Anchors only resolve on the landing route itself; from any other page they
 * have to travel there first.
 *
 * The target is /landing, not /: `/` is behind RequireAuth, which redirects an
 * unauthenticated visitor to /landing via <Navigate> — and that drops the
 * fragment, landing everyone at the top of the page instead of the section
 * they clicked.
 */
function sectionHref(href: string, onLanding: boolean): string {
  return onLanding ? href : `/landing${href}`;
}

export function CtaButton({
  to,
  children,
  variant = 'primary',
}: {
  to: string;
  children: React.ReactNode;
  variant?: 'primary' | 'ghost';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-2xl px-6 min-h-[52px] font-heading text-sm font-semibold uppercase tracking-[0.04em] transition-all active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  const styles =
    variant === 'primary'
      ? 'cta-gradient text-[#001f25] hover:brightness-110'
      : 'border border-primary/25 bg-white/[0.03] text-on-surface hover:border-primary/50 hover:bg-white/[0.06]';
  return (
    <Link to={to} className={`${base} ${styles}`}>
      {children}
    </Link>
  );
}

export function TopBar({ onLanding = false }: { onLanding?: boolean }) {
  const progress = useScrollProgress();

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="glass-blur border-b border-white/5">
        <nav
          className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"
          aria-label="Primary"
        >
          <Link to="/landing" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 object-contain" aria-hidden="true" />
            <span className="font-heading text-lg font-extrabold tracking-tight text-primary">
              AquaZeroFit
            </span>
          </Link>

          <ul className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={sectionHref(link.href, onLanding)}
                  className="text-sm text-on-surface-variant/70 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <Link
              to="/sign-in"
              className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary sm:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Sign in
            </Link>
            <Link
              to="/sign-in?mode=register"
              className="cta-gradient inline-flex items-center rounded-xl px-4 py-2.5 font-heading text-[13px] font-semibold uppercase tracking-[0.04em] text-[#001f25] transition-all active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Get started
            </Link>
          </div>
        </nav>
      </div>
      {/* Reading progress */}
      <div
        className="h-px origin-left bg-gradient-to-r from-primary to-secondary"
        style={{ transform: `scaleX(${progress})` }}
        aria-hidden="true"
      />
    </header>
  );
}

export function Footer({ onLanding = false }: { onLanding?: boolean }) {
  return (
    <footer className="border-t border-white/5 pt-12">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 object-contain" aria-hidden="true" />
            <span className="font-heading text-lg font-extrabold tracking-tight text-primary">
              AquaZeroFit
            </span>
          </div>
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-on-surface-variant/70">
            {WELLNESS_DISCLAIMER}
          </p>
        </div>

        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant/70">
            Product
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm text-on-surface-variant/70">
            {FOOTER_PRODUCT.map((item) => (
              <li key={item.label}>
                {item.to ? (
                  <Link to={item.to} className="transition-colors hover:text-primary">
                    {item.label}
                  </Link>
                ) : (
                  <a
                    href={sectionHref(item.href!, onLanding)}
                    className="transition-colors hover:text-primary"
                  >
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant/70">
            Legal
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm text-on-surface-variant/70">
            {[
              { to: '/privacy', label: 'Privacy notice' },
              { to: '/terms', label: 'Terms of use' },
              { to: '/support', label: 'Support' },
            ].map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="transition-colors hover:text-primary">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant/70">
            Project
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm text-on-surface-variant/70">
            <li>
              <a
                href={SOURCE_CODE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="transition-colors hover:text-primary"
              >
                Source code
              </a>
            </li>
            <li>
              <a
                href={`${SOURCE_CODE_URL}/blob/main/LICENSE`}
                target="_blank"
                rel="noreferrer noopener"
                className="transition-colors hover:text-primary"
              >
                Licence (AGPL v3)
              </a>
            </li>
            <li>
              <a
                href={`${SOURCE_CODE_URL}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noreferrer noopener"
                className="transition-colors hover:text-primary"
              >
                Report a vulnerability
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-white/5 py-8 text-[12px] text-on-surface-variant/70 sm:flex-row sm:items-center sm:justify-between">
        <p>Copyright (C) 2026 AquaZero. Free software under the GNU AGPL v3.</p>
        <p className="uppercase tracking-[0.18em]">General wellness support only</p>
      </div>
    </footer>
  );
}
