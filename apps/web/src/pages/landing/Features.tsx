/**
 * /features — Source-Bound Engineering Reference Sheet.
 *
 * Signature architecture: clean editorial header followed by a full-width
 * 1px-ruled Source Constant Strip (no tilted hero card duplicating `/safety`),
 * sticky left TOC with active scroll-spy (`aria-current`), 3D hardware frames,
 * 2x2 target spec grid, and interactive kit-filtering preview.
 */
import { useEffect, useState } from 'react';
import {
  ACTIVITY_FACTORS,
  COACHES,
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
import { DeviceFrame, type ScreenshotId } from './PhoneShowcase';
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

const KIT_DEMO: Record<string, { label: string; sample: string[] }> = {
  bodyweight: {
    label: 'Bodyweight only',
    sample: ['Push-up progression', 'Bulgarian split squat', 'Hollow-body hold', 'Shadowboxing intervals'],
  },
  dumbbells: {
    label: 'Dumbbells',
    sample: ['Goblet squat', 'Romanian deadlift', 'Single-arm row', 'Overhead press'],
  },
  pullup: {
    label: 'Pull-up bar',
    sample: ['Strict pull-up', 'Hanging knee raise', 'Scapular pull', 'Inverted row'],
  },
  bands: {
    label: 'Resistance bands',
    sample: ['Band face pull', 'Banded pallof press', 'Banded good morning', 'Rotational punch'],
  },
};

function KitFilterDemo() {
  const [kit, setKit] = useState<string>('bodyweight');
  const active = KIT_DEMO[kit] ?? KIT_DEMO.bodyweight!;

  return (
    <div className="mt-6 rounded-card border border-outline-variant/65 bg-surface-container-low p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="stat-label text-primary">Preview kit filtering</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sample equipment kit">
          {Object.entries(KIT_DEMO).map(([key, item]) => (
            <button
              key={key}
              type="button"
              onClick={() => setKit(key)}
              aria-pressed={kit === key}
              className={`min-h-[44px] rounded-full px-3.5 text-[13px] font-semibold transition-colors sm:min-h-[36px] ${
                kit === key
                  ? 'bg-primary-fixed-dim azf-cta-text'
                  : 'border border-outline/80 bg-surface text-on-surface-variant hover:border-primary hover:text-on-surface'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {active.sample.map((move) => (
          <li
            key={move}
            className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/60 bg-surface px-3.5 py-2.5 text-[14px] text-on-surface"
          >
            <span className="min-w-0 leading-snug">{move}</span>
            <span className="shrink-0 whitespace-nowrap text-[12px] font-medium uppercase tracking-[0.06em] text-secondary">
              CC BY-SA
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  screenshot?: ScreenshotId;
  alt?: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div
        className={`grid items-start gap-10 ${
          screenshot ? 'lg:grid-cols-[minmax(0,1fr)_292px] lg:gap-14' : ''
        }`}
      >
        <Reveal className="min-w-0">
          <p className="stat-label text-primary">{eyebrow}</p>
          <h2 className="mt-2 font-heading text-[32px] font-semibold leading-[1.06] text-on-surface sm:text-[40px]">
            {title}
          </h2>
          <p className="mt-3.5 max-w-[60ch] text-[15.5px] leading-relaxed text-on-surface-variant">
            {lead}
          </p>
          <div className="mt-7">{children}</div>
        </Reveal>

        {screenshot && (
          <Reveal delay={70} className={flip ? 'lg:order-first' : ''}>
            <div className="mx-auto w-[256px] sm:w-[288px]">
              <DeviceFrame id={screenshot} alt={alt ?? ''} />
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0]!.id);
  const mib = Math.round(MEAL_PHOTO_MAX_BYTES / (1024 * 1024));
  const formats = MEAL_PHOTO_MIME.map((m) => m.replace('image/', '').toUpperCase()).join(', ');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: 0.01 },
    );
    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <MarketingPage path="/features">
      <PageHero
        crumb="Features"
        kicker="Source-bound reference"
        title="Every feature, and how it actually works"
        lead="The short version is on the home page. This is the engineering reference — including the formulas, limits and constants your targets are computed from, read straight out of the application's source at build time."
        secondary={{ to: '/', label: 'Back to overview' }}
      >
        {/* Full-width horizontal Corner Card Constant Strip */}
        <dl className="mt-10 grid gap-x-8 gap-y-5 border-y border-outline-variant/60 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Formula', FORMULA_VERSION, 'Deterministic BMR'],
            ['Calorie floors', `${KCAL_FLOOR.female} / ${KCAL_FLOOR.male} kcal`, 'Disclosed min clamp'],
            ['Free daily AI', `${FREE_TIER_DAILY_CREDITS} credits`, 'Deterministic = 0 credits'],
            ['Fighter roster', `${COACHES.length} coaches`, 'Earned by showing up'],
          ].map(([label, big, sub]) => (
            <div key={label}>
              <dt className="stat-label">{label}</dt>
              <dd className="mt-1.5 font-heading text-[28px] font-bold leading-none tabular-nums text-on-surface">
                {big}
              </dd>
              <dd className="mt-1 text-[13px] text-on-surface-variant">{sub}</dd>
            </div>
          ))}
        </dl>
      </PageHero>

      <div className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-8 sm:pb-32">
        <div className="grid gap-12 lg:grid-cols-[196px_minmax(0,1fr)] lg:gap-14">
          {/* Sticky left TOC with active indicator and 44px touch rows */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="On this page">
              <h2 className="stat-label">On this page</h2>
              <ul className="mt-3 border-l border-outline-variant/60 pl-4">
                {SECTIONS.map((section) => {
                  const active = activeSection === section.id;
                  return (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        aria-current={active ? 'location' : undefined}
                        className={`inline-flex min-h-[44px] items-center text-[14px] transition-colors ${
                          active
                            ? 'font-semibold text-primary'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {section.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0 space-y-24 sm:space-y-28">
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

            <Block
              id="targets"
              eyebrow="Targets"
              title="The maths, in full"
              lead={`Basal metabolic rate comes from Mifflin-St Jeor (${FORMULA_VERSION}), multiplied by an activity factor and adjusted by a bounded rate of change. No model participates. You can check every number below with a calculator.`}
            >
              <div className="grid gap-5 md:grid-cols-2">
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

              <KitFilterDemo />
            </Block>

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

            <Block
              id="platform"
              eyebrow="Platform"
              title="Where it runs, and what it costs you"
              lead="One codebase serves the responsive web app and the Telegram Mini App. It is free software, and it runs without any AI provider at all if you would rather it did."
            >
              <div className="grid items-start gap-6 lg:grid-cols-2">
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

                <div>
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
              </div>

              <a
                href={SOURCE_CODE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-5 inline-flex min-h-[44px] items-center gap-2 text-[15px] font-semibold text-primary transition-colors hover:text-on-surface"
              >
                Read the source
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_outward
                </span>
              </a>
            </Block>

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
