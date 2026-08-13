/**
 * /safety — the dedicated safety and data-handling page, linked from the footer.
 *
 * Scope: how the product is built so the dangerous outcomes cannot occur —
 * invariants, the deterministic maths, what happens to a meal photograph, and
 * the security posture underneath. The coach's own guardrails live on
 * /aqua-coach and are summarised rather than repeated here.
 *
 * MAINTENANCE: figures available in @aquazerofit/shared are imported. The
 * server-side numbers (token lifetimes, rate limits, bcrypt cost, sweep
 * interval) live in apps/api and cannot be imported into the browser bundle,
 * so they are transcribed — if you change them in apps/api/src/platform/config
 * or the rate limiter, change them here in the same commit.
 */
import { Link } from 'react-router-dom';
import {
  KCAL_FLOOR,
  MEAL_PHOTO_MAX_BYTES,
  MEAL_PHOTO_MIME,
  SOURCE_CODE_URL,
  WELLNESS_DISCLAIMER,
} from '@aquazerofit/shared';
import { Bullet, MarketingPage, PageCta, PageHero, Spec } from './Page';
import { Reveal } from './motion';

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const INVARIANTS = [
  {
    icon: 'function',
    title: 'Code calculates, models describe',
    body: 'Every figure presented as fact — calorie targets, macro splits, meal totals, trends — is produced by deterministic arithmetic. A language model never generates a number you are shown as truth.',
    enforced: 'Target calculator and nutrition totals are pure functions with unit tests.',
  },
  {
    icon: 'shield',
    title: 'Floors are enforced, and disclosed',
    body: 'Targets are clamped to a calorie floor. When the clamp binds, the app says so on screen instead of presenting the adjusted number as if it were the computed one.',
    enforced: 'Clamp and advisory are asserted in the target calculator suite.',
  },
  {
    icon: 'task_alt',
    title: 'Nothing writes itself into your day',
    body: 'A photo analysis is a proposal. It stays a proposal until you confirm it, and every item and portion is editable first.',
    enforced: 'The confirm step is a separate endpoint; analysis alone mutates no log.',
  },
  {
    icon: 'medical_information',
    title: 'Clinical questions are refused',
    body: 'Diagnosis, medication, test results, treatment and rehabilitation are declined. So are crisis conversations, which receive a signpost to real support rather than an improvised answer.',
    enforced: 'A deterministic classifier screens input before generation and output after it.',
  },
  {
    icon: 'lock',
    title: 'Personalisation waits for consent',
    body: 'AI personalisation is off until you turn it on. Facts the coach infers are suggestions until you confirm them, and anything remembered can be removed.',
    enforced: 'Consent is a stored flag checked before remembered context is assembled.',
  },
  {
    icon: 'receipt_long',
    title: 'Usage is an append-only ledger',
    body: 'Credit balances are derived by folding an immutable transaction log rather than stored as a mutable number, so a balance cannot be quietly rewritten.',
    enforced: 'Balance is a fold over transactions; there is no setter to call.',
  },
];

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function Section({
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/80">
          {eyebrow}
        </p>
        <h2 className="mt-3 font-heading text-3xl font-semibold leading-[1.1] text-on-surface sm:text-[38px]">
          {title}
        </h2>
        {lead && (
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant/75">
            {lead}
          </p>
        )}
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function SafetyPage() {
  const mib = Math.round(MEAL_PHOTO_MAX_BYTES / (1024 * 1024));
  const formats = MEAL_PHOTO_MIME.map((m) => m.replace('image/', '').toUpperCase()).join(', ');

  return (
    <MarketingPage path="/safety">
      <PageHero
        crumb="Safety"
        title={
          <>
            Built so the dangerous parts <span className="lp-gradient-text">cannot happen</span>
          </>
        }
        lead="A wellness app can hurt someone in a handful of specific ways: by inventing a number, by proposing a target that starves them, by answering a medical question it has no business answering, or by leaking what it knows. Each of those has a mechanism below, and each mechanism is in code rather than in a policy document."
        secondary={{ to: '/aqua-coach', label: 'The coach’s guardrails' }}
      />

      <div className="mx-auto max-w-6xl space-y-24 px-5 pb-24 sm:space-y-28 sm:pb-32">
        {/* ---------------------------------------------------------- */}
        <Section
          id="invariants"
          eyebrow="Invariants"
          title="Six things that hold in every build"
          lead="Not aspirations. Each of these is enforced somewhere specific and covered by the test suite — a build that breaks one does not ship."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INVARIANTS.map((item, i) => (
              <Reveal key={item.title} delay={(i % 3) * 90}>
                <div className="lp-card flex h-full flex-col p-6">
                  <span
                    className="material-symbols-outlined text-[22px] text-primary"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <h3 className="mt-4 font-heading text-lg font-semibold text-on-surface">
                    {item.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-on-surface-variant/75">
                    {item.body}
                  </p>
                  <p className="mt-4 border-t border-white/6 pt-3 text-[12px] leading-relaxed text-on-surface-variant/70">
                    <span className="font-semibold uppercase tracking-[0.14em] text-secondary">
                      Enforced by
                    </span>
                    <br />
                    {item.enforced}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="numbers"
          eyebrow="The numbers"
          title="Where a target comes from, and where it stops"
          lead="The calorie floor is the single most safety-relevant number in the product, because a target below it is the failure mode that matters. It is applied in two directions: nothing is proposed beneath it, and nothing generated is allowed to prescribe beneath it either."
        >
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Spec
              rows={[
                ['Calorie floor — female', `${KCAL_FLOOR.female.toLocaleString()} kcal`],
                ['Calorie floor — male', `${KCAL_FLOOR.male.toLocaleString()} kcal`],
                ['Calorie floor — unspecified', `${KCAL_FLOOR.unspecified.toLocaleString()} kcal`],
              ]}
              caption="Read from the same constants the target calculator uses. When a clamp binds, the advisory is shown with the target — not instead of it."
            />

            <div className="lp-card p-6">
              <h3 className="font-heading text-lg font-semibold text-on-surface">
                The output is checked too
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                Generated text is scanned before it reaches you for numeric claims that break the
                floor or basic macro sanity. The rule distinguishes a model <em>prescribing</em> a
                sub-floor intake from a routine readout — &quot;you have around 1,135 kcal
                left&quot; is normal most evenings, and treating it as advice would have blocked
                ordinary answers.
              </p>
              <Link
                to="/features#targets"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                Every formula and constant
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="allergens"
          eyebrow="Allergens"
          title="Exclusion, not preference"
          lead="An allergen is not a taste. The filter that applies them runs in code after generation, and it is deliberately biased: it would rather reject a safe suggestion than let an unsafe one through."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="lp-card p-6">
              <ul className="space-y-4">
                <Bullet title="Applied after generation">
                  Whatever a model proposes, the filter is the last thing to run before you see a
                  suggestion or a plan.
                </Bullet>
                <Bullet title="Tuned against false negatives">
                  Over-blocking is an inconvenience. Under-blocking is a hospital visit. The
                  threshold is set accordingly.
                </Bullet>
              </ul>
            </div>
            <div className="lp-card p-6">
              <ul className="space-y-4">
                <Bullet title="Declared once, applied everywhere">
                  Meal suggestions, generated plans and recipes all pass the same filter — there is
                  no path around it.
                </Bullet>
                <Bullet title="Not a substitute for reading the label">
                  The filter works from the data it has. For a severe allergy, the packet in your
                  hand is still the authority.
                </Bullet>
              </ul>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="data"
          eyebrow="Your data"
          title="What happens to a photograph of your dinner"
          lead="Meal photos are health-adjacent personal data taken with a device that knows where you live. The upload path treats them that way."
        >
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="lp-card p-6">
              <ul className="space-y-4">
                <Bullet title="Metadata is discarded on arrival">
                  EXIF, XMP, IPTC and ICC blocks are dropped by re-encoding the image — a phone
                  photo carries GPS at home-address precision, the capture time and the camera
                  serial, and none of it may land on disk beside a health record.
                </Bullet>
                <Bullet title="The declared type is not trusted">
                  A multipart mimetype is set by the client and proves nothing. The file must
                  actually decode as an image, or it is rejected rather than stored and later served
                  as one.
                </Bullet>
                <Bullet title="Stored unguessably, never served publicly">
                  Files are written under an unguessable name and are not exposed on a public path.
                </Bullet>
                <Bullet title="Swept, not archived">
                  Photos and their job records are deleted within a day of the job reaching a
                  terminal state. A failed job&apos;s photo goes immediately.
                </Bullet>
              </ul>
            </div>

            <div className="space-y-4">
              <Spec
                rows={[
                  ['Maximum upload', `${mib} MB`],
                  ['Accepted formats', formats],
                  ['Retention after analysis', 'swept within 24 hours'],
                  ['Retention after failure', 'deleted immediately'],
                ]}
                caption="Asserted against the bytes the API actually persisted, not against what the upload handler reports."
              />
              <div className="lp-card p-6">
                <h3 className="font-heading text-lg font-semibold text-on-surface">
                  Audit records identify you by hash
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                  Security events are recorded so abuse can be investigated, but the raw email
                  address never lands in the audit container — the identifier is stored hashed,
                  re-identifiable only by someone who already knows the address they are looking
                  for.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="security"
          eyebrow="Security"
          title="The unglamorous layer"
          lead="None of this is visible in the product, which is rather the point. These are the server-side settings the application runs with."
        >
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Spec
              rows={[
                ['Access token lifetime', '15 minutes'],
                ['Refresh token lifetime', '30 days, rotated on use'],
                ['Password hashing', 'bcrypt, cost 10'],
                ['Failed sign-in throttle', 'per account and IP, 1 hour window'],
              ]}
              caption="Sign-in failures are counted per account and per network, so a spray across many accounts is throttled as readily as a run at one."
            />
            <Spec
              rows={[
                ['General request limit', '300 per minute'],
                ['Model-calling endpoints', '20 per minute'],
                ['Limit applied', 'per user and per IP'],
                ['On exceeding', '429 with Retry-After'],
              ]}
              caption="Model-calling surfaces — chat and meal photos — get the stricter lane, because they are the ones that cost money as well as capacity."
            />
          </div>

          <div className="mt-4 lp-card p-6">
            <h3 className="font-heading text-lg font-semibold text-on-surface">
              Guardrail decisions are recorded
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-on-surface-variant/75">
              Every refusal — inbound classification and outbound block alike — writes an audit
              entry with its category and reason. That is what makes it possible to answer &quot;is
              the classifier actually firing?&quot; with evidence rather than confidence.
            </p>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="limits"
          eyebrow="Limits"
          title="What this is not"
          lead="The honest half of a safety page is the part that says where the guarantees end."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="lp-card border-l-2 border-l-coral p-6">
              <h3 className="font-heading text-lg font-semibold text-on-surface">
                Not a medical device
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                {WELLNESS_DISCLAIMER} If you are managing a condition, pregnant, or under clinical
                care, the person treating you outranks anything here.
              </p>
            </div>
            <div className="lp-card p-6">
              <h3 className="font-heading text-lg font-semibold text-on-surface">
                Estimates are estimates
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                A photograph cannot weigh your dinner. Portion estimates carry real error, which is
                exactly why they arrive as an editable proposal rather than a fact — and why the
                trend over weeks is more trustworthy than any single entry.
              </p>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="openness"
          eyebrow="Openness"
          title="You do not have to take our word for it"
          lead="Everything on this page is a claim about code you can read. That is the strongest form of assurance a small product can honestly offer."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lp-card p-6">
              <h3 className="font-heading text-lg font-semibold text-on-surface">
                Read the source
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                AquaZeroFit is free software under the GNU AGPL v3. The classifier, the target
                calculator and the upload path are all open to inspection.
              </p>
              <a
                href={SOURCE_CODE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                Browse the repository
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_outward
                </span>
              </a>
            </div>

            <div className="lp-card p-6">
              <h3 className="font-heading text-lg font-semibold text-on-surface">
                Report a vulnerability
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                Security issues go through GitHub&apos;s private vulnerability reporting, not a
                public issue. The policy sets out scope and what to expect.
              </p>
              <a
                href={`${SOURCE_CODE_URL}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                Security policy
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_outward
                </span>
              </a>
            </div>

            <div className="lp-card p-6">
              <h3 className="font-heading text-lg font-semibold text-on-surface">
                Known trade-offs, in writing
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                The security policy carries a section on accepted trade-offs — the things we know
                about and have decided to live with. A safety page that lists only strengths is
                marketing.
              </p>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <PageCta
          title="Safe by construction, not by promise"
          lead="Build a profile and the first thing you get is a number you can check by hand — which is the whole idea."
          disclaimer={WELLNESS_DISCLAIMER}
        />
      </div>
    </MarketingPage>
  );
}
