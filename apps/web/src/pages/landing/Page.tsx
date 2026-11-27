/**
 * Shared scaffolding for the marketing sub-pages (/features, /how-it-works,
 * /aqua-coach, /safety, /google-play).
 *
 * Keeps SEO/TMA guards, top/footer chrome, editorial PageHero, canonical
 * PageSection, Bullet, Spec, and PageCta in one layer so sub-pages stay DRY
 * without forcing identical right-hand layouts or glowy pill badges.
 */
import { Navigate, Link } from 'react-router-dom';
import { isTMA } from '../../lib/telegram';
import { useSeo } from '../../lib/seo';
import { CtaButton, Footer, TelegramCta, TopBar, WebFallbackLink } from './Chrome';
import { Reveal, useHashScroll } from './motion';

export function MarketingPage({ path, children }: { path: string; children: React.ReactNode }) {
  const telegram = isTMA();

  useSeo(path);
  useHashScroll();

  if (telegram) return <Navigate to="/welcome" replace />;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-surface text-on-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
      >
        Skip to content
      </a>

      <div className="azf-content">
        <TopBar />
        <main id="main">{children}</main>
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <Footer />
        </div>
      </div>
    </div>
  );
}

/** Breadcrumb, full-contrast editorial headline, lead, CTAs, and optional bespoke right stage. */
export function PageHero({
  crumb,
  kicker,
  title,
  lead,
  secondary,
  primary = <TelegramCta placement="subpage-hero" />,
  aside,
  backdrop,
  children,
}: {
  crumb: string;
  /** Quiet Corner Card metadata line beside the breadcrumb (no pill badge). */
  kicker?: string;
  title: React.ReactNode;
  lead: string;
  secondary: { to: string; label: string };
  primary?: React.ReactNode;
  aside?: React.ReactNode;
  backdrop?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden pt-28 pb-12 sm:pt-32 sm:pb-16">
      {backdrop}
      <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
        <div
          className={
            aside
              ? 'grid items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-14'
              : ''
          }
        >
          <div className="min-w-0">
            <div className="flex flex-col items-start gap-y-1.5 text-[13px] text-on-surface-variant sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
              <nav aria-label="Breadcrumb" className="inline-flex items-center">
                <Link
                  to="/"
                  className="-my-2 inline-flex min-h-[44px] items-center transition-colors hover:text-primary"
                >
                  Home
                </Link>
                <span className="px-2 text-outline" aria-hidden="true">
                  /
                </span>
                <span className="text-on-surface">{crumb}</span>
              </nav>
              {kicker && (
                <>
                  <span className="hidden text-outline sm:inline" aria-hidden="true">
                    ·
                  </span>
                  <span className="stat-label text-primary">{kicker}</span>
                </>
              )}
            </div>

            <h1 className="mt-4 max-w-3xl font-heading text-[40px] font-semibold leading-[0.98] tracking-[-0.015em] text-on-surface [text-wrap:balance] sm:text-[58px]">
              {title}
            </h1>

            <p className="mt-5 max-w-[60ch] text-[16px] leading-relaxed text-on-surface-variant [text-wrap:pretty] sm:text-[18px]">
              {lead}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {primary}
              <CtaButton to={secondary.to} variant="ghost">
                {secondary.label}
              </CtaButton>
            </div>
          </div>

          {aside && <div className="min-w-0">{aside}</div>}
        </div>

        {children}
      </div>
    </section>
  );
}

/** Canonical sub-page section wrapper (replaces duplicated local Section components). */
export function PageSection({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Reveal className="min-w-0">
        <p className="stat-label text-primary">{eyebrow}</p>
        <h2 className="mt-2 font-heading text-[32px] font-semibold leading-[1.04] text-on-surface [text-wrap:balance] sm:text-[42px]">
          {title}
        </h2>
        {lead && (
          <p className="mt-3.5 max-w-[65ch] text-[16px] leading-relaxed text-on-surface-variant [text-wrap:pretty]">
            {lead}
          </p>
        )}
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** Bulleted claim with a bolded lead-in. */
export function Bullet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-secondary"
        aria-hidden="true"
      >
        check_circle
      </span>
      <span className="text-[15px] leading-relaxed text-on-surface-variant">
        <strong className="font-semibold text-on-surface">{title}.</strong> {children}
      </span>
    </li>
  );
}

/** Key/value table for figures read out of the shared constants. */
export function Spec({ rows, caption }: { rows: Array<[string, string]>; caption?: string }) {
  return (
    <div className="lp-card overflow-hidden">
      <table className="w-full text-left text-[14px]">
        <tbody>
          {rows.map(([key, value], i) => (
            <tr key={key} className={i > 0 ? 'border-t border-outline-variant/50' : ''}>
              <th scope="row" className="px-5 py-3 font-medium text-on-surface-variant">
                {key}
              </th>
              <td className="px-5 py-3 text-right font-semibold tabular-nums text-on-surface">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {caption && (
        <p className="border-t border-outline-variant/50 px-5 py-3 text-[13px] leading-relaxed text-on-surface-variant">
          {caption}
        </p>
      )}
    </div>
  );
}

/** Architectural horizontal closing CTA shared by the sub-pages. */
export function PageCta({
  title,
  lead,
  disclaimer,
  children,
}: {
  title: string;
  lead: string;
  disclaimer: string;
  children?: React.ReactNode;
}) {
  return (
    <Reveal>
      <div className="lp-panel p-6 sm:p-10">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <h2 className="font-heading text-[30px] font-semibold leading-tight text-on-surface sm:text-[38px]">
              {title}
            </h2>
            <p className="mt-2.5 max-w-[60ch] text-[15.5px] leading-relaxed text-on-surface-variant">
              {lead}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            {children}
            <div className="flex flex-col gap-3 sm:flex-row">
              <TelegramCta placement="subpage-final" />
              <WebFallbackLink placement="subpage-final" />
            </div>
          </div>
        </div>
        <p className="mt-6 border-t border-outline-variant/50 pt-4 text-[13px] leading-relaxed text-on-surface-variant">
          {disclaimer}
        </p>
      </div>
    </Reveal>
  );
}
