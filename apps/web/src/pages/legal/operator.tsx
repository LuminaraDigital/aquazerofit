/**
 * Operator-specific facts for the legal pages.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A privacy notice and terms of use are binding statements made by whoever
 * operates the service. Everything derivable from the source — what the
 * software collects, how long it keeps it, what it deletes — is written into
 * the pages directly and is accurate. Everything that depends on *who is
 * running it* (legal entity, governing law, contact address, which AI
 * providers are configured in that deployment) cannot be derived from code and
 * has deliberately not been invented.
 *
 * Those values live here as nulls. While any required value is null, or while
 * REVIEW_STATUS is 'draft', the pages render a prominent draft banner and mark
 * each missing value inline, so an incomplete document cannot quietly go live
 * looking finished.
 *
 * TO PUBLISH
 * ----------
 *  1. Fill in every field below.
 *  2. Have a lawyer in the relevant jurisdiction review the pages. This
 *     scaffolding is drafting support, not legal advice.
 *  3. Set REVIEW_STATUS to 'published'.
 */

export interface OperatorFacts {
  /** Legal entity that operates the service, e.g. "AquaZero Pty Ltd". */
  legalName: string | null;
  /** Registered or postal address for legal notices. */
  postalAddress: string | null;
  /** Country/state whose law governs the terms, e.g. "New South Wales, Australia". */
  jurisdiction: string | null;
  /** Where user data is stored and processed, e.g. "Australia (Azure australiaeast)". */
  hostingRegion: string | null;
  /** Mailbox for privacy requests and legal notices. */
  privacyEmail: string | null;
  /** Mailbox for general support. */
  supportEmail: string | null;
  /** Response time the operator commits to, e.g. "within 3 business days". */
  supportResponseTime: string | null;
  /**
   * AI providers configured in THIS deployment. The software supports several
   * and names none at runtime, so only the operator knows which are live.
   * e.g. ['Groq', 'Google Gemini'].
   */
  aiProviders: string[] | null;
  /** Date the current version of the documents takes effect, ISO yyyy-mm-dd. */
  effectiveDate: string | null;
}

export const OPERATOR: OperatorFacts = {
  legalName: null,
  postalAddress: null,
  jurisdiction: null,
  hostingRegion: null,
  privacyEmail: null,
  supportEmail: null,
  supportResponseTime: null,
  aiProviders: null,
  effectiveDate: null,
};

/**
 * Flip to 'published' only after every field above is filled AND the documents
 * have had legal review.
 */
export const REVIEW_STATUS: 'draft' | 'published' = 'draft';

/** True when the documents are safe to present as finished. */
export function isPublished(): boolean {
  return (
    REVIEW_STATUS === 'published' &&
    Object.values(OPERATOR).every((value) =>
      Array.isArray(value) ? value.length > 0 : value !== null,
    )
  );
}

/**
 * Renders an operator fact, or a visibly unfinished marker when it is missing.
 * The marker is deliberately conspicuous: a legal page with a silent blank in
 * it is worse than one that admits the blank.
 */
export function Fact({ name, hint }: { name: keyof OperatorFacts; hint: string }) {
  const value = OPERATOR[name];
  const text = Array.isArray(value) ? value.join(', ') : value;

  if (text) return <>{text}</>;

  return (
    <mark className="rounded bg-coral/15 px-1.5 py-0.5 text-[0.95em] font-semibold text-coral">
      [{hint}]
    </mark>
  );
}

/** Banner shown on every legal page until the documents are complete. */
export function DraftNotice() {
  if (isPublished()) return null;

  return (
    <div
      role="note"
      className="mb-10 rounded-card border border-coral/30 bg-coral/[0.07] px-5 py-4"
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-coral">
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          draft
        </span>
        Draft — not yet in force
      </p>
      <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/80">
        This document is a working draft. The passages describing what the software does are
        accurate and taken from its source, but the operator details marked in{' '}
        <mark className="rounded bg-coral/15 px-1 text-coral">[this style]</mark> are outstanding,
        and it has not had legal review. It does not yet form an agreement between you and anyone.
      </p>
    </div>
  );
}
