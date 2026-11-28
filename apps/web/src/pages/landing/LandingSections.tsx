/**
 * Landing page content sections below the hero.
 *
 * Uses typed `ScreenshotId` from `PhoneShowcase.tsx`, Corner Card 16px/8px
 * radii and hairline rules, AU/UK copy consistency, and an asymmetric 12-column
 * closing launchpad instead of a generic 3-equal-box grid.
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SOURCE_CODE_URL } from '@aquazerofit/shared';
import { PlayStoreBadge, TelegramCta, WebFallbackLink } from './Chrome';
import { DeviceFrame, type ScreenshotId } from './PhoneShowcase';
import { Reveal } from './motion';
import { CornerStage } from './scene/CornerStage';
import { MealTraceDemo } from './scene/MealTraceDemo';
import { BeltRail } from './scene/BeltRail';

const H2 =
  'font-heading text-[clamp(2.25rem,1.55rem+2.8vw,4rem)] font-semibold leading-[0.98] tracking-[-0.015em] text-on-surface [text-wrap:balance]';
const LEAD = 'mt-5 max-w-[34em] text-[17px] leading-relaxed text-on-surface-variant [text-wrap:pretty]';

function MoreLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex min-h-[44px] items-center gap-2 text-[15px] font-semibold text-primary transition-colors duration-150 hover:text-on-surface"
    >
      {children}
      <span
        className="material-symbols-outlined text-[18px] transition-transform duration-150 group-hover:translate-x-0.5"
        aria-hidden="true"
      >
        arrow_forward
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Screens (3D interactive phone showcase)                             */
/* ------------------------------------------------------------------ */

const SCREENS: ReadonlyArray<{
  id: ScreenshotId;
  title: string;
  caption: string;
  rail: string;
  alt: string;
}> = [
  {
    id: 'dashboard',
    title: 'Today at a glance',
    caption: 'Calories remaining, macro split and hydration, all computed from your own figures.',
    rail: '2,382 kcal left · computed live',
    alt: 'Today: 2,382 kcal left as the lead figure, protein, carbs and fat against target as ruled rows, and the day’s checklist of meals, workout and water.',
  },
  {
    id: 'nutrition',
    title: 'Per-meal logging',
    caption: 'A searchable food corpus, barcode scanning and day navigation, meal by meal.',
    rail: 'Barcode + corpus lookup',
    alt: 'Nutrition day view: 2,382 kcal remaining of a 2,580 goal, macros against target, quick actions to scan a meal or barcode, and each meal of the day.',
  },
  {
    id: 'coach',
    title: 'A coach that knows your day',
    caption: 'Grounded in what you have logged, with the wellness boundary always on screen.',
    rail: '28 fighter personas',
    alt: 'Coach chat with Akin: advice on easing into a recovery jog, under the persistent wellness disclaimer.',
  },
  {
    id: 'recipe',
    title: 'Recipes you can log as cooked',
    caption: 'Per-serving calories and macros, allergens called out, and the full method cached for offline reading.',
    rail: 'Offline cached · allergen safe',
    alt: 'Recipe: avocado and egg sourdough toast at 440 kcal per serving with protein, carbs and fat, an allergen note, a servings stepper and the ingredient list.',
  },
  {
    id: 'workouts',
    title: 'Training that fits your kit',
    caption: 'An openly licensed exercise corpus, filtered to the equipment you actually own.',
    rail: 'CC BY-SA · kit-filtered',
    alt: 'Workouts: today’s full-body strength session with its exercises and a start button, the training week, and the exercise library.',
  },
  {
    id: 'progress',
    title: 'Progress over 7, 30 and 90 days',
    caption: 'Weight journey and calorie trend, so a single heavy day reads as a single day.',
    rail: '28-day consistency window',
    alt: 'Progress: current weight 80.0 kg as the lead figure, change since start, and the 28-day consistency window.',
  },
];

export function Gallery() {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

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

  const current = SCREENS[active]!;

  return (
    <section id="screens" aria-labelledby="screens-title" className="scroll-mt-24">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20">
        <div className="min-w-0">
          <Reveal>
            <p className="stat-label text-primary">Android &amp; Mini App Captures</p>
            <h2 id="screens-title" className={`${H2} mt-2`}>
              Real screens from the running app.
            </h2>
            <p className={LEAD}>
              Captured from the Android app, signed in to a test account. Every number on them came
              out of the same code you would be using.
            </p>
          </Reveal>

          <Reveal delay={50}>
            <div
              role="tablist"
              aria-label="Application screens"
              aria-orientation="vertical"
              onKeyDown={onKeyDown}
              className="mt-9 border-b border-outline-variant/60"
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
                    className="group relative block min-h-[52px] w-full border-t border-outline-variant/60 py-4 pl-5 text-left"
                  >
                    <span
                      className={`absolute bottom-3 left-0 top-3 w-0.5 origin-top bg-primary transition-transform duration-200 ease-out ${
                        selected ? 'scale-y-100' : 'scale-y-0'
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`block font-heading text-[22px] font-semibold leading-tight transition-colors duration-150 ${
                        selected
                          ? 'text-on-surface'
                          : 'text-on-surface-variant group-hover:text-on-surface'
                      }`}
                    >
                      {screen.title}
                    </span>
                    {selected && (
                      <span className="mt-1.5 block max-w-[32em] text-[15px] leading-relaxed text-on-surface-variant">
                        {screen.caption}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Reveal>
        </div>

        <Reveal delay={70}>
          <div
            id="screen-panel"
            role="tabpanel"
            aria-labelledby={`screen-tab-${current.id}`}
            className="mx-auto w-[280px] sm:w-[324px]"
          >
            <DeviceFrame id={current.id} alt={current.alt} caption={current.rail} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The split: who does what + interactive meal trace                   */
/* ------------------------------------------------------------------ */

type Actor = 'You' | 'Model' | 'Code';

const ACTOR_TONE: Record<Actor, string> = {
  You: 'text-secondary',
  Model: 'text-primary',
  Code: 'text-on-surface',
};

const MEAL_STEPS: Array<{ actor: Actor; title: string; body: string }> = [
  {
    actor: 'You',
    title: 'Photograph the plate',
    body: 'Or scan a barcode, or search. The photo is stripped of EXIF data on upload and never served publicly.',
  },
  {
    actor: 'Model',
    title: 'It proposes items and portions',
    body: 'A vision model names what it sees. A proposal, never an entry.',
  },
  {
    actor: 'You',
    title: 'You confirm or correct',
    body: 'Nothing reaches your day until you accept it. The photo is deleted within a day.',
  },
  {
    actor: 'Code',
    title: 'Code counts it',
    body: 'Calories and macros are looked up and multiplied from the food database. No model does arithmetic.',
  },
];

const FACTS = [
  {
    term: 'Targets',
    body: 'Mifflin-St Jeor, an activity factor and a safe weekly rate, clamped to a calorie floor with the clamp disclosed on screen.',
  },
  {
    term: 'Allergens',
    body: 'A deterministic filter runs after generation with zero tolerance. A suggestion that cannot be proven safe is not shown.',
  },
  {
    term: 'Training',
    body: 'Home plans from an openly licensed exercise corpus, filtered to the equipment you own and re-tuned as progress moves.',
  },
  {
    term: 'Progress',
    body: 'Weight journey and calorie trend over 7, 30 and 90 days, so one heavy day reads as one day.',
  },
];

export function Split() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-24">
      <Reveal>
        <p className="stat-label text-primary">Architecture Split</p>
        <h2 id="features-title" className={`${H2} mt-2 max-w-[14em]`}>
          The model looks. You confirm. Code counts.
        </h2>
        <p className={LEAD}>
          Models identify, interpret and explain. Code calculates, filters and enforces. That
          split is the whole design, and it is why the numbers on your screen can be trusted.
        </p>
      </Reveal>

      <ol className="mt-12 grid gap-px overflow-hidden rounded-card border border-outline-variant/75 bg-outline-variant/60 sm:grid-cols-2 lg:grid-cols-4">
        {MEAL_STEPS.map((step, i) => (
          <Reveal as="li" key={step.title} delay={i * 40} className="bg-surface p-6 sm:p-7">
            <p className="flex items-baseline justify-between text-[13px]">
              <span className="tabular-nums text-on-surface-variant">Step {i + 1}</span>
              <span className={`font-semibold ${ACTOR_TONE[step.actor]}`}>{step.actor}</span>
            </p>
            <h3 className="mt-5 font-heading text-[26px] font-semibold leading-[1.05] text-on-surface [text-wrap:balance]">
              {step.title}
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-on-surface-variant [text-wrap:pretty]">
              {step.body}
            </p>
          </Reveal>
        ))}
      </ol>

      <Reveal delay={60}>
        <MealTraceDemo />
      </Reveal>

      <Reveal>
        <dl className="mt-14 grid gap-x-16 sm:grid-cols-2">
          {FACTS.map((fact) => (
            <div key={fact.term} className="grid gap-2 border-t border-outline-variant/60 py-6 md:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="font-heading text-[22px] font-semibold leading-tight text-on-surface">{fact.term}</dt>
              <dd className="text-[16px] leading-relaxed text-on-surface-variant [text-wrap:pretty]">{fact.body}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-x-8">
          <MoreLink to="/features">Every feature in detail</MoreLink>
          <MoreLink to="/how-it-works">How it works, step by step</MoreLink>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Coach: Interactive 3D Fighter Corner Stage                          */
/* ------------------------------------------------------------------ */

export function CoachDemo() {
  return (
    <section id="coach" aria-labelledby="coach-title" className="scroll-mt-24">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,4.5fr)_minmax(0,7.5fr)] lg:gap-14">
        <Reveal>
          <p className="stat-label text-primary">Your Corner · 28 AZX Fighters</p>
          <h2 id="coach-title" className={`${H2} mt-2`}>
            Answers from your day. Stops where medicine starts.
          </h2>
          <p className={LEAD}>
            Pick any fighter from the Aqua Zero roster to work your corner. Each coach brings their
            own training voice over the exact same grounded context and code-enforced safety wall.
          </p>
          <ul className="mt-7 border-b border-outline-variant/60">
            {[
              'Grounded in your real targets, logs and plan, not a generic chatbot',
              'Remembers only what you confirm; suggested facts wait for your approval',
              'Every fighter is unlockable by showing up - never locked behind a paywall',
            ].map((item) => (
              <li key={item} className="flex gap-3 border-t border-outline-variant/60 py-3.5 text-[15.5px] leading-relaxed text-on-surface">
                <span className="material-symbols-outlined mt-0.5 text-[20px] text-secondary" aria-hidden="true">
                  check
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <MoreLink to="/aqua-coach">Explore all 28 fighters &amp; guardrails</MoreLink>
          </div>
        </Reveal>

        <Reveal delay={60} className="min-w-0">
          <CornerStage />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Fight Record Belts + Safety Guarantees                              */
/* ------------------------------------------------------------------ */

const INVARIANTS = [
  {
    title: 'Code calculates',
    body: 'Calorie maths is deterministic lookup-and-multiply. A model never produces a number you are shown as fact.',
  },
  {
    title: 'Floors are enforced',
    body: 'Targets are clamped to configured calorie floors, and the clamp is disclosed on screen rather than hidden.',
  },
  {
    title: 'Nothing logs itself',
    body: 'Photo recognition waits for your explicit confirmation before a single kilojoule reaches your day.',
  },
  {
    title: 'Medical questions are refused',
    body: 'Diagnosis, treatment, crisis and extreme-diet content get a supportive signpost, not an answer.',
  },
  {
    title: 'Personalisation is opt-in',
    body: 'AI personalisation is gated on consent you give explicitly, and remembered facts need your approval.',
  },
  {
    title: 'The ledger is append-only',
    body: 'Usage credits are folded from an immutable transaction log, so a balance cannot be quietly rewritten.',
  },
];

export function Safety() {
  return (
    <section id="safety" aria-labelledby="safety-title" className="scroll-mt-24 space-y-16">
      <Reveal>
        <BeltRail />
      </Reveal>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
        <Reveal>
          <p className="stat-label text-primary">Safety Gate</p>
          <h2 id="safety-title" className={`${H2} mt-2`}>
            Six rules a release cannot break.
          </h2>
          <p className={LEAD}>
            Invariants enforced in code and covered by the test suite. A build that breaks one of
            them does not ship.
          </p>
          <div className="mt-4">
            <MoreLink to="/safety">How each one is enforced</MoreLink>
          </div>
        </Reveal>

        <Reveal delay={50}>
          <dl className="grid border-b border-outline-variant/60 sm:grid-cols-2 sm:gap-x-10">
            {INVARIANTS.map((item) => (
              <div key={item.title} className="border-t border-outline-variant/60 py-6">
                <dt className="font-heading text-[22px] font-semibold leading-tight text-on-surface">
                  {item.title}
                </dt>
                <dd className="mt-2 text-[15.5px] leading-relaxed text-on-surface-variant [text-wrap:pretty]">
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ways in — Asymmetric 12-column editorial launchpad                  */
/* ------------------------------------------------------------------ */

export function WaysIn() {
  return (
    <section id="get" aria-labelledby="get-title" className="scroll-mt-24">
      <Reveal>
        <p className="stat-label text-primary">Start Anywhere</p>
        <h2 id="get-title" className={`${H2} mt-2 max-w-[12em]`}>
          Three ways in. One account.
        </h2>
        <p className={LEAD}>
          Start wherever you already are. Your profile, logs and plan follow you between them.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-5 lg:grid-cols-12">
        {/* Dominant primary surface (web) */}
        <Reveal className="flex flex-col justify-between rounded-card border border-primary-fixed-dim/40 bg-surface-container p-7 sm:p-8 lg:col-span-7">
          <div>
            <p className="stat-label text-secondary">No install · Same account</p>
            <h3 className="mt-2 font-heading text-[32px] font-semibold leading-none text-on-surface sm:text-[38px]">
              Web app
            </h3>
            <p className="mt-3 max-w-[42ch] text-[16px] leading-relaxed text-on-surface-variant">
              Open AquaZeroFit in the browser you already have. Your profile, logs and plan are
              the same account as the Android app.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <WebFallbackLink placement="final" variant="primary" />
          </div>
        </Reveal>

        {/* Play beside the web app, Telegram after both */}
        <div className="grid gap-5 lg:col-span-5">
          <Reveal delay={40} className="lp-card flex flex-col justify-between p-6">
            <div>
              <h3 className="font-heading text-[26px] font-semibold leading-none text-on-surface">
                Android
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-on-surface-variant">
                The native app on Google Play, with photo logging and barcode scanning built in.
              </p>
            </div>
            <div className="mt-5 flex">
              <PlayStoreBadge placement="final" />
            </div>
          </Reveal>

          <Reveal delay={80} className="lp-card flex flex-col justify-between p-6">
            <div>
              <h3 className="font-heading text-[26px] font-semibold leading-none text-on-surface">
                Telegram
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-on-surface-variant">
                Already in Telegram? The Mini App is the same account, with no separate install.
              </p>
            </div>
            <div className="mt-5 flex">
              <TelegramCta placement="final" variant="ghost" />
            </div>
          </Reveal>
        </div>
      </div>

      <Reveal>
        <div className="mt-5 flex flex-col gap-4 rounded-card border border-outline-variant/65 bg-surface-container-low p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-[38em]">
            <h3 className="font-heading text-[24px] font-semibold leading-tight text-on-surface">
              Open source, licence and all.
            </h3>
            <p className="mt-2 text-[15.5px] leading-relaxed text-on-surface-variant">
              Free software under the GNU AGPL v3. Read how your targets are computed, check the
              guardrails, or run the whole platform yourself: with no AI keys configured it falls
              back to a deterministic offline engine.
            </p>
          </div>
          <a
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-2 text-[15px] font-semibold text-primary transition-colors duration-150 hover:text-on-surface"
          >
            Read the source
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              arrow_outward
            </span>
          </a>
        </div>
      </Reveal>
    </section>
  );
}
