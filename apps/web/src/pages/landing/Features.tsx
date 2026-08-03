/**
 * /features — the dedicated feature page linked from the footer.
 *
 * This exists to go deeper than the landing page's summary, not to restate it:
 * the numbers below are imported from @aquazerofit/shared and rendered, not
 * transcribed. If a safety constant changes — a calorie floor, a memory cap, a
 * credit cost — this page changes with it in the same commit, and cannot
 * quietly become a page of stale marketing claims.
 */
import {
  ACTIVITY_FACTORS,
  CREDIT_COSTS,
  FAT_KCAL_FRACTION_MIN,
  FORMULA_VERSION,
  FREE_TIER_DAILY_CREDITS,
  KCAL_FLOOR,
  KCAL_PER_KG,
  MEAL_PHOTO_MAX_BYTES,
  MEAL_PHOTO_MIME,
  MEMORY_FACT_MAX_CHARS,
  MEMORY_MAX_FACTS_CONFIRMED,
  MEMORY_MAX_FACTS_SUGGESTED,
  MEMORY_REJECTED_RETENTION_DAYS,
  PROTEIN_G_PER_KG,
  RANGES,
  SOURCE_CODE_URL,
  WATER_ML_MAX,
  WATER_ML_MIN,
  WATER_ML_PER_KG,
  WEEKLY_LOSS_FRACTION,
  WELLNESS_DISCLAIMER,
} from '@aquazerofit/shared';
import { DeviceFrame } from './PhoneShowcase';
import { Bullet, MarketingPage, PageCta, PageHero, Spec } from './Page';
import { Reveal } from './motion';

const SECTIONS = [
  { id: 'nutrition', label: 'Nutrition & logging' },
  { id: 'targets', label: 'Targets & the maths' },
  { id: 'training', label: 'Training' },
  { id: 'coach', label: 'Aqua Coach' },
  { id: 'progress', label: 'Progress' },
  { id: 'platform', label: 'Platform & licence' },
];

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function Block({
  id,
  eyebrow,
  title,
  lead,
  screenshot,
  alt,
  flip = false,
  children,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  lead: string;
  screenshot?: string;
  alt?: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div
        className={`grid items-start gap-10 ${
          screenshot ? 'lg:grid-cols-[1fr_300px] lg:gap-16' : ''
        }`}
      >
        <Reveal className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/80">
            {eyebrow}
          </p>
          <h2 className="mt-3 font-heading text-3xl font-semibold leading-[1.1] text-on-surface sm:text-[38px]">
            {title}
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant/75">
            {lead}
          </p>
          <div className="mt-8">{children}</div>
        </Reveal>

        {screenshot && (
          <Reveal delay={120} className={flip ? 'lg:order-first' : ''}>
            <div className="relative mx-auto w-[260px] sm:w-[300px]">
              <div
                className="pointer-events-none absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(47,217,244,0.14),transparent_65%)] blur-2xl"
                aria-hidden="true"
              />
              <div className="relative">
                <DeviceFrame id={screenshot} alt={alt ?? ''} />
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function FeaturesPage() {
  const mib = Math.round(MEAL_PHOTO_MAX_BYTES / (1024 * 1024));
  const formats = MEAL_PHOTO_MIME.map((m) => m.replace('image/', '').toUpperCase()).join(', ');

  return (
    <MarketingPage documentTitle="Features — AquaZeroFit">
      <PageHero
        crumb="Features"
        title={
          <>
            Every feature, and <span className="lp-gradient-text">how it actually works</span>
          </>
        }
        lead="The short version is on the home page. This is the long one — including the formulas, the limits and the constants your targets are computed from. The figures below are read straight out of the application's source at build time, so this page cannot drift from the software."
        secondary={{ to: '/landing', label: 'Back to overview' }}
      />

      <div className="mx-auto max-w-6xl px-5 pb-24 sm:pb-32">
        <div className="grid gap-12 lg:grid-cols-[200px_1fr] lg:gap-16">
          {/* On-this-page rail */}
          <Reveal className="lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="On this page">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant/70">
                On this page
              </h2>
              <ul className="mt-4 space-y-2.5 border-l border-white/8 pl-4">
                {SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-sm text-on-surface-variant/75 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </Reveal>

          <div className="min-w-0 space-y-24 sm:space-y-28">
            {/* -------------------------------------------------- */}
            <Block
              id="nutrition"
              eyebrow="Nutrition"
              title="Log a day without doing arithmetic"
              lead="Three ways in — camera, search, barcode — and one rule holding all of them together: a model may propose what you ate, but the totals are multiplied out in code."
              screenshot="nutrition"
              alt="The nutrition day view: calorie ring, macro targets, and each meal of the day with its entries."
            >
              <ul className="space-y-4">
                <Bullet title="Photograph the plate">
                  Upload up to {mib} MB ({formats}). The analysis runs as a background job, so you
                  can close the screen and come back to it.
                </Bullet>
                <Bullet title="Nothing is logged without you">
                  The result arrives as a proposal. Every item and portion is editable, and the day
                  only changes when you confirm.
                </Bullet>
                <Bullet title="Your photo does not linger">
                  EXIF, XMP, IPTC and ICC metadata are discarded on upload — a phone photo carries
                  GPS at home-address precision — the file is stored under an unguessable name,
                  never served publicly, and swept within a day of the job finishing. A failed
                  job&apos;s photo is deleted immediately.
                </Bullet>
                <Bullet title="Search and barcodes">
                  A food corpus you can search by name, plus barcode scanning for packaged products,
                  both resolving to the same per-100 g values the maths uses.
                </Bullet>
                <Bullet title="Allergen exclusion is deterministic">
                  Suggestions and plans pass a code filter after generation, tuned to admit false
                  positives rather than ever miss a declared allergen.
                </Bullet>
              </ul>
            </Block>

            {/* -------------------------------------------------- */}
            <Block
              id="targets"
              eyebrow="Targets"
              title="The maths, in full"
              lead={`Basal metabolic rate comes from Mifflin-St Jeor (${FORMULA_VERSION}), multiplied by an activity factor and adjusted by a bounded rate of change. No model participates. You can check every number below with a calculator.`}
            >
              <div className="space-y-4">
                <Spec
                  rows={Object.entries(ACTIVITY_FACTORS).map(([key, value]) => [
                    key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
                    `× ${value}`,
                  ])}
                  caption="Activity multiplier applied to basal metabolic rate to reach maintenance energy."
                />

                <Spec
                  rows={[
                    [
                      'Weekly rate of change',
                      `${WEEKLY_LOSS_FRACTION.min * 100}–${WEEKLY_LOSS_FRACTION.max * 100}% of bodyweight`,
                    ],
                    ['Energy per kg of bodyweight', `${KCAL_PER_KG.toLocaleString()} kcal`],
                    /* One decimal throughout: 2.0 beside 1.6 and 2.2 reads
                           as a considered figure; a bare 2 reads as a typo. */
                    ['Protein — losing', `${PROTEIN_G_PER_KG.lose.toFixed(1)} g/kg`],
                    ['Protein — maintaining', `${PROTEIN_G_PER_KG.maintain.toFixed(1)} g/kg`],
                    ['Protein — gaining', `${PROTEIN_G_PER_KG.gain.toFixed(1)} g/kg`],
                    ['Fat, minimum share of energy', `${FAT_KCAL_FRACTION_MIN * 100}%`],
                  ]}
                  caption="Carbohydrate fills whatever energy remains once protein and fat are set."
                />

                <Spec
                  rows={[
                    ['Calorie floor — female', `${KCAL_FLOOR.female.toLocaleString()} kcal`],
                    ['Calorie floor — male', `${KCAL_FLOOR.male.toLocaleString()} kcal`],
                    [
                      'Calorie floor — unspecified',
                      `${KCAL_FLOOR.unspecified.toLocaleString()} kcal`,
                    ],
                  ]}
                  caption="A target is never proposed below its floor. When the clamp binds, the app says so on screen rather than showing a silently adjusted number."
                />

                <Spec
                  rows={[
                    ['Hydration', `${WATER_ML_PER_KG} ml per kg of bodyweight`],
                    [
                      'Clamped to',
                      `${(WATER_ML_MIN / 1000).toFixed(1)}–${(WATER_ML_MAX / 1000).toFixed(1)} L per day`,
                    ],
                    ['Accepted weight', `${RANGES.weightKg.min}–${RANGES.weightKg.max} kg`],
                    ['Accepted height', `${RANGES.heightCm.min}–${RANGES.heightCm.max} cm`],
                    ['Accepted age', `${RANGES.age.min}–${RANGES.age.max} years`],
                  ]}
                  caption="Inputs outside these ranges are rejected at the boundary rather than quietly coerced."
                />
              </div>
            </Block>

            {/* -------------------------------------------------- */}
            <Block
              id="training"
              eyebrow="Training"
              title="Home training that respects your kit"
              lead="Plans are assembled from an openly licensed exercise corpus and filtered to the equipment you own, so nothing in your week assumes a gym you do not have."
              screenshot="workouts"
              alt="The workout library: the training week, a rest-day card, and exercises filtered by type, muscle group and equipment."
              flip
            >
              <ul className="space-y-4">
                <Bullet title="Filtered to what you own">
                  Choose your equipment once. Bodyweight-only is a first-class answer, not a
                  degraded one.
                </Bullet>
                <Bullet title="Plans that move with you">
                  A generated plan is adjusted as your logged sessions and weight change, rather
                  than being a fixed PDF you fall behind.
                </Bullet>
                <Bullet title="Attribution kept intact">
                  Exercises carry their CC BY-SA licence, author and source link — visible in the
                  app, as the licence requires.
                </Bullet>
                <Bullet title="Generated illustrations are labelled">
                  Where an exercise image was produced by a model rather than photographed, the app
                  discloses it on the card instead of passing it off.
                </Bullet>
              </ul>
            </Block>

            {/* -------------------------------------------------- */}
            <Block
              id="coach"
              eyebrow="Aqua Coach"
              title="A coach with your day in front of it"
              lead="Each reply is generated against the context you have actually logged — today's nutrition, the session on your plan, your progress summary — and both the question and the answer pass a safety classifier before you see anything."
              screenshot="coach"
              alt="Aqua Coach quoting today's logged calories, protein, carbs, fat and water above the persistent wellness disclaimer."
            >
              <ul className="space-y-4">
                <Bullet title="Grounded, not generic">
                  Nutrition totals, the current plan and recent progress are supplied as context, so
                  &quot;how am I tracking?&quot; has a real answer.
                </Bullet>
                <Bullet title="It refuses, and signposts">
                  Diagnosis, treatment, dosage, crisis and extreme-diet requests are declined with a
                  supportive pointer to real help, not an improvised answer.
                </Bullet>
                <Bullet title="Memory you approve, fact by fact">
                  Facts the coach infers arrive as suggestions. Nothing is remembered until you
                  confirm it, and anything remembered can be removed.
                </Bullet>
                <Bullet title="Personalisation is off until you consent">
                  Consent is explicit, revocable, and gates whether stored facts are used at all.
                </Bullet>
              </ul>

              <div className="mt-6">
                <Spec
                  rows={[
                    ['Confirmed facts kept', `up to ${MEMORY_MAX_FACTS_CONFIRMED}`],
                    ['Suggestions awaiting review', `up to ${MEMORY_MAX_FACTS_SUGGESTED}`],
                    ['Length of a single fact', `${MEMORY_FACT_MAX_CHARS} characters`],
                    [
                      'Rejected facts retained',
                      `${MEMORY_REJECTED_RETENTION_DAYS} days, then erased`,
                    ],
                  ]}
                  caption="Rejections are held briefly for one reason only: so the same fact is not suggested to you again. They are not used to personalise anything."
                />
              </div>
            </Block>

            {/* -------------------------------------------------- */}
            <Block
              id="progress"
              eyebrow="Progress"
              title="Trends, not a verdict on today"
              lead="Weight and intake are shown across 7, 30 and 90 days, because the useful signal is the direction of travel rather than any single day's number."
              screenshot="progress"
              alt="The progress view: current weight, change since start, a weight journey chart against goal, and a calorie trend bar chart."
              flip
            >
              <ul className="space-y-4">
                <Bullet title="Weight journey against your goal">
                  Your logged weights plotted with the goal line, so progress is read at a glance
                  instead of computed in your head.
                </Bullet>
                <Bullet title="Calorie trend beside it">
                  Daily intake as a trend with an average, which is what makes an unusual day
                  legible as an unusual day.
                </Bullet>
                <Bullet title="Written insights stay careful">
                  Generated summaries describe what the data shows. They do not diagnose, and they
                  do not moralise about a bad week.
                </Bullet>
              </ul>
            </Block>

            {/* -------------------------------------------------- */}
            <Block
              id="platform"
              eyebrow="Platform"
              title="Where it runs, and what it costs you"
              lead="One codebase serves the responsive web app and the Telegram Mini App. It is free software, and it runs without any AI provider at all if you would rather it did."
            >
              <ul className="space-y-4">
                <Bullet title="Telegram Mini App">
                  The same product inside Telegram, binding the client&apos;s theme and native
                  controls and signing you in from the launch data.
                </Bullet>
                <Bullet title="Runs without AI keys">
                  With no provider configured the API falls back to a deterministic offline engine,
                  so every core journey — targets, logging, plans, progress — still works.
                </Bullet>
                <Bullet title="Usage is a ledger, not a balance">
                  Credits are derived by folding an append-only transaction log, so a balance cannot
                  be quietly rewritten.
                </Bullet>
                <Bullet title="Free software, AGPL v3">
                  Read the calculations, audit the guardrails, or run the whole platform yourself.
                </Bullet>
              </ul>

              <div className="mt-6">
                <Spec
                  rows={[
                    ['Free credits each day', `${FREE_TIER_DAILY_CREDITS}`],
                    ['Coach message', `${CREDIT_COSTS.chatTurn} credit`],
                    ['Meal photo analysis', `${CREDIT_COSTS.mealPhoto} credits`],
                    ['Meal suggestion', `${CREDIT_COSTS.mealRecommendation} credits`],
                    ['Recipe generation', `${CREDIT_COSTS.recipeGeneration} credits`],
                    ['Plan generation', `${CREDIT_COSTS.planGeneration} credits`],
                    ['Progress insight', `${CREDIT_COSTS.progressInsight} credit`],
                  ]}
                  caption="Deterministic features — targets, logging, hydration, the exercise library, charts — cost nothing, because no model is involved in them."
                />
              </div>

              <a
                href={SOURCE_CODE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                Read the source
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_outward
                </span>
              </a>
            </Block>

            {/* -------------------------------------------------- */}
            <PageCta
              title="Ready to see your own numbers?"
              lead="Building a profile takes a couple of minutes, and the targets are computed the moment you finish."
              disclaimer={WELLNESS_DISCLAIMER}
            />
          </div>
        </div>
      </div>
    </MarketingPage>
  );
}
