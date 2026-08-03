/**
 * Shared scaffolding for the marketing sub-pages (/features, /how-it-works,
 * /aqua-coach). The landing route keeps its own layout — it has a hero, a
 * marquee and a different set of guards — but everything below the front door
 * shares one shell, one hero shape and one spec table.
 *
 * Extracted at the third page rather than the second: two copies is a
 * coincidence, three is a pattern, and this is the point at which divergence
 * starts to look intentional to a reader when it is really just drift.
 */
import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { isTMA } from '../../lib/telegram';
import { AppBackground } from '../../components/layout/AppBackground';
import { CtaButton, Footer, TopBar } from './Chrome';
import { Reveal, useHashScroll } from './motion';

/**
 * Page shell: background, skip link, chrome and the guards every marketing
 * sub-page needs. Signed-in visitors are allowed to read these — arriving here
 * is a deliberate navigation, not a landing — but the Telegram Mini App has no
 * use for a marketing page and goes to its own welcome instead.
 */
export function MarketingPage({
  documentTitle,
  children,
}: {
  documentTitle: string;
  children: React.ReactNode;
}) {
  const telegram = isTMA();

  useEffect(() => {
    if (telegram) return;
    const previous = document.title;
    document.title = documentTitle;
    return () => {
      document.title = previous;
    };
  }, [documentTitle, telegram]);

  /* Honours an incoming fragment such as /features#targets. */
  useHashScroll();

  if (telegram) return <Navigate to="/welcome" replace />;

  return (
    <div className="relative min-h-screen bg-surface text-on-surface">
      <AppBackground />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-[#001f25]"
      >
        Skip to content
      </a>

      <div className="azf-content">
        <TopBar />
        <main id="main">{children}</main>
        <div className="mx-auto max-w-6xl px-5">
          <Footer />
        </div>
      </div>
    </div>
  );
}

/** Breadcrumb, headline, lead and the two calls to action. */
export function PageHero({
  crumb,
  title,
  lead,
  secondary,
  children,
}: {
  crumb: string;
  title: React.ReactNode;
  lead: string;
  secondary: { to: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden pt-28 pb-14 sm:pt-36 sm:pb-16">
      <div className="lp-floor" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-5">
        <Reveal>
          <nav aria-label="Breadcrumb" className="text-[12px] text-on-surface-variant/70">
            <Link to="/landing" className="transition-colors hover:text-primary">
              Home
            </Link>
            <span className="px-2" aria-hidden="true">
              /
            </span>
            <span className="text-on-surface">{crumb}</span>
          </nav>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-6 max-w-3xl font-heading text-[40px] font-semibold leading-[1.04] tracking-tight text-on-surface sm:text-[58px]">
            {title}
          </h1>
        </Reveal>

        <Reveal delay={150}>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-on-surface-variant/75 sm:text-lg">
            {lead}
          </p>
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <CtaButton to="/sign-in?mode=register">
              Start free
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_forward
              </span>
            </CtaButton>
            <CtaButton to={secondary.to} variant="ghost">
              {secondary.label}
            </CtaButton>
          </div>
        </Reveal>

        {children}
      </div>
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
      <span className="text-sm leading-relaxed text-on-surface-variant/75">
        <strong className="font-semibold text-on-surface">{title}.</strong> {children}
      </span>
    </li>
  );
}

/** Key/value table for figures read out of the shared constants. */
export function Spec({ rows, caption }: { rows: Array<[string, string]>; caption?: string }) {
  return (
    <div className="lp-card overflow-hidden">
      <table className="w-full text-left text-sm">
        <tbody>
          {rows.map(([key, value], i) => (
            <tr key={key} className={i > 0 ? 'border-t border-white/5' : ''}>
              <th scope="row" className="px-5 py-3 font-medium text-on-surface-variant/75">
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
        <p className="border-t border-white/5 px-5 py-3 text-[12px] leading-relaxed text-on-surface-variant/70">
          {caption}
        </p>
      )}
    </div>
  );
}

/** Closing conversion block shared by the sub-pages. */
export function PageCta({
  title,
  lead,
  disclaimer,
}: {
  title: string;
  lead: string;
  disclaimer: string;
}) {
  return (
    <Reveal>
      <div className="lp-card px-6 py-12 text-center sm:px-12">
        <h2 className="font-heading text-2xl font-semibold text-on-surface sm:text-3xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-on-surface-variant/75">
          {lead}
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <CtaButton to="/sign-in?mode=register">Create your account</CtaButton>
          <CtaButton to="/sign-in" variant="ghost">
            Sign in
          </CtaButton>
        </div>
        <p className="mx-auto mt-8 max-w-xl text-[12px] leading-relaxed text-on-surface-variant/70">
          {disclaimer}
        </p>
      </div>
    </Reveal>
  );
}
