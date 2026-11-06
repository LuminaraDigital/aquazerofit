/**
 * Landing page content sections, below the hero.
 *
 * Every claim here is one the product makes good on: the guarantees are
 * enforced in code and covered by tests, the screens are captures of the
 * running app, and there are no invented usage numbers or testimonials.
 *
 * Each section has one job and its own shape, so no two neighbours share a
 * skeleton: screens (prove), the split (explain), the coach (persuade), the
 * guarantees (reassure), and the ways in (act).
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AQUA_CHARACTER, SOURCE_CODE_URL, WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { PlayStoreBadge, TelegramCta, WebFallbackLink } from './Chrome';
import { DeviceFrame } from './PhoneShowcase';
import { Reveal, useInView } from './motion';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const H2 =
  'font-heading text-[clamp(2.25rem,1.55rem+2.8vw,4rem)] font-semibold leading-[0.98] tracking-[-0.015em] text-on-surface [text-wrap:balance]';
const LEAD = 'mt-5 max-w-[34em] text-[17px] leading-relaxed text-on-surface-variant [text-wrap:pretty]';

function MoreLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex min-h-[44px] items-center gap-2 text-[15px] font-semibold text-primary transition-colors duration-150 hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
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
/* Screens                                                             */
/* ------------------------------------------------------------------ */

const SCREENS = [
  {
    id: 'dashboard',
    title: 'Today at a glance',
    caption: 'Calories remaining, macro split and hydration, all computed from your own figures.',
    alt: 'Today: 2,382 kcal left as the lead figure, protein, carbs and fat against target as ruled rows, and the day’s checklist of meals, workout and water.',
  },
  {
    id: 'nutrition',
    title: 'Per-meal logging',
    caption: 'A searchable food corpus, barcode scanning and day navigation, meal by meal.',
    alt: 'Nutrition day view: 2,382 kcal remaining of a 2,580 goal, macros against target, quick actions to scan a meal or barcode, and each meal of the day.',
  },
  {
    id: 'coach',
    title: 'A coach that knows your day',
    caption: 'Grounded in what you have logged, with the wellness boundary always on screen.',
    alt: 'Coach chat with Akin: advice on easing into a recovery jog, under the persistent wellness disclaimer.',
  },
  {
    id: 'recipe',
    title: 'Recipes you can log as cooked',
    caption: 'Per-serving calories and macros, allergens called out, and the full method cached for offline reading.',
    alt: 'Recipe: avocado and egg sourdough toast at 440 kcal per serving with protein, carbs and fat, an allergen note, a servings stepper and the ingredient list.',
  },
  {
    id: 'workouts',
    title: 'Training that fits your kit',
    caption: 'An openly licensed exercise corpus, filtered to the equipment you actually own.',
    alt: 'Workouts: today’s full-body strength session with its exercises and a start button, the training week, and the exercise library.',
  },
  {
    id: 'progress',
    title: 'Progress over 7, 30 and 90 days',
    caption: 'Weight journey and calorie trend, so a single heavy day reads as a single day.',
    alt: 'Progress: current weight 80.0 kg as the lead figure, change since start, and the 28-day consistency window.',
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
    <section id="screens" aria-labelledby="screens-title" className="scroll-mt-24">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20">
        <div className="min-w-0">
          <Reveal>
            <h2 id="screens-title" className={H2}>
              Real screens from the running app.
            </h2>
            <p className={LEAD}>
              Captured from the Android app, signed in to a test account. Every number on them came
              out of the same code you would be using.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <div
              role="tablist"
              aria-label="Application screens"
              aria-orientation="vertical"
              onKeyDown={onKeyDown}
              className="mt-10 border-b border-on-surface/10"
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
                    className="group relative block w-full border-t border-on-surface/10 py-4 pl-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  >
                    <span
                      className={`absolute bottom-3 left-0 top-3 w-0.5 origin-top bg-primary transition-transform duration-200 ease-out ${
                        selected ? 'scale-y-100' : 'scale-y-0'
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`block font-heading text-[22px] font-semibold leading-tight transition-colors duration-150 ${
                        selected ? 'text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'
                      }`}
                    >
                      {screen.title}
                    </span>
                    {/* Only the selected screen carries its caption: six open
                        captions push the device below the fold on a phone. */}
                    {selected && (
                      <span className="mt-1 block max-w-[32em] text-[15px] leading-relaxed text-on-surface-variant">
                        {screen.caption}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <div
            id="screen-panel"
            role="tabpanel"
            aria-labelledby={`screen-tab-${SCREENS[active]!.id}`}
            className="relative mx-auto w-[272px] sm:w-[320px]"
          >
            {/* All screens stay mounted and stacked so switching is a
                crossfade rather than a fetch-and-flash. */}
            <div className="relative" style={{ aspectRatio: '780 / 1688' }}>
              {SCREENS.map((screen, i) => (
                <div
                  key={screen.id}
                  aria-hidden={i !== active}
                  className={`absolute inset-0 transition-opacity duration-300 ${
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
/* The split: who does what                                            */
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
    body: 'Mifflin–St Jeor, an activity factor and a safe weekly rate, clamped to a calorie floor with the clamp disclosed on screen.',
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
        <h2 id="features-title" className={`${H2} max-w-[14em]`}>
          The model looks. You confirm. Code counts.
        </h2>
        <p className={LEAD}>
          Models identify, interpret and explain. Code calculates, filters and enforces. That
          split is the whole design, and it is why the numbers on your screen can be trusted.
        </p>
      </Reveal>

      <ol className="mt-14 grid gap-px overflow-hidden rounded-[24px] border border-on-surface/10 bg-on-surface/10 sm:grid-cols-2 lg:grid-cols-4">
        {MEAL_STEPS.map((step, i) => (
          <Reveal as="li" key={step.title} delay={i * 60} className="bg-surface p-6 sm:p-7">
            <p className="flex items-baseline justify-between text-[13px]">
              <span className="tabular-nums text-on-surface-variant">Step {i + 1}</span>
              <span className={`font-semibold ${ACTOR_TONE[step.actor]}`}>{step.actor}</span>
            </p>
            <h3 className="mt-6 font-heading text-[26px] font-semibold leading-[1.05] text-on-surface [text-wrap:balance]">
              {step.title}
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-on-surface-variant [text-wrap:pretty]">
              {step.body}
            </p>
          </Reveal>
        ))}
      </ol>

      <Reveal>
        <dl className="mt-16 grid gap-x-16 sm:grid-cols-2">
          {FACTS.map((fact) => (
            <div key={fact.term} className="grid gap-2 border-t border-on-surface/10 py-6 md:grid-cols-[8rem_minmax(0,1fr)]">
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
/* Coach                                                               */
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
    text: 'That one is outside what I can help with. Thyroid medication is a clinical decision, so please talk to your doctor or pharmacist. I can keep helping with your meals and training in the meantime.',
    boundary: true,
  },
];

export function CoachDemo() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section id="coach" aria-labelledby="coach-title" className="scroll-mt-24">
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
        <Reveal>
          <h2 id="coach-title" className={H2}>
            Answers from your day. Stops where medicine starts.
          </h2>
          <p className={LEAD}>
            {AQUA_CHARACTER.title} replies from the nutrition, training and plan context you have
            actually logged. The question going in and the answer coming out both pass through
            safety guardrails.
          </p>
          <ul className="mt-8 border-b border-on-surface/10">
            {[
              'Grounded in your real targets, logs and plan, not a generic chatbot',
              'Remembers only what you confirm; suggested facts wait for your approval',
              'Personalisation is off until you consent, and revocable at any time',
            ].map((item) => (
              <li key={item} className="flex gap-3 border-t border-on-surface/10 py-3.5 text-[16px] leading-relaxed text-on-surface">
                <span className="material-symbols-outlined mt-0.5 text-[20px] text-secondary" aria-hidden="true">
                  check
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <MoreLink to="/aqua-coach">What the coach will and will not answer</MoreLink>
          </div>
        </Reveal>

        <div ref={ref} className={inView ? 'lp-in' : ''}>
          <div className="rounded-[28px] border border-on-surface/10 bg-surface-container-low p-2">
            <div className="flex items-center gap-3 px-4 py-3">
              <img
                src={AQUA_CHARACTER.characterUrl}
                alt=""
                width={682}
                height={1024}
                loading="lazy"
                decoding="async"
                className="h-11 w-11 rounded-full bg-black object-cover object-top"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-on-surface">{AQUA_CHARACTER.title}</p>
                <p className="text-[13px] text-on-surface-variant">Grounded in today&apos;s log</p>
              </div>
              {/* The screens above are real captures; this exchange is
                  scripted to show the refusal path, so it says so. */}
              <span className="rounded-full border border-on-surface/15 px-2.5 py-1 text-[12px] text-on-surface-variant">
                Illustrative
              </span>
            </div>

            <div className="space-y-3 rounded-[20px] bg-surface p-4 sm:p-5">
              {TURNS.map((turn, i) => (
                <div
                  key={turn.text}
                  className={`lp-bubble flex ${turn.from === 'user' ? 'justify-end' : 'justify-start'}`}
                  style={{ '--lp-delay': `${i * 380}ms` } as React.CSSProperties}
                >
                  <div
                    className={`max-w-[88%] rounded-[18px] px-4 py-3 text-[15px] leading-relaxed ${
                      turn.from === 'user'
                        ? 'bg-primary/15 text-on-surface'
                        : turn.boundary
                          ? 'border border-coral/30 bg-coral/[0.06] text-on-surface'
                          : 'bg-surface-container-high text-on-surface'
                    }`}
                  >
                    {turn.boundary && (
                      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-coral">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
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

            <p className="px-4 pb-3 pt-3 text-[13px] leading-relaxed text-on-surface-variant">
              {WELLNESS_DISCLAIMER}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Guarantees                                                          */
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
    <section id="safety" aria-labelledby="safety-title" className="scroll-mt-24">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
        <Reveal>
          <h2 id="safety-title" className={H2}>
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

        <Reveal delay={80}>
          <dl className="grid border-b border-on-surface/10 sm:grid-cols-2 sm:gap-x-10">
            {INVARIANTS.map((item) => (
              <div key={item.title} className="border-t border-on-surface/10 py-6">
                <dt className="font-heading text-[22px] font-semibold leading-tight text-on-surface">
                  {item.title}
                </dt>
                <dd className="mt-2 text-[16px] leading-relaxed text-on-surface-variant [text-wrap:pretty]">
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
/* Ways in                                                             */
/* ------------------------------------------------------------------ */

/**
 * The closing call to action: the three real surfaces, side by side, because
 * they are three different things (an install, a no-install launch, a web
 * sign-up) on one account.
 */
export function WaysIn() {
  return (
    <section id="get" aria-labelledby="get-title" className="scroll-mt-24">
      <Reveal>
        <h2 id="get-title" className={`${H2} max-w-[12em]`}>
          Three ways in. One account.
        </h2>
        <p className={LEAD}>
          Start wherever you already are. Your profile, logs and plan follow you between them.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-px overflow-hidden rounded-[28px] border border-on-surface/10 bg-on-surface/10 md:grid-cols-3">
        <Reveal className="flex flex-col bg-surface-container-low p-7">
          <h3 className="font-heading text-[28px] font-semibold leading-none text-on-surface">Android</h3>
          <p className="mt-3 flex-1 text-[16px] leading-relaxed text-on-surface-variant">
            The native app on Google Play, with photo logging and barcode scanning built in.
          </p>
          <div className="mt-8 flex">
            <PlayStoreBadge placement="final" />
          </div>
        </Reveal>
        <Reveal delay={60} className="flex flex-col bg-surface-container-low p-7">
          <h3 className="font-heading text-[28px] font-semibold leading-none text-on-surface">Telegram</h3>
          <p className="mt-3 flex-1 text-[16px] leading-relaxed text-on-surface-variant">
            A Mini App inside the client you already have. No install, no new password.
          </p>
          <div className="mt-8 flex">
            <TelegramCta placement="final" />
          </div>
        </Reveal>
        <Reveal delay={120} className="flex flex-col bg-surface-container-low p-7">
          <h3 className="font-heading text-[28px] font-semibold leading-none text-on-surface">Browser</h3>
          <p className="mt-3 flex-1 text-[16px] leading-relaxed text-on-surface-variant">
            Telegram blocked at work? The browser version is the same app and the same account.
          </p>
          <div className="mt-8 flex">
            <WebFallbackLink placement="final" />
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="mt-6 flex flex-col gap-4 rounded-[28px] border border-on-surface/10 p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-[36em]">
            <h3 className="font-heading text-[24px] font-semibold leading-tight text-on-surface">
              Open source, licence and all.
            </h3>
            <p className="mt-2 text-[16px] leading-relaxed text-on-surface-variant">
              Free software under the GNU AGPL v3. Read how your targets are computed, check the
              guardrails, or run the whole platform yourself: with no AI keys configured it falls
              back to a deterministic offline engine.
            </p>
          </div>
          <a
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-2 text-[15px] font-semibold text-primary transition-colors duration-150 hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
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
