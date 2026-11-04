/**
 * Operator-specific facts for the legal pages.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A privacy notice and terms of use are binding statements made by whoever
 * operates the service. Everything derivable from the source (what the
 * software collects, how long it keeps it, what it deletes) is written into
 * the pages directly and is accurate. Everything that depends on *who is
 * running it* (legal entity, governing law, contact address, which AI
 * providers are configured in that deployment) cannot be derived from code and
 * has deliberately not been invented.
 *
 * Those values live here, and nowhere else. While any value is null, or while
 * REVIEW_STATUS is 'draft', the pages render a prominent draft banner and mark
 * each missing value inline, so an incomplete document cannot quietly go live
 * looking finished.
 *
 * PUBLISHED
 * ---------
 * Published on 4 November 2026 on the instruction of the operator's director
 * (Kim Williams-Fulwood), with every field below filled in. To change a fact,
 * change it here and nowhere else: the pages render from this object.
 *
 * Keep the guard working: if a field ever goes back to null, isPublished()
 * returns false and the draft banner and inline markers come back, which is
 * the intended failure mode. legal.test.tsx fails the build before that can
 * ship, because a draft banner on the Play-declared privacy policy URL is a
 * store policy problem.
 */

import { resolveSupportEmail } from '@aquazerofit/shared';

export interface OperatorFacts {
  /** Legal entity that operates the service, e.g. "AquaZero Pty Ltd". */
  legalName: string | null;
  /** Registered or postal address for legal notices. */
  postalAddress: string | null;
  /** Country/state whose law governs the terms, e.g. "New South Wales, Australia". */
  jurisdiction: string | null;
  /** Where user data is stored and processed, e.g. "Australia (Google Cloud, Sydney)". */
  hostingRegion: string | null;
  /**
   * Where database backups and request logs (which hold IP addresses) are
   * kept. Cloud SQL backups and Cloud Logging buckets default to multi-region
   * or global locations unless configured, so hostingRegion does not imply
   * this. Only someone who has checked both settings can fill it in.
   */
  backupRegion: string | null;
  /** Mailbox for privacy requests and legal notices. */
  privacyEmail: string | null;
  /** Mailbox for general support. */
  supportEmail: string | null;
  /** Response time the operator commits to, e.g. "within 3 business days". */
  supportResponseTime: string | null;
  /**
   * Response time the operator commits to for privacy access, correction and
   * complaint requests, e.g. "within 30 days" (the OAIC's guidance figure for
   * access requests under APP 12).
   */
  privacyResponseTime: string | null;
  /**
   * AI providers configured in THIS deployment. The software supports several
   * and names none at runtime, so only the operator knows which are live.
   * e.g. ['Groq', 'Google Gemini'].
   */
  aiProviders: string[] | null;
  /**
   * Date (written out, e.g. "4 November 2026", because it is rendered into
   * the prose as is) the statements this notice makes about the providers
   * above were last verified against each provider's then-current terms.
   *
   * Provider terms drift, and a claim like "provider X does not train on API
   * data" silently becomes false with nobody noticing unless verification has
   * a date attached. Re-verify and update this whenever a provider is added
   * to or removed from the gateway (see the checklist in
   * apps/api/src/modules/ai/gateway.ts), and whenever a provider revises its
   * data-handling terms. isPublished() refuses to declare the documents
   * finished while this is null, exactly like every other operator fact.
   */
  aiProvidersVerifiedOn: string | null;
  /** Date the current version of the documents takes effect, ISO yyyy-mm-dd. */
  effectiveDate: string | null;
}

// Read verbatim out of the operator chunk of the build currently serving
// https://aquazerofit.com, the deployment that has been publishing these
// documents since the stated effective date. Not invented here, and not
// present in any commit: the live site and this repository had drifted, so a
// build from main rendered every value below as a visible "[operator legal
// name]" placeholder under a "Draft: not yet in force" banner.
//
// That matters because https://aquazerofit.com/privacy is the privacy policy
// URL submitted to Google Play. Shipping the placeholder version would turn a
// compliant listing into a policy violation, via a diff that looks nothing
// like a privacy change.
export const OPERATOR: OperatorFacts = {
  legalName: 'LUMINARA DIGITAL PTY LTD',
  postalAddress: 'Melbourne, VIC 3000, Australia',
  jurisdiction: 'Victoria, Australia',
  // Not from the live build: that said Replit in the United States, which the
  // API left for Cloud Run and Cloud SQL in australia-southeast1
  // (deploy/cloudrun/service.yaml).
  hostingRegion: 'Australia (Google Cloud, Sydney)',
  // The production project's region throughout: Cloud Run, Cloud SQL
  // (aquazerofit:australia-southeast1:azf-pg) and Artifact Registry are all
  // pinned to australia-southeast1 in cloudbuild.yaml (_REGION) and
  // deploy/cloudrun/service.yaml. Cloud SQL backups and the Cloud Logging
  // _Default bucket are configured outside this repository; the commands that
  // confirm and pin both to australia-southeast1 are in
  // docs/play-store/PLAY_CONSOLE_DECLARATIONS_CHECKLIST.md ("Before you
  // submit"). If either is ever moved, change this value in the same change.
  backupRegion: 'Australia (Google Cloud, Sydney, australia-southeast1)',
  privacyEmail: 'info@luminara.digital',
  // One mailbox. SUPPORT_EMAIL overrides it at build time; blank falls through
  // to the address already published for this operator.
  supportEmail: resolveSupportEmail(import.meta.env.SUPPORT_EMAIL),
  supportResponseTime: 'within 3 business days',
  // The operator's commitment, in line with the OAIC's 30-day guidance for
  // APP 12 access requests.
  privacyResponseTime: 'within 30 days',
  // Every third-party provider in PROVIDERS (apps/api/src/modules/ai/
  // providerChain.ts): groq, openai, gemini, nvidia. The fifth entry there,
  // ollama, is a self-hosted model on localhost or an operator-run
  // OLLAMA_BASE_URL and is not a third party. aiProviderDisclosure.test.ts in
  // the API fails when a provider is added there without being named here.
  aiProviders: ['Groq', 'OpenAI', 'Google Gemini', 'NVIDIA NIM'],
  // Verified by the operator against each provider's then-current API terms.
  // Re-verify and update when a provider is added, removed or revises its
  // data-handling terms.
  aiProvidersVerifiedOn: '4 November 2026',
  effectiveDate: '4 August 2026',
};

/**
 * 'published' since 4 November 2026 (director's instruction). Set it back to
 * 'draft' only to take the documents out of force deliberately.
 */
export const REVIEW_STATUS: 'draft' | 'published' = 'published';

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
        Draft: not yet in force
      </p>
      <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
        This document is a working draft. The passages describing what the software does are
        accurate and taken from its source, but the operator details marked in{' '}
        <mark className="rounded bg-coral/15 px-1 text-coral">[this style]</mark> are outstanding,
        and it has not had legal review. It does not yet form an agreement between you and anyone.
      </p>
    </div>
  );
}
