/**
 * Shared layout and typography for the legal pages (/privacy, /terms, /support).
 *
 * Narrower measure than the marketing pages — these are read, not scanned — with
 * a contents rail, and the draft notice pinned above the first clause so nobody
 * reaches the substance without meeting it first.
 */
import { Link } from 'react-router-dom';
import { MarketingPage } from '../landing/Page';
import { Reveal } from '../landing/motion';
import { DraftNotice, Fact, OPERATOR } from './operator';

export interface Clause {
  id: string;
  heading: string;
}

export function LegalPage({
  path,
  crumb,
  title,
  lead,
  clauses,
  children,
}: {
  path: string;
  crumb: string;
  title: string;
  lead: string;
  clauses: Clause[];
  children: React.ReactNode;
}) {
  return (
    <MarketingPage path={path}>
      <section className="relative overflow-hidden pt-28 pb-10 sm:pt-36 sm:pb-12">
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
            <h1 className="mt-6 max-w-3xl font-heading text-[36px] font-semibold leading-[1.06] tracking-tight text-on-surface sm:text-[52px]">
              {title}
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant/75 sm:text-base">
              {lead}
            </p>
          </Reveal>

          <Reveal delay={200}>
            <p className="mt-5 text-[12px] text-on-surface-variant/70">
              Effective <Fact name="effectiveDate" hint="effective date" />
              {OPERATOR.legalName && (
                <>
                  {' · '}
                  <Fact name="legalName" hint="operator" />
                </>
              )}
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 pb-24 sm:pb-32">
        <div className="grid gap-12 lg:grid-cols-[220px_1fr] lg:gap-16">
          <Reveal className="lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="Contents">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant/70">
                Contents
              </h2>
              <ol className="mt-4 space-y-2.5 border-l border-white/8 pl-4">
                {clauses.map((clause, i) => (
                  <li key={clause.id}>
                    <a
                      href={`#${clause.id}`}
                      className="text-sm text-on-surface-variant/75 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                    >
                      <span className="tabular-nums text-on-surface-variant/70">{i + 1}.</span>{' '}
                      {clause.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </Reveal>

          <div className="min-w-0 max-w-3xl">
            <DraftNotice />
            <article>{children}</article>
          </div>
        </div>
      </div>
    </MarketingPage>
  );
}

/** One numbered clause. `index` is supplied by the page so numbering stays visible. */
export function Section({
  id,
  index,
  heading,
  children,
}: {
  id: string;
  index: number;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-white/6 py-9 first:border-t-0 first:pt-0"
    >
      <h2 className="font-heading text-xl font-semibold text-on-surface sm:text-2xl">
        <span className="mr-2 tabular-nums text-primary/70">{index}.</span>
        {heading}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** Body paragraph. */
export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-on-surface-variant/80">{children}</p>;
}

/** Bulleted list of plain strings or nodes. */
export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-on-surface-variant/80">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Definition table for retention periods and similar. */
export function Table({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: [string, string];
  rows: Array<[React.ReactNode, React.ReactNode]>;
}) {
  return (
    <div className="lp-card overflow-hidden">
      <table className="w-full text-left text-sm" aria-label={caption}>
        <thead>
          <tr className="border-b border-white/8">
            {head.map((heading) => (
              <th
                key={heading}
                scope="col"
                className="px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-on-surface-variant/70"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i > 0 ? 'border-t border-white/5' : ''}>
              <th
                scope="row"
                className="px-5 py-3 align-top text-[13px] font-medium leading-relaxed text-on-surface"
              >
                {row[0]}
              </th>
              <td className="px-5 py-3 align-top text-[13px] leading-relaxed text-on-surface-variant/75">
                {row[1]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Callout for something the reader should not miss. */
export function Notice({
  tone = 'primary',
  icon,
  children,
}: {
  tone?: 'primary' | 'coral';
  icon: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === 'coral'
      ? 'border-coral/25 bg-coral/[0.06] text-coral'
      : 'border-primary/20 bg-primary/[0.05] text-primary';
  return (
    <div className={`flex gap-3 rounded-2xl border px-4 py-3 ${styles}`}>
      <span className="material-symbols-outlined shrink-0 text-[18px]" aria-hidden="true">
        {icon}
      </span>
      <div className="text-[14px] leading-relaxed text-on-surface-variant/80">{children}</div>
    </div>
  );
}
