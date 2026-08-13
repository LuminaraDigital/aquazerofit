/**
 * Landing page content sections.
 *
 * Every claim on this page is a claim the product actually makes good on —
 * the safety invariants come from AQF-02/AQF-11 and are enforced in code and
 * covered by tests, and there are no invented usage numbers or testimonials.
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SOURCE_CODE_URL, WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { TelegramCta } from './Chrome';
import { DeviceFrame } from './PhoneShowcase';
import { Reveal, useCountUp, useInView, useTilt } from './motion';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'center',
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: string;
  align?: 'center' | 'left';
}) {
  const alignment = align === 'center' ? 'text-center mx-auto' : 'text-left';
  return (
    <Reveal className={`max-w-2xl ${alignment}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/80">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-heading text-3xl font-semibold leading-[1.1] text-on-surface sm:text-[42px]">
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-[15px] leading-relaxed text-on-surface-variant/75 sm:text-base">
          {lead}
        </p>
      )}
    </Reveal>
  );
}

/** Card that tilts toward the cursor and carries a spotlight highlight. */
function TiltCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { ref, tiltProps } = useTilt<HTMLDivElement>({ max: 5, spotlight: true });
  return (
    <div
      ref={ref}
      {...tiltProps}
      className={`lp-card lp-card-hover lp-spot lp-tilt h-full p-6 ${className}`}
    >
      <div className="relative">{children}</div>
    </div>
  );
}

function Icon({
  name,
  tone = 'primary',
}: {
  name: string;
  tone?: 'primary' | 'secondary' | 'coral';
}) {
  const tones = {
    primary: 'text-primary bg-primary/10 ring-primary/20',
    secondary: 'text-secondary bg-secondary/10 ring-secondary/20',
    coral: 'text-coral bg-coral/10 ring-coral/20',
  } as const;
  return (
    <span
      className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${tones[tone]}`}
      aria-hidden="true"
    >
      <span className="material-symbols-outlined text-[22px]">{name}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Marquee                                                             */
/* ------------------------------------------------------------------ */

const MARQUEE_ITEMS = [
  'Photo meal logging',
  'Deterministic calorie maths',
  'Aqua Coach',
  'Adaptive home training',
  'Allergen exclusion',
  'Hydration targets',
  'Barcode scanning',
  'Progress trends',
  'Telegram Mini App',
  'Approved-memory personalisation',
];

export function Marquee() {
  return (
    <div
      className="lp-marquee-track relative overflow-hidden border-y border-white/5 py-4"
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-surface to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-surface to-transparent" />
      <div className="lp-marquee">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {MARQUEE_ITEMS.map((item) => (
              <span key={item} className="flex items-center whitespace-nowrap px-6">
                <span className="text-sm font-medium uppercase tracking-[0.16em] text-on-surface-variant/70">
                  {item}
                </span>
                <span className="ml-6 h-1 w-1 rounded-full bg-primary/40" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

function StatTile({
  value,
  suffix,
  label,
  literal,
}: {
  value?: number;
  suffix?: string;
  label: string;
  literal?: string;
}) {
  const { ref, display } = useCountUp(value ?? 0);
  return (
    <div className="lp-card p-6 text-center">
      <div className="font-heading text-4xl font-semibold lp-gradient-text tabular-nums sm:text-5xl">
        {literal ?? (
          <>
            <span ref={ref}>{Math.round(display)}</span>
            {suffix}
          </>
        )}
      </div>
      <p className="mt-2 text-[13px] leading-snug text-on-surface-variant/70">{label}</p>
    </div>
  );
}

export function Stats() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Reveal delay={0}>
        <StatTile
          value={2}
          label="Delivery targets — responsive web and Telegram Mini App, one codebase"
        />
      </Reveal>
      <Reveal delay={80}>
        <StatTile
          value={11}
          label="Versioned AI prompts, each reviewed against the safety evaluation set"
        />
      </Reveal>
      <Reveal delay={160}>
        <StatTile value={0} label="Meal photos logged without your explicit confirmation" />
      </Reveal>
      <Reveal delay={240}>
        <StatTile
          literal="AGPL"
          label="Free software — read, audit and run the whole thing yourself"
        />
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Features (bento)                                                    */
/* ------------------------------------------------------------------ */

export function Features() {
  return (
    <section id="features" className="scroll-mt-24">
      <SectionHeading
        eyebrow="What it does"
        title={
          <>
            A wellness app that <span className="lp-gradient-text">shows its working</span>
          </>
        }
        lead="Models identify, interpret and explain. Code calculates, filters and enforces. That split is the whole design — and it is why the numbers you see can be trusted."
      />

      <Reveal className="mt-6 text-center">
        <Link
          to="/features"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          See every feature in detail
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </Reveal>

      <div className="mt-12 grid gap-4 lg:grid-cols-6">
        {/* Hero feature */}
        <Reveal className="lg:col-span-4" delay={0}>
          <TiltCard>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <Icon name="photo_camera" />
              <div className="flex-1">
                <h3 className="font-heading text-xl font-semibold text-on-surface">
                  Log a meal by photograph
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                  Point the camera at the plate. The vision model proposes the items and portions;
                  you confirm or correct them before anything reaches your day. The photo is
                  stripped of its EXIF data on upload, stored under an unguessable name, never
                  served publicly, and swept within a day of the analysis finishing — immediately if
                  it fails.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    { k: 'Identify', v: 'Model proposes items' },
                    { k: 'Confirm', v: 'You stay in control' },
                    { k: 'Count', v: 'Code does the maths' },
                  ].map((step, i) => (
                    <div
                      key={step.k}
                      className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5"
                    >
                      <p className="text-[10px] uppercase tracking-[0.18em] text-primary/70">
                        Step {i + 1}
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-on-surface">{step.k}</p>
                      <p className="text-[11px] text-on-surface-variant/70">{step.v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TiltCard>
        </Reveal>

        <Reveal className="lg:col-span-2" delay={80}>
          <TiltCard>
            <Icon name="calculate" tone="secondary" />
            <h3 className="mt-5 font-heading text-xl font-semibold text-on-surface">
              Targets you can recompute by hand
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
              Mifflin-St Jeor, an activity factor and a safe rate of change — clamped to a calorie
              floor with a visible advisory whenever the clamp bites. No model is anywhere near your
              arithmetic.
            </p>
          </TiltCard>
        </Reveal>

        <Reveal className="lg:col-span-2" delay={0}>
          <TiltCard>
            <Icon name="exercise" tone="secondary" />
            <h3 className="mt-5 font-heading text-xl font-semibold text-on-surface">
              Home training that fits your kit
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
              Plans built from an openly licensed exercise corpus, filtered to the equipment you
              actually own, and re-tuned as your logged progress moves.
            </p>
          </TiltCard>
        </Reveal>

        <Reveal className="lg:col-span-2" delay={80}>
          <TiltCard>
            <Icon name="no_food" tone="coral" />
            <h3 className="mt-5 font-heading text-xl font-semibold text-on-surface">
              Allergen exclusion, not allergen preference
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
              A deterministic filter runs after generation with zero tolerance for false negatives.
              A suggestion that cannot be proven safe is not shown.
            </p>
          </TiltCard>
        </Reveal>

        <Reveal className="lg:col-span-2" delay={160}>
          <TiltCard>
            <Icon name="monitoring" />
            <h3 className="mt-5 font-heading text-xl font-semibold text-on-surface">
              Progress over 7, 30 and 90 days
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
              Weight journey and calorie trend on one screen, so a single heavy day reads as what it
              is — a single day.
            </p>
          </TiltCard>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Screen gallery                                                      */
/* ------------------------------------------------------------------ */

const SCREENS = [
  {
    id: 'dashboard',
    title: 'Today at a glance',
    caption: 'Calories remaining, macro split and hydration — all computed from your own figures.',
    alt: 'Dashboard: 1,135 kcal left on a progress ring, protein, carbs and fat against target, and hydration logged in 250 ml steps.',
  },
  {
    id: 'nutrition',
    title: 'Per-meal logging',
    caption: 'A searchable food corpus, barcode scanning and day navigation, meal by meal.',
    alt: 'Nutrition day view: a calorie ring, macro targets and each meal of the day listed with its entries.',
  },
  {
    id: 'coach',
    title: 'A coach that knows your day',
    caption:
      'Grounded in the nutrition, workout and plan context you have logged — with the wellness boundary always on screen.',
    alt: "Aqua Coach: a reply quoting today's logged calories, protein, carbs, fat and water, above the persistent wellness disclaimer.",
  },
  {
    id: 'meal-plan',
    title: 'Plans matched to your targets',
    caption: 'Generated against your calorie and macro targets, with allergens excluded first.',
    alt: 'An AI meal plan laid out against the day’s calorie and macro targets.',
  },
  {
    id: 'workouts',
    title: 'Training that fits your kit',
    caption: 'An openly licensed exercise corpus, filtered to the equipment you actually own.',
    alt: 'Workout library: the training week, a rest-day card, and the exercise library filtered by type, muscle and equipment.',
  },
  {
    id: 'progress',
    title: 'Progress over 7, 30 and 90 days',
    caption: 'Weight journey and calorie trend, so a single heavy day reads as a single day.',
    alt: 'Progress view: current weight, change since start, a weight journey chart against goal, and a calorie trend bar chart.',
  },
];

export function Gallery() {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  /* Roving focus: a tab list is one tab stop, arrows move between options. */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const last = SCREENS.length - 1;
    let next = active;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
      next = active === last ? 0 : active + 1;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      next = active === 0 ? last : active - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <section id="screens" className="scroll-mt-24">
      <SectionHeading
        eyebrow="See it working"
        title={
          <>
            Real screens, <span className="lp-gradient-text">not renderings</span>
          </>
        }
        lead="Captured from the running application signed in as the seeded demo account. Every number on them was produced by the same code you would be using."
      />

      <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1fr_320px] lg:gap-16">
        <Reveal className="min-w-0 lg:order-1">
          <div
            role="tablist"
            aria-label="Application screens"
            aria-orientation="vertical"
            onKeyDown={onKeyDown}
            className="flex flex-col gap-2"
          >
            {SCREENS.map((screen, i) => {
              const selected = i === active;
              return (
                <button
                  key={screen.id}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  role="tab"
                  type="button"
                  id={`screen-tab-${screen.id}`}
                  aria-selected={selected}
                  aria-controls="screen-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(i)}
                  className={`group rounded-2xl border px-5 py-4 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    selected
                      ? 'border-primary/35 bg-primary/[0.07]'
                      : 'border-white/6 bg-white/[0.015] hover:border-primary/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                        selected ? 'bg-secondary shadow-[0_0_10px_#45dfa4]' : 'bg-outline-variant'
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`font-heading text-base font-semibold transition-colors ${
                        selected ? 'text-on-surface' : 'text-on-surface-variant/80'
                      }`}
                    >
                      {screen.title}
                    </span>
                  </span>
                  {/* Only the selected screen carries its caption: six open
                      captions push the device itself below the fold on a
                      phone, and the caption describes what is on screen now. */}
                  {selected && (
                    <span className="mt-1 block pl-[18px] text-[13px] leading-relaxed text-on-surface-variant/75">
                      {screen.caption}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={120} className="lg:order-2">
          <div
            id="screen-panel"
            role="tabpanel"
            aria-labelledby={`screen-tab-${SCREENS[active]!.id}`}
            className="relative mx-auto w-[272px] sm:w-[300px]"
          >
            {/* All screens stay mounted and stacked so switching is a crossfade
                rather than a fetch-and-flash. */}
            <div
              className="pointer-events-none absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(47,217,244,0.16),transparent_65%)] blur-2xl"
              aria-hidden="true"
            />
            <div className="relative" style={{ aspectRatio: '780 / 1688' }}>
              {SCREENS.map((screen, i) => (
                <div
                  key={screen.id}
                  aria-hidden={i !== active}
                  className={`absolute inset-0 transition-opacity duration-500 ${
                    i === active ? 'opacity-100' : 'pointer-events-none opacity-0'
                  }`}
                >
                  <DeviceFrame id={screen.id} alt={i === active ? screen.alt : ''} />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                        */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    icon: 'person_add',
    title: 'Build your profile',
    body: 'Height, weight, activity and goal. The app returns calorie, macro and hydration targets immediately — computed, not guessed, and clamped to safe floors.',
  },
  {
    icon: 'restaurant',
    title: 'Log your day',
    body: 'Photograph a plate, search the food corpus or scan a barcode. Water and workouts land on the same day view, so nothing needs reconciling later.',
  },
  {
    icon: 'auto_awesome',
    title: 'Let it adapt',
    body: 'Meal suggestions, plans and coaching are generated against your real targets, allergens and measured progress — and refreshed as those change.',
  },
];

export function HowItWorks() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section id="how" className="scroll-mt-24">
      <SectionHeading eyebrow="How it works" title="Three steps, then it gets out of your way" />

      <div ref={ref} className={`relative mt-12 ${inView ? 'lp-in' : ''}`}>
        {/* Animated rail that draws itself as the section arrives */}
        <div
          className="lp-rail absolute left-[27px] top-6 hidden w-px md:block"
          style={{ height: 'calc(100% - 3rem)' }}
          aria-hidden="true"
        />
        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 120}>
              <div className="lp-card lp-card-hover lp-spot flex flex-col gap-5 p-6 md:flex-row md:items-center">
                <div className="flex items-center gap-4">
                  <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-surface-container-lowest">
                    <span
                      className="material-symbols-outlined text-[24px] text-primary"
                      aria-hidden="true"
                    >
                      {step.icon}
                    </span>
                  </span>
                  <span className="font-heading text-5xl font-semibold text-white/6 tabular-nums md:hidden">
                    0{i + 1}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-heading text-xl font-semibold text-on-surface">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-surface-variant/75">
                    {step.body}
                  </p>
                </div>
                <span className="hidden font-heading text-6xl font-semibold text-white/[0.05] tabular-nums md:block">
                  0{i + 1}
                </span>
              </div>
            </Reveal>
          ))}
        </ol>

        <Reveal className="mt-8 text-center">
          <Link
            to="/how-it-works"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            Walk through all six steps
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Coach demo                                                          */
/* ------------------------------------------------------------------ */

const TURNS = [
  { from: 'user' as const, text: 'How am I tracking today?' },
  {
    from: 'coach' as const,
    text: "You have around 768 kcal left and you're 32 g short on protein. A Greek yoghurt with berries would close most of that gap without crowding dinner.",
  },
  { from: 'user' as const, text: 'Should I take something for my thyroid?' },
  {
    from: 'coach' as const,
    text: 'That one is outside what I can help with — thyroid medication is a clinical decision. Please talk to your doctor or pharmacist. I can keep helping with your meals and training in the meantime.',
    boundary: true,
  },
];

export function CoachDemo() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section id="coach" className="scroll-mt-24">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Aqua Coach"
            title={
              <>
                A coach that knows your day — and{' '}
                <span className="lp-gradient-text">knows its limits</span>
              </>
            }
            lead="Every reply is grounded in the nutrition, training and plan context you have actually logged. Both the question going in and the answer coming out pass through safety guardrails, and anything medical, crisis-related or extreme-diet shaped is refused with a supportive signpost instead of an answer."
          />
          <Reveal delay={180}>
            <Link
              to="/aqua-coach"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              What the coach will and will not answer
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </Reveal>

          <Reveal delay={120}>
            <ul className="mt-8 space-y-3">
              {[
                'Grounded in your real targets, logs and plan — not a generic chatbot',
                'Remembers only what you confirm; suggested facts wait for your approval',
                'Personalisation is off until you consent, and revocable at any time',
              ].map((item) => (
                <li key={item} className="flex gap-3 text-sm text-on-surface-variant/80">
                  <span
                    className="material-symbols-outlined mt-0.5 text-[18px] text-secondary"
                    aria-hidden="true"
                  >
                    check_circle
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <div ref={ref} className={inView ? 'lp-in' : ''}>
          <div className="lp-card p-5 sm:p-6">
            <div className="flex items-center gap-3 border-b border-white/6 pb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15">
                <span
                  className="material-symbols-outlined text-[18px] text-primary"
                  aria-hidden="true"
                >
                  auto_awesome
                </span>
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-on-surface">Aqua Coach</p>
                <p className="text-[11px] text-on-surface-variant/70">
                  Grounded in today&apos;s context
                </p>
              </div>
              {/* The screens above are real captures; this exchange is scripted
                  to show the refusal path, so it says so. */}
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/70">
                Illustrative
              </span>
            </div>

            <div className="space-y-3 pt-5">
              {TURNS.map((turn, i) => (
                <div
                  key={turn.text}
                  className={`lp-bubble flex ${turn.from === 'user' ? 'justify-end' : 'justify-start'}`}
                  style={{ '--lp-delay': `${i * 420}ms` } as React.CSSProperties}
                >
                  <div
                    className={`max-w-[86%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                      turn.from === 'user'
                        ? 'bg-primary/15 text-on-surface'
                        : turn.boundary
                          ? 'border border-coral/25 bg-coral/[0.07] text-on-surface-variant'
                          : 'bg-white/[0.04] text-on-surface-variant'
                    }`}
                  >
                    {turn.boundary && (
                      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-coral">
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                          shield
                        </span>
                        Boundary held
                      </p>
                    )}
                    {turn.text}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-5 border-t border-white/6 pt-4 text-[11px] leading-relaxed text-on-surface-variant/70">
              {WELLNESS_DISCLAIMER}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Safety & privacy                                                    */
/* ------------------------------------------------------------------ */

const INVARIANTS = [
  {
    icon: 'function',
    title: 'Code calculates',
    body: 'Calorie maths is deterministic lookup-and-multiply. A model never produces a number you are shown as fact.',
  },
  {
    icon: 'shield',
    title: 'Floors are enforced',
    body: 'Targets are clamped to configured calorie floors, and the clamp is disclosed on screen rather than hidden.',
  },
  {
    icon: 'task_alt',
    title: 'Nothing logs itself',
    body: 'Photo recognition always waits for your explicit confirmation before a single kilojoule reaches your day.',
  },
  {
    icon: 'medical_information',
    title: 'Medical questions are refused',
    body: 'Diagnosis, treatment, crisis and extreme-diet content get a supportive signpost, not an answer.',
  },
  {
    icon: 'lock',
    title: 'Personalisation is opt-in',
    body: 'AI personalisation is gated on consent you give explicitly, and remembered facts need your approval.',
  },
  {
    icon: 'receipt_long',
    title: 'The ledger is append-only',
    body: 'Usage credits are derived by folding an immutable transaction log — balances cannot be quietly rewritten.',
  },
];

export function Safety() {
  return (
    <section id="safety" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Safety by construction"
        title={
          <>
            Guarantees, not <span className="lp-gradient-text">good intentions</span>
          </>
        }
        lead="These are invariants enforced in code and covered by the test suite — not copy on a page. A build that breaks one of them does not ship."
      />

      <Reveal className="mt-6 text-center">
        <Link
          to="/safety"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          How each one is enforced, and where the guarantees end
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </Reveal>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INVARIANTS.map((item, i) => (
          <Reveal key={item.title} delay={(i % 3) * 90}>
            <div className="lp-card lp-card-hover lp-spot h-full p-6">
              <span
                className="material-symbols-outlined text-[22px] text-primary"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <h3 className="mt-4 font-heading text-lg font-semibold text-on-surface">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/70">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Platform: Telegram + open source                                    */
/* ------------------------------------------------------------------ */

export function Platform() {
  return (
    <section id="platform" className="scroll-mt-24">
      {/* min-w-0 on the grid children: without it the clone command's
          min-content width expands the track and scrolls the whole page
          sideways on narrow screens, instead of scrolling inside its block. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal className="min-w-0">
          <div className="lp-card lp-card-hover lp-spot h-full overflow-hidden p-8">
            <Icon name="send" />
            <h3 className="mt-5 font-heading text-2xl font-semibold text-on-surface">
              It lives in Telegram
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant/75">
              AquaZeroFit is a Telegram Mini App. It opens inside the client you already have —
              nothing to download, no new password, signed in from the launch data — and it binds
              your Telegram theme and native controls so it behaves like part of the app rather
              than a website wearing one.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['No install', 'Silent sign-in', 'Theme-bound', 'Native controls'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1 text-[11px] text-primary/90"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-6">
              <TelegramCta placement="platform" />
            </div>
            {/* The corporate / restricted-network segment, answered on the page
                rather than left to bounce. The claim is deliberately specific:
                one codebase really does serve both, so "the same app" is a
                statement about the build, not a marketing softener. */}
            <p className="mt-5 border-t border-white/5 pt-5 text-[13px] leading-relaxed text-on-surface-variant/70">
              Telegram blocked on your network?{' '}
              <Link
                to="/sign-in?mode=register"
                className="font-semibold text-primary transition-colors hover:text-secondary"
              >
                Use it in your browser
              </Link>{' '}
              — one codebase builds both surfaces, so it is the same product and the same account,
              not a cut-down version of it.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100} className="min-w-0">
          <div className="lp-card lp-card-hover lp-spot h-full p-8">
            <Icon name="code" tone="secondary" />
            <h3 className="mt-5 font-heading text-2xl font-semibold text-on-surface">
              Open source, licence and all
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant/75">
              AquaZeroFit is free software under the GNU AGPL v3. Read how your targets are
              computed, check the guardrails yourself, or run the whole platform on your own machine
              — the API falls back to a deterministic offline engine when no AI keys are configured,
              so every core journey works without a provider account.
            </p>
            <div className="mt-6 overflow-x-auto rounded-xl border border-white/8 bg-black/40 p-4">
              <pre className="text-[12px] leading-relaxed text-on-surface-variant/80">
                <code>
                  {'git clone ' + SOURCE_CODE_URL + '.git\nnpm install\nnpm run api & npm run dev'}
                </code>
              </pre>
            </div>
            <a
              href={SOURCE_CODE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              View the source
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_outward
              </span>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
