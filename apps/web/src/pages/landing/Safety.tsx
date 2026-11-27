/**
 * /safety — Formal Audit Dossier: still code-enforced firewall schematic,
 * verification ledger (INV-01..06), 3-floor calorie clamp simulator, and
 * authentic Pixel 9 Pro EXIF byte inspection.
 *
 * Reuses `PageSection` from `Page.tsx` and preserves every section ID, spec
 * row, limit disclosure, and security link asserted in `Safety.test.tsx`.
 */
import { Link } from 'react-router-dom';
import {
  KCAL_FLOOR,
  MEAL_PHOTO_MAX_BYTES,
  MEAL_PHOTO_MIME,
  SOURCE_CODE_URL,
  WELLNESS_DISCLAIMER,
} from '@aquazerofit/shared';
import { Bullet, MarketingPage, PageCta, PageHero, PageSection, Spec } from './Page';
import {
  CalorieFloorSimulator,
  ExifStripperDiff,
  SafetyFirewallDiagram,
} from './scene/SafetyInteractive';

const INVARIANTS = [
  {
    code: 'INV-01',
    title: 'Code calculates, models describe',
    body: 'Every figure presented as fact - calorie targets, macro splits, meal totals, trends - is produced by deterministic arithmetic. A language model never generates a number you are shown as truth.',
    enforced: 'Target calculator and nutrition totals are pure functions with unit tests.',
  },
  {
    code: 'INV-02',
    title: 'Floors are enforced, and disclosed',
    body: 'Targets are clamped to a calorie floor. When the clamp binds, the app says so on screen instead of presenting the adjusted number as if it were the computed one.',
    enforced: 'Clamp and advisory are asserted in the target calculator suite.',
  },
  {
    code: 'INV-03',
    title: 'Nothing writes itself into your day',
    body: 'A photo analysis is a proposal. It stays a proposal until you confirm it, and every item and portion is editable first.',
    enforced: 'The confirm step is a separate endpoint; analysis alone mutates no log.',
  },
  {
    code: 'INV-04',
    title: 'Clinical questions are refused',
    body: 'Diagnosis, medication, test results, treatment and rehabilitation are declined. So are crisis conversations, which receive a signpost to real support rather than an improvised answer.',
    enforced: 'A deterministic classifier screens input before generation and output after it.',
  },
  {
    code: 'INV-05',
    title: 'Personalisation waits for consent',
    body: 'AI personalisation is off until you turn it on. Facts the coach infers are suggestions until you confirm them, and anything remembered can be removed.',
    enforced: 'Consent is a stored flag checked before remembered context is assembled.',
  },
  {
    code: 'INV-06',
    title: 'Usage is an append-only ledger',
    body: 'Credit balances are derived by folding an immutable transaction log rather than stored as a mutable number, so a balance cannot be quietly rewritten.',
    enforced: 'Balance is a fold over transactions; there is no setter to call.',
  },
];

export default function SafetyPage() {
  const mib = Math.round(MEAL_PHOTO_MAX_BYTES / (1024 * 1024));
  const formats = MEAL_PHOTO_MIME.map((m) => m.replace('image/', '').toUpperCase()).join(', ');

  return (
    <MarketingPage path="/safety">
      <PageHero
        crumb="Safety"
        kicker="Release-gated invariants"
        title="Built so the dangerous parts cannot happen"
        lead="A wellness app can hurt someone in a handful of specific ways: by inventing a number, by proposing a target that starves them, by answering a medical question it has no business answering, or by leaking what it knows. Each mechanism lives in code rather than in a policy document."
        secondary={{ to: '/aqua-coach', label: 'The coach’s guardrails' }}
        aside={<SafetyFirewallDiagram />}
      />

      <div className="mx-auto max-w-[1200px] space-y-24 px-5 pb-24 sm:space-y-28 sm:px-8 sm:pb-32">
        <PageSection
          id="invariants"
          eyebrow="Invariants"
          title="Six things that hold in every build"
          lead="Not aspirations. Each of these is enforced somewhere specific and covered by the test suite - a build that breaks one does not ship."
        >
          <dl className="grid gap-x-12 border-b border-outline-variant/60 md:grid-cols-2">
            {INVARIANTS.map((item) => (
              <div key={item.title} className="border-t border-outline-variant/60 py-6">
                <dt className="flex items-baseline justify-between gap-3">
                  <span className="font-heading text-[24px] font-semibold leading-tight text-on-surface">
                    {item.title}
                  </span>
                  <span className="shrink-0 stat-label text-primary">{item.code}</span>
                </dt>
                <dd className="mt-2.5 text-[15px] leading-relaxed text-on-surface-variant">
                  {item.body}
                </dd>
                <dd className="mt-3 flex flex-wrap items-baseline gap-2 text-[13px] text-on-surface">
                  <span className="shrink-0 stat-label text-secondary">Enforced by</span>
                  <span className="text-on-surface-variant">{item.enforced}</span>
                </dd>
              </div>
            ))}
          </dl>
        </PageSection>

        <PageSection
          id="numbers"
          eyebrow="The numbers"
          title="Where a target comes from, and where it stops"
          lead="The calorie floor is the single most safety-relevant number in the product, because a target below it is the failure mode that matters. Drag the simulator to test the clamp."
        >
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <CalorieFloorSimulator />

            <div className="space-y-5">
              <Spec
                rows={[
                  ['Calorie floor - female', `${KCAL_FLOOR.female.toLocaleString()} kcal`],
                  ['Calorie floor - male', `${KCAL_FLOOR.male.toLocaleString()} kcal`],
                  ['Calorie floor - unspecified', `${KCAL_FLOOR.unspecified.toLocaleString()} kcal`],
                ]}
                caption="Read from the same constants the target calculator uses. When a clamp binds, the advisory is shown with the target - not instead of it."
              />

              <div className="lp-card p-6">
                <h3 className="font-heading text-[20px] font-semibold text-on-surface">
                  The output is checked too
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-on-surface-variant">
                  Generated text is scanned before it reaches you for numeric claims that break the
                  floor or basic macro sanity. The rule distinguishes a model <em>prescribing</em> a
                  sub-floor intake from a routine readout - &quot;you have around 1,135 kcal
                  left&quot; is normal most evenings, and treating it as advice would have blocked
                  ordinary answers.
                </p>
                <Link
                  to="/features#targets"
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-[14.5px] font-semibold text-primary transition-colors hover:text-on-surface"
                >
                  Every formula and constant
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </PageSection>

        <PageSection
          id="allergens"
          eyebrow="Allergens"
          title="Exclusion, not preference"
          lead="An allergen is not a taste. The filter that applies them runs in code after generation, and it is deliberately biased: it would rather reject a safe suggestion than let an unsafe one through."
        >
          <div className="grid gap-px overflow-hidden rounded-card border border-outline-variant/75 bg-outline-variant/60 sm:grid-cols-2">
            <div className="bg-surface-container-low p-6">
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
            <div className="bg-surface-container-low p-6">
              <ul className="space-y-4">
                <Bullet title="Declared once, applied everywhere">
                  Meal suggestions, generated plans and recipes all pass the same filter - there is
                  no path around it.
                </Bullet>
                <Bullet title="Not a substitute for reading the label">
                  The filter works from the data it has. For a severe allergy, the packet in your
                  hand is still the authority.
                </Bullet>
              </ul>
            </div>
          </div>
        </PageSection>

        <PageSection
          id="data"
          eyebrow="Your data"
          title="What happens to a photograph of your dinner"
          lead="Meal photos are health-adjacent personal data taken with a device that knows where you live. Toggle the inspector to see what survives upload."
        >
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <div className="space-y-5">
              <ExifStripperDiff />
              <Spec
                rows={[
                  ['Maximum upload', `${mib} MB`],
                  ['Accepted formats', formats],
                  ['Retention after analysis', 'swept within 24 hours'],
                  ['Retention after failure', 'deleted immediately'],
                ]}
                caption="Asserted against the bytes the API actually persisted, not against what the upload handler reports."
              />
            </div>

            <div className="space-y-5">
              <div className="lp-card p-6">
                <ul className="space-y-4">
                  <Bullet title="Metadata is discarded on arrival">
                    EXIF, XMP, IPTC and ICC blocks are dropped by re-encoding the image - a phone
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

              <div className="lp-card p-6">
                <h3 className="font-heading text-[20px] font-semibold text-on-surface">
                  Audit records identify you by hash
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-on-surface-variant">
                  Security events are recorded so abuse can be investigated, but the raw email
                  address never lands in the audit container - the identifier is stored hashed,
                  re-identifiable only by someone who already knows the address they are looking
                  for.
                </p>
              </div>
            </div>
          </div>
        </PageSection>

        <PageSection
          id="security"
          eyebrow="Security"
          title="The unglamorous layer"
          lead="None of this is visible in the product, which is rather the point. These are the server-side settings the application runs with."
        >
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Spec
              rows={[
                ['Access token lifetime', '15 minutes'],
                ['Refresh token lifetime', '30 days, rotated on use'],
                ['Password hashing', 'bcrypt, cost 12'],
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
              caption="Model-calling surfaces - chat and meal photos - get the stricter lane, because they are the ones that cost money as well as capacity."
            />
          </div>

          <div className="mt-5 lp-card p-6">
            <h3 className="font-heading text-[20px] font-semibold text-on-surface">
              Guardrail decisions are recorded
            </h3>
            <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-on-surface-variant">
              Every refusal - inbound classification and outbound block alike - writes an audit
              entry with its category and reason. That is what makes it possible to answer &quot;is
              the classifier actually firing?&quot; with evidence rather than confidence.
            </p>
          </div>
        </PageSection>

        <PageSection
          id="limits"
          eyebrow="Limits"
          title="What this is not"
          lead="The honest half of a safety page is the part that says where the guarantees end."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="lp-card border-l-2 border-l-coral p-6">
              <h3 className="font-heading text-[20px] font-semibold text-on-surface">
                Not a medical device
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-on-surface-variant">
                {WELLNESS_DISCLAIMER} If you are managing a condition, pregnant, or under clinical
                care, the person treating you outranks anything here.
              </p>
            </div>
            <div className="lp-card p-6">
              <h3 className="font-heading text-[20px] font-semibold text-on-surface">
                Estimates are estimates
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-on-surface-variant">
                A photograph cannot weigh your dinner. Portion estimates carry real error, which is
                exactly why they arrive as an editable proposal rather than a fact - and why the
                trend over weeks is more trustworthy than any single entry.
              </p>
            </div>
          </div>
        </PageSection>

        <PageSection
          id="openness"
          eyebrow="Openness"
          title="You do not have to take our word for it"
          lead="Everything on this page is a claim about code you can read. That is the strongest form of assurance a small product can honestly offer."
        >
          <div className="grid gap-x-10 border-y border-outline-variant/60 lg:grid-cols-3">
            <div className="border-t border-outline-variant/60 py-6 first:border-t-0 lg:border-t-0">
              <h3 className="font-heading text-[22px] font-semibold text-on-surface">
                Read the source
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-on-surface-variant">
                AquaZeroFit is free software under the GNU AGPL v3. The classifier, the target
                calculator and the upload path are all open to inspection.
              </p>
              <a
                href={SOURCE_CODE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex min-h-[44px] items-center gap-2 text-[14.5px] font-semibold text-primary transition-colors hover:text-on-surface"
              >
                Browse the repository
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_outward
                </span>
              </a>
            </div>

            <div className="border-t border-outline-variant/60 py-6 lg:border-t-0">
              <h3 className="font-heading text-[22px] font-semibold text-on-surface">
                Report a vulnerability
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-on-surface-variant">
                Security issues go through GitHub&apos;s private vulnerability reporting, not a
                public issue. The policy sets out scope and what to expect.
              </p>
              <a
                href={`${SOURCE_CODE_URL}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex min-h-[44px] items-center gap-2 text-[14.5px] font-semibold text-primary transition-colors hover:text-on-surface"
              >
                Security policy
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_outward
                </span>
              </a>
            </div>

            <div className="border-t border-outline-variant/60 py-6 lg:border-t-0">
              <h3 className="font-heading text-[22px] font-semibold text-on-surface">
                Known trade-offs, in writing
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-on-surface-variant">
                The security policy carries a section on accepted trade-offs - the things we know
                about and have decided to live with. A safety page that lists only strengths is
                marketing.
              </p>
            </div>
          </div>
        </PageSection>

        <PageCta
          title="Safe by construction, not by promise"
          lead="Build a profile and the first thing you get is a number you can check by hand - which is the whole idea."
          disclaimer={WELLNESS_DISCLAIMER}
        />
      </div>
    </MarketingPage>
  );
}
