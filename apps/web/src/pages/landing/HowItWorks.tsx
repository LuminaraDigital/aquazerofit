/**
 * /how-it-works — the dedicated walkthrough linked from the footer.
 *
 * Deliberately a different shape from /features: that page is a reference of
 * capabilities and constants, this one is the journey in order, with each step
 * split into what you do and what the application does in response. Where a
 * step depends on a specific number, it links across to the reference rather
 * than restating it, so there is exactly one place for those figures to live.
 */
import { Link } from 'react-router-dom';
import { WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { DeviceFrame } from './PhoneShowcase';
import { MarketingPage, PageCta, PageHero } from './Page';
import { Reveal } from './motion';

interface StepSpec {
  id: string;
  title: string;
  lead: string;
  you: string[];
  app: string[];
  note?: string;
  link?: { to: string; label: string };
  screenshot: string;
  alt: string;
}

const STEPS: StepSpec[] = [
  {
    id: 'profile',
    title: 'Build your profile',
    lead: 'Two minutes of setup, and the first thing you see is a set of targets computed from your own figures.',
    you: [
      'Age, height, weight, sex and how active your week usually is.',
      'Your goal — losing, maintaining or gaining.',
      'The equipment you own, and anything you need to avoid eating.',
    ],
    app: [
      'Computes your basal rate with Mifflin-St Jeor, applies the activity factor for the week you described, and adjusts it by a rate of change bounded to a safe fraction of bodyweight.',
      'Clamps the result to a calorie floor — and tells you on screen when the clamp binds, rather than showing a quietly adjusted number.',
      'Sets protein and fat from your bodyweight and goal, gives carbohydrate the remainder, and derives a hydration target from your weight.',
    ],
    link: { to: '/features#targets', label: 'See the exact formulas and constants' },
    screenshot: 'dashboard',
    alt: 'The dashboard after onboarding: calories remaining, the macro split for the day, and a hydration target.',
  },
  {
    id: 'log',
    title: 'Log your first meal',
    lead: 'Three ways in, one rule out: a model may propose what you ate, but nothing is recorded until you say so.',
    you: [
      'Photograph the plate, search the food corpus by name, or scan a barcode.',
      'Say which meal it belongs to — breakfast, lunch, dinner or a snack.',
      'Check the proposal, correct a portion if it is off, and confirm.',
    ],
    app: [
      'Discards the photo’s EXIF, XMP, IPTC and ICC metadata on upload — a phone picture carries GPS at home-address precision — and stores it under an unguessable name that is never served publicly.',
      'Queues the analysis as a background job, so you can close the screen and come back to the result.',
      'Multiplies the confirmed portions out against per-100 g values in code, then sweeps the photo within a day of the job finishing.',
    ],
    note: 'A photograph never writes to your day on its own. If the analysis fails, its photo is deleted immediately.',
    screenshot: 'capture-meal',
    alt: 'The meal capture screen: framing brackets, a hint about lighting and angle, meal-type selector and shutter button.',
  },
  {
    id: 'plan',
    title: 'Let a plan form around the targets',
    lead: 'Suggestions and meal plans are generated against the numbers from step one, then filtered by code before they reach you.',
    you: [
      'Ask for a suggestion when you are short on ideas, or generate a plan for the days ahead.',
      'Open any recipe for the method and quantities.',
    ],
    app: [
      'Generates candidates against your remaining calories and macro targets for the day, not a generic template.',
      'Runs a deterministic allergen filter after generation, tuned to reject anything it cannot prove safe rather than risk a miss.',
      'Leaves the arithmetic where it belongs: the totals you see are computed, not narrated.',
    ],
    screenshot: 'meal-plan',
    alt: 'A generated meal plan laid out against the day’s calorie and macro targets.',
  },
  {
    id: 'train',
    title: 'Train with the kit you actually own',
    lead: 'The training week is assembled from an openly licensed exercise corpus, filtered to your equipment.',
    you: [
      'Pick your equipment once — bodyweight-only is a complete answer, not a compromise.',
      'Follow the week, and log the sessions you complete.',
    ],
    app: [
      'Filters the corpus by equipment, muscle group and movement type before a plan is ever assembled.',
      'Adjusts the plan as your logged sessions and weight move, instead of handing you a fixed schedule to fall behind.',
      'Keeps each exercise’s CC BY-SA licence, author and source visible, and labels any illustration that was model-generated.',
    ],
    screenshot: 'workouts',
    alt: 'The workout library: the training week, a rest-day card, and exercises filtered by type, muscle group and equipment.',
  },
  {
    id: 'ask',
    title: 'Ask the coach',
    lead: 'Aqua Coach answers from the day you have actually logged — and declines the questions it has no business answering.',
    you: [
      'Ask in plain language: how am I tracking, what should I eat tonight, why is my weight flat.',
      'Approve or reject anything it offers to remember about you.',
    ],
    app: [
      'Assembles today’s nutrition totals, the session on your plan and your recent progress as context before generating anything.',
      'Passes both your question and its answer through safety classification, refusing medical, crisis and extreme-diet requests with a supportive signpost instead of an improvised reply.',
      'Keeps the wellness boundary on screen, and holds suggested facts about you until you confirm them.',
    ],
    note: 'Personalisation stays off until you consent to it, and consent can be withdrawn at any time.',
    link: { to: '/features#coach', label: 'See what the coach remembers, and for how long' },
    screenshot: 'coach',
    alt: 'Aqua Coach quoting today’s logged calories, protein, carbs, fat and water above the persistent wellness disclaimer.',
  },
  {
    id: 'trend',
    title: 'Watch the trend, not the day',
    lead: 'Weigh in when you feel like it. What matters is the shape of the line, and the app is built to show you that instead of a daily verdict.',
    you: [
      'Log your weight whenever you like — daily, weekly, or when you remember.',
      'Switch between 7, 30 and 90 days to see the trend at the scale you care about.',
    ],
    app: [
      'Plots your weight journey against your goal, with intake beside it, so a heavy day reads as a heavy day rather than a failure.',
      'Recomputes your targets when your weight or goal moves, using the same deterministic maths as the first day.',
      'Writes summaries that describe what the data shows. They do not diagnose, and they do not moralise.',
    ],
    screenshot: 'progress',
    alt: 'The progress view: current weight, change since start, a weight journey chart against goal, and a calorie trend bar chart.',
  },
];

const RULES = [
  {
    icon: 'task_alt',
    title: 'You confirm, always',
    body: 'No photograph, suggestion or remembered fact changes your data until you have seen it and agreed.',
  },
  {
    icon: 'function',
    title: 'Code does the arithmetic',
    body: 'Every number presented as fact — targets, totals, trends — is computed. Models describe; they do not count.',
  },
  {
    icon: 'lock',
    title: 'Nothing personalises without consent',
    body: 'AI personalisation is off until you turn it on, and turning it back off is one switch.',
  },
];

function Step({ step, index }: { step: StepSpec; index: number }) {
  const flip = index % 2 === 1;
  return (
    <section id={step.id} className="scroll-mt-24">
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_290px] lg:gap-14">
        <Reveal className="min-w-0">
          <div className="flex items-baseline gap-4">
            <span
              className="font-heading text-5xl font-semibold leading-none text-white/10 tabular-nums"
              aria-hidden="true"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <h2 className="font-heading text-2xl font-semibold leading-tight text-on-surface sm:text-[32px]">
              {step.title}
            </h2>
          </div>

          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant/75">
            {step.lead}
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div className="lp-card p-5">
              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/90">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  person
                </span>
                What you do
              </h3>
              <ul className="mt-3 space-y-2.5">
                {step.you.map((item) => (
                  <li key={item} className="text-[13px] leading-relaxed text-on-surface-variant/75">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lp-card p-5">
              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  settings_suggest
                </span>
                What the app does
              </h3>
              <ul className="mt-3 space-y-2.5">
                {step.app.map((item) => (
                  <li key={item} className="text-[13px] leading-relaxed text-on-surface-variant/75">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {step.note && (
            <p className="mt-4 flex gap-3 rounded-2xl border border-primary/20 bg-primary/[0.05] px-4 py-3 text-[13px] leading-relaxed text-on-surface-variant/80">
              <span
                className="material-symbols-outlined shrink-0 text-[18px] text-primary"
                aria-hidden="true"
              >
                shield
              </span>
              {step.note}
            </p>
          )}

          {step.link && (
            <Link
              to={step.link.to}
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              {step.link.label}
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          )}
        </Reveal>

        <Reveal delay={120} className={flip ? 'lg:order-first' : ''}>
          <div className="relative mx-auto w-[250px] sm:w-[290px]">
            <div
              className="pointer-events-none absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(47,217,244,0.14),transparent_65%)] blur-2xl"
              aria-hidden="true"
            />
            <div className="relative">
              <DeviceFrame id={step.screenshot} alt={step.alt} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function HowItWorksPage() {
  return (
    <MarketingPage path="/how-it-works">
      <PageHero
        crumb="How it works"
        title={
          <>
            From sign-up to <span className="lp-gradient-text">steady state</span>
          </>
        }
        lead="Six steps, in the order you will meet them. Each one is split into what you do and what the application does in response — including the parts that happen out of sight, because those are the ones worth knowing about in a product that handles what you eat and how much you weigh."
        secondary={{ to: '/features', label: 'Browse the features' }}
      >
        {/* Step index */}
        <Reveal delay={280}>
          <ol className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.id}>
                <a
                  href={`#${step.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.015] px-4 py-3 transition-colors hover:border-primary/25 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span
                    className="font-heading text-sm font-semibold tabular-nums text-primary/70"
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm text-on-surface-variant/80">{step.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </Reveal>
      </PageHero>

      <div className="mx-auto max-w-6xl space-y-24 px-5 pb-24 sm:space-y-28 sm:pb-32">
        {STEPS.map((step, i) => (
          <Step key={step.id} step={step} index={i} />
        ))}

        {/* The through-line */}
        <section id="rules" className="scroll-mt-24">
          <Reveal>
            <h2 className="text-center font-heading text-2xl font-semibold text-on-surface sm:text-[32px]">
              Three rules that hold at every step
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {RULES.map((rule, i) => (
              <Reveal key={rule.title} delay={i * 90}>
                <div className="lp-card h-full p-6">
                  <span
                    className="material-symbols-outlined text-[22px] text-primary"
                    aria-hidden="true"
                  >
                    {rule.icon}
                  </span>
                  <h3 className="mt-4 font-heading text-lg font-semibold text-on-surface">
                    {rule.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                    {rule.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <PageCta
          title="Step one takes about two minutes"
          lead="Build a profile and your targets are on screen the moment you finish. Everything after that is a few taps a day."
          disclaimer={WELLNESS_DISCLAIMER}
        />
      </div>
    </MarketingPage>
  );
}
