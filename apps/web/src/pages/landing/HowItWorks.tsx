/**
 * /how-it-works — Editorial 6-Step Scrollytelling Walkthrough.
 *
 * Signature architecture: clean editorial header flowing straight into a
 * 6-step timeline rail, paired with wide readable stacked "What you do" /
 * "What the app does" panels beside ONE sticky 3D-tilting Android release
 * capture (no cloned hero phone fan, no 320px overflow, no onMouseEnter
 * fighting scroll-spy).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { DeviceFrame, type ScreenshotId } from './PhoneShowcase';
import { MarketingPage, PageCta, PageHero } from './Page';
import { prefersReducedMotion, Reveal } from './motion';

interface StepSpec {
  id: string;
  title: string;
  lead: string;
  you: string[];
  app: string[];
  note?: string;
  link?: { to: string; label: string };
  screenshot: ScreenshotId;
  alt: string;
}

const STEPS: StepSpec[] = [
  {
    id: 'profile',
    title: 'Build your profile',
    lead: 'Two minutes of setup, and the first thing you see is a set of targets computed from your own figures.',
    you: [
      'Age, height, weight, sex and how active your week usually is.',
      'Your goal - losing, maintaining or gaining.',
      'The equipment you own, and anything you need to avoid eating.',
    ],
    app: [
      'Computes your basal rate with Mifflin-St Jeor, applies the activity factor for the week you described, and adjusts it by a rate of change bounded to a safe fraction of bodyweight.',
      'Clamps the result to a calorie floor - and tells you on screen when the clamp binds, rather than showing a quietly adjusted number.',
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
      'Say which meal it belongs to - breakfast, lunch, dinner or a snack.',
      'Check the proposal, correct a portion if it is off, and confirm.',
    ],
    app: [
      'Discards the photo’s EXIF, XMP, IPTC and ICC metadata on upload - a phone picture carries GPS at home-address precision - and stores it under an unguessable name that is never served publicly.',
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
    screenshot: 'recipe',
    alt: 'A recipe from the plan: per-serving calories and macros, an allergen note and a servings stepper.',
  },
  {
    id: 'train',
    title: 'Train with the kit you actually own',
    lead: 'The training week is assembled from an openly licensed exercise corpus, filtered to your equipment.',
    you: [
      'Pick your equipment once - bodyweight-only is a complete answer, not a compromise.',
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
    lead: 'Aqua Coach answers from the day you have actually logged - and declines the questions it has no business answering.',
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
      'Log your weight whenever you like - daily, weekly, or when you remember.',
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
    title: 'You confirm, always',
    body: 'No photograph, suggestion or remembered fact changes your data until you have seen it and agreed.',
  },
  {
    title: 'Code does the arithmetic',
    body: 'Every number presented as fact - targets, totals, trends - is computed. Models describe; they do not count.',
  },
  {
    title: 'Nothing personalises without consent',
    body: 'AI personalisation is off until you turn it on, and turning it back off is one switch.',
  },
];

function scrollStepIntoView(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}

export default function HowItWorksPage() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const elements = STEPS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (!elements.length) return;

    const visibleMap = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleMap.set(entry.target.id, entry.boundingClientRect.top);
          } else {
            visibleMap.delete(entry.target.id);
          }
        }
        if (visibleMap.size === 0) return;
        let bestId = '';
        let bestTop = Infinity;
        for (const [id, top] of visibleMap) {
          if (top < bestTop) {
            bestTop = top;
            bestId = id;
          }
        }
        const idx = STEPS.findIndex((s) => s.id === bestId);
        if (idx >= 0) setActiveIdx(idx);
      },
      { rootMargin: '-18% 0px -45% 0px', threshold: 0.05 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const activeStep = STEPS[activeIdx] ?? STEPS[0]!;

  return (
    <MarketingPage path="/how-it-works">
      <PageHero
        crumb="How it works"
        kicker="Six steps in order"
        title="From sign-up to steady state"
        lead="Six steps, in the order you will meet them. Each step separates what you do from what the code does out of sight - because transparency matters in a product that handles what you eat and weigh."
        secondary={{ to: '/features', label: 'Browse the features' }}
      >
        {/* Full-width 6-Step Timeline Rail (unique signature of /how-it-works) */}
        <ol className="mt-10 grid gap-2.5 border-t border-outline-variant/60 pt-8 sm:grid-cols-2 lg:grid-cols-6">
          {STEPS.map((step, i) => {
            const selected = i === activeIdx;
            return (
              <li key={step.id}>
                <a
                  href={`#${step.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveIdx(i);
                    scrollStepIntoView(step.id);
                  }}
                  aria-current={selected ? 'step' : undefined}
                  className={`flex min-h-[72px] flex-col justify-between rounded-xl border px-3.5 py-3 transition-colors ${
                    selected
                      ? 'border-primary-fixed-dim bg-surface-container text-on-surface'
                      : 'border-outline/75 bg-surface-container-low text-on-surface-variant hover:border-primary hover:text-on-surface'
                  }`}
                >
                  <span className="stat-label tabular-nums text-primary">Step 0{i + 1}</span>
                  <span className="mt-1.5 text-[13.5px] font-medium leading-snug">{step.title}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </PageHero>

      <div className="mx-auto max-w-[1200px] space-y-24 px-5 pb-24 sm:px-8 sm:pb-32">
        {/* Sticky 3D Phone Scrollytelling Split */}
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_328px] lg:gap-16">
          <div className="min-w-0 space-y-12 sm:space-y-16">
            {STEPS.map((step, index) => {
              const active = index === activeIdx;
              return (
                <section
                  key={step.id}
                  id={step.id}
                  className={`scroll-mt-28 rounded-card border p-6 transition-colors sm:p-8 ${
                    active
                      ? 'border-primary-fixed-dim/50 bg-surface-container-low'
                      : 'border-outline-variant/65 bg-surface-container-low/70'
                  }`}
                >
                  <div className="flex items-baseline gap-3.5">
                    <span
                      className="font-heading text-[40px] font-bold leading-none tabular-nums text-primary/40"
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h2 className="font-heading text-[28px] font-semibold leading-tight text-on-surface sm:text-[34px]">
                      {step.title}
                    </h2>
                  </div>

                  <p className="mt-3.5 max-w-[60ch] text-[15.5px] leading-relaxed text-on-surface-variant">
                    {step.lead}
                  </p>

                  {/* Full-width stacked bands — comfortable reading measure */}
                  <div className="mt-6 space-y-4">
                    <div className="rounded-xl border border-outline-variant/60 bg-surface p-5">
                      <h3 className="flex items-center gap-2 stat-label text-primary">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                          person
                        </span>
                        What you do
                      </h3>
                      <ul className="mt-3 space-y-2">
                        {step.you.map((item) => (
                          <li
                            key={item}
                            className="flex gap-2.5 text-[14.5px] leading-relaxed text-on-surface-variant"
                          >
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/80" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl border border-outline-variant/60 bg-surface p-5">
                      <h3 className="flex items-center gap-2 stat-label text-secondary">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                          settings_suggest
                        </span>
                        What the app does
                      </h3>
                      <ul className="mt-3 space-y-2">
                        {step.app.map((item) => (
                          <li
                            key={item}
                            className="flex gap-2.5 text-[14.5px] leading-relaxed text-on-surface-variant"
                          >
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary/80" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {step.note && (
                    <p className="mt-4 flex gap-3 rounded-xl border border-primary-fixed-dim/35 bg-primary/[0.06] px-4 py-3 text-[14px] leading-relaxed text-on-surface">
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
                      className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-[15px] font-semibold text-primary transition-colors hover:text-on-surface"
                    >
                      {step.link.label}
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                        arrow_forward
                      </span>
                    </Link>
                  )}

                  {/* Mobile inline capture */}
                  <div className="mx-auto mt-6 w-[256px] lg:hidden">
                    <DeviceFrame id={step.screenshot} alt={step.alt} interactive={false} />
                  </div>
                </section>
              );
            })}
          </div>

          {/* Sticky 3D Phone Viewport on Desktop */}
          <aside
            className="hidden lg:sticky lg:top-24 lg:block lg:self-start"
            aria-label="Active step screen preview"
          >
            <div className="mb-3 flex items-baseline justify-between px-1">
              <span className="stat-label tabular-nums text-primary">Step 0{activeIdx + 1}</span>
              <span className="text-[13px] text-on-surface-variant">{activeStep.title}</span>
            </div>

            <DeviceFrame
              id={activeStep.screenshot}
              alt={activeStep.alt}
              caption="Android release capture"
            />

            <div className="mt-3 flex justify-center gap-1" role="group" aria-label="Jump to step">
              {STEPS.map((step, i) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    setActiveIdx(i);
                    scrollStepIntoView(step.id);
                  }}
                  aria-label={`Jump to step ${i + 1}: ${step.title}`}
                  aria-pressed={i === activeIdx}
                  className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-[transform,background-color] duration-200 ${
                      i === activeIdx
                        ? 'w-6 bg-primary'
                        : 'w-2 bg-outline/60 hover:bg-on-surface-variant'
                    }`}
                  />
                </button>
              ))}
            </div>
          </aside>
        </div>

        {/* Architectural horizontal 3-rule strip */}
        <section id="rules" className="scroll-mt-24">
          <Reveal>
            <p className="stat-label text-primary">The Through-Line</p>
            <h2 className="mt-2 font-heading text-[30px] font-semibold text-on-surface sm:text-[38px]">
              Three rules that hold at every step
            </h2>
          </Reveal>
          <dl className="mt-8 grid gap-x-10 border-y border-outline-variant/60 sm:grid-cols-3">
            {RULES.map((rule) => (
              <div key={rule.title} className="border-t border-outline-variant/60 py-6 first:border-t-0 sm:border-t-0">
                <dt className="font-heading text-[22px] font-semibold text-on-surface">
                  {rule.title}
                </dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-on-surface-variant">
                  {rule.body}
                </dd>
              </div>
            ))}
          </dl>
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
