/**
 * /aqua-coach — the dedicated page for the coach, linked from the footer.
 *
 * Route is /aqua-coach, not /coach: the latter is the signed-in chat screen
 * inside the application, and a marketing page must not shadow it.
 *
 * The guardrail material here is drawn from the shipped classifier
 * (apps/api/src/modules/ai/guardrails.ts and prompts/P-09) rather than written
 * as copy — the categories, their priority order and the refusal text are the
 * ones the product actually applies.
 */
import { Link } from 'react-router-dom';
import {
  CHAT_HISTORY_MAX_CHARS,
  CHAT_HISTORY_MAX_TURNS,
  CREDIT_COSTS,
  CRISIS_SIGNPOST,
  FREE_TIER_DAILY_CREDITS,
  MEMORY_EXTRACTION_MAX_FACTS_PER_TURN,
  MEMORY_FACT_MAX_CHARS,
  MEMORY_MAX_FACTS_CONFIRMED,
  MEMORY_MAX_FACTS_SUGGESTED,
  MEMORY_REJECTED_RETENTION_DAYS,
  WELLNESS_DISCLAIMER,
} from '@aquazerofit/shared';
import { DeviceFrame } from './PhoneShowcase';
import { Bullet, MarketingPage, PageCta, PageHero, Spec } from './Page';
import { Reveal } from './motion';

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const HELPS_WITH = [
  'How you are tracking against today’s calorie, macro and hydration targets.',
  'What to eat with the calories you have left, and what fits your allergens.',
  'Why a number on your dashboard is what it is.',
  'Making sense of a flat week in the trend without catastrophising it.',
  'Working around the equipment and the time you actually have.',
  'The unglamorous habits: hydration, consistency, planning tomorrow tonight.',
];

/** The classifier's closed set of labels, in its own priority order. */
const CATEGORIES = [
  {
    label: 'crisis',
    covers:
      'Self-harm or suicidal language, and eating-disorder indicators — guilt or punishment around eating, fear of food, binge-purge language.',
    response: 'Stops and signposts real support. No answer is generated.',
    tone: 'coral' as const,
  },
  {
    label: 'medical',
    covers:
      'Diagnosis, medication and dosage, interpretation of test results, treatment, injury rehabilitation.',
    response: 'Declined, with a pointer to a clinician rather than a guess.',
    tone: 'coral' as const,
  },
  {
    label: 'extremeDiet',
    covers:
      'Prolonged fasting, calorie targets below the floor, purging, laxatives or diuretics for weight, crash diets, dehydration for weight.',
    response: 'Declined. The floors exist precisely so this is not negotiable.',
    tone: 'coral' as const,
  },
  {
    label: 'outOfScope',
    covers: 'Legal, financial and mental-health treatment questions.',
    response: 'Declined as outside what a wellness app should answer.',
    tone: 'primary' as const,
  },
  {
    label: 'safe',
    covers: 'Everything else within everyday wellness.',
    response: 'Answered, grounded in your logged day.',
    tone: 'secondary' as const,
  },
];

const EXCHANGES = [
  {
    id: 'grounded',
    question: 'How am I tracking today?',
    answer:
      'You have around 768 kcal left and you are 32 g short on protein. A Greek yoghurt with berries would close most of that gap without crowding dinner.',
    kind: 'answer' as const,
  },
  {
    id: 'medical',
    question: 'Should I take something for my thyroid?',
    answer:
      'That one is outside what I can help with — thyroid medication is a clinical decision. Please talk to your doctor or pharmacist. I can keep helping with your meals and training in the meantime.',
    kind: 'refusal' as const,
    badge: 'medical',
  },
  {
    id: 'extreme',
    question: 'Give me a 600 calorie a day plan.',
    answer:
      'I will not build that. Targets below the calorie floor are not something this app will propose, whatever the goal. I can put together an honest deficit that still gets you where you are going.',
    kind: 'refusal' as const,
    badge: 'extremeDiet',
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

export default function AquaCoachPage() {
  return (
    <MarketingPage documentTitle="Aqua Coach — AquaZeroFit">
      <PageHero
        crumb="Aqua Coach"
        title={
          <>
            The coach that <span className="lp-gradient-text">knows where it stops</span>
          </>
        }
        lead="Aqua Coach answers from the day you have actually logged. It is not a general assistant with a fitness costume on: its context is your data, its boundaries are enforced in code before and after every reply, and the things it will not discuss are a published list rather than a hope."
        secondary={{ to: '/how-it-works', label: 'See the whole journey' }}
      />

      <div className="mx-auto max-w-6xl space-y-24 px-5 pb-24 sm:space-y-28 sm:pb-32">
        {/* ---------------------------------------------------------- */}
        <Section
          id="scope"
          eyebrow="Scope"
          title="What it is for"
          lead="A coach with a narrow remit is more useful than an assistant with none, because you can tell in advance which answers to trust."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="lp-card p-6">
              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  check_circle
                </span>
                Ask it about
              </h3>
              <ul className="mt-4 space-y-2.5">
                {HELPS_WITH.map((item) => (
                  <li key={item} className="text-sm leading-relaxed text-on-surface-variant/75">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lp-card p-6">
              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-coral">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  do_not_disturb_on
                </span>
                It will decline
              </h3>
              <ul className="mt-4 space-y-2.5">
                <li className="text-sm leading-relaxed text-on-surface-variant/75">
                  Anything clinical — diagnosis, medication, test results, treatment, rehab.
                </li>
                <li className="text-sm leading-relaxed text-on-surface-variant/75">
                  Anything below the safety floors, however the request is framed.
                </li>
                <li className="text-sm leading-relaxed text-on-surface-variant/75">
                  Legal, financial and mental-health treatment questions.
                </li>
                <li className="text-sm leading-relaxed text-on-surface-variant/75">
                  Crisis conversations — it signposts real support instead of improvising.
                </li>
              </ul>
              <p className="mt-5 text-[12px] leading-relaxed text-on-surface-variant/70">
                Over-blocking is treated as acceptable and under-blocking is not, so it will
                occasionally decline something benign. That trade is deliberate.
              </p>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="grounding"
          eyebrow="Grounding"
          title="What it knows when you ask"
          lead="Before a single token is generated, the coach is handed the state of your day. That is the difference between advice about someone and advice about you."
        >
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_290px] lg:gap-14">
            <div className="min-w-0">
              <ul className="space-y-4">
                <Bullet title="Today’s nutrition">
                  Calories and macros logged so far against your targets, plus water.
                </Bullet>
                <Bullet title="Today’s training">
                  The session your plan calls for, or the fact that it is a rest day.
                </Bullet>
                <Bullet title="Your current plan">
                  Which plan is active, so suggestions fit the week you are actually in.
                </Bullet>
                <Bullet title="Your progress">
                  Weight, the change since you started, streak and completed sessions.
                </Bullet>
                <Bullet title="Only what you approved">
                  Remembered facts join that context if — and only if — you have turned
                  personalisation on and confirmed them.
                </Bullet>
              </ul>

              <div className="mt-6">
                <Spec
                  rows={[
                    ['Conversation history carried', `last ${CHAT_HISTORY_MAX_TURNS} exchanges`],
                    ['History budget', `${CHAT_HISTORY_MAX_CHARS.toLocaleString()} characters`],
                    ['Cost of a message', `${CREDIT_COSTS.chatTurn} credit`],
                    ['Free credits each day', `${FREE_TIER_DAILY_CREDITS}`],
                  ]}
                  caption="History is truncated oldest-first, so a long conversation stays affordable and stays inside the window the model can actually attend to."
                />
              </div>
            </div>

            <div className="relative mx-auto w-[250px] sm:w-[290px]">
              <div
                className="pointer-events-none absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(47,217,244,0.14),transparent_65%)] blur-2xl"
                aria-hidden="true"
              />
              <div className="relative">
                <DeviceFrame
                  id="coach"
                  alt="Aqua Coach quoting today's logged calories, protein, carbs, fat and water, with the context it used listed beneath."
                />
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="guardrails"
          eyebrow="Guardrails"
          title="Checked on the way in, and on the way out"
          lead="Your message is classified before any premium token is spent, and the generated answer is checked again before it reaches you. The first-line classifier is deterministic pattern matching in code — not a model asked nicely to behave."
        >
          {/*
            Below `sm` the three columns collapse to stacked blocks: at 390px
            they otherwise wrap to two or three words per line and the table
            stops being readable. Changing the display of table elements drops
            their implicit semantics in some browsers, so the roles are stated
            explicitly rather than assumed.
          */}
          <div className="lp-card overflow-hidden">
            <table
              role="table"
              aria-label="Safety classifier labels"
              className="w-full text-left text-sm"
            >
              <thead className="hidden sm:table-header-group">
                <tr role="row" className="border-b border-white/8">
                  {['Label', 'What it covers', 'What happens'].map((heading) => (
                    <th
                      key={heading}
                      role="columnheader"
                      scope="col"
                      className="px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-on-surface-variant/70"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {CATEGORIES.map((category, i) => (
                  <tr
                    key={category.label}
                    role="row"
                    className={`block px-5 py-4 sm:table-row sm:p-0 ${
                      i > 0 ? 'border-t border-white/5' : ''
                    }`}
                  >
                    <th
                      role="rowheader"
                      scope="row"
                      className="block pb-2 text-left sm:table-cell sm:px-5 sm:py-4 sm:align-top"
                    >
                      <code
                        className={`rounded-md px-2 py-1 text-[12px] font-semibold ${
                          category.tone === 'coral'
                            ? 'bg-coral/10 text-coral'
                            : category.tone === 'secondary'
                              ? 'bg-secondary/10 text-secondary'
                              : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {category.label}
                      </code>
                    </th>
                    <td
                      role="cell"
                      className="block text-[13px] leading-relaxed text-on-surface-variant/75 sm:table-cell sm:px-5 sm:py-4 sm:align-top"
                    >
                      {category.covers}
                    </td>
                    <td
                      role="cell"
                      className="mt-2 block text-[13px] leading-relaxed text-on-surface sm:mt-0 sm:table-cell sm:px-5 sm:py-4 sm:align-top sm:text-on-surface-variant/75"
                    >
                      <span className="text-primary sm:hidden" aria-hidden="true">
                        →{' '}
                      </span>
                      {category.response}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="lp-card p-5">
              <h3 className="font-heading text-base font-semibold text-on-surface">
                Overlap resolves upward
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant/75">
                A message that could be read two ways takes the more serious label: crisis before
                medical, medical before extreme diet.
              </p>
            </div>
            <div className="lp-card p-5">
              <h3 className="font-heading text-base font-semibold text-on-surface">
                Framing does not launder it
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant/75">
                Role-play, &quot;hypothetically&quot;, or an instruction to ignore the rules never
                lowers a label. The underlying request is what gets classified.
              </p>
            </div>
            <div className="lp-card p-5">
              <h3 className="font-heading text-base font-semibold text-on-surface">
                The answer is checked too
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant/75">
                Output is scanned for medical and extreme-diet patterns, and for numeric claims that
                break the calorie floor or macro sanity — the rules a model cannot be trusted to
                respect on its own.
              </p>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="crisis"
          eyebrow="Crisis"
          title="The one answer it is allowed to give"
          lead="When a message carries self-harm or eating-disorder signals, generation stops. There is no clever reply here, and there should not be. This is the exact text the app returns:"
        >
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_290px] lg:gap-14">
            <div className="min-w-0">
              <blockquote className="lp-card border-l-2 border-l-coral p-6">
                <p className="text-[15px] leading-relaxed text-on-surface">{CRISIS_SIGNPOST}</p>
              </blockquote>
              <p className="mt-4 text-[13px] leading-relaxed text-on-surface-variant/70">
                The crisis line named is an Australian service, matching where AquaZeroFit is
                published. A deployment serving another country is expected to repoint it — it is a
                single constant, and it is the kind of thing a fork must not leave stale.
              </p>
              <p className="mt-6 flex gap-3 rounded-2xl border border-primary/20 bg-primary/[0.05] px-4 py-3 text-[13px] leading-relaxed text-on-surface-variant/80">
                <span
                  className="material-symbols-outlined shrink-0 text-[18px] text-primary"
                  aria-hidden="true"
                >
                  info
                </span>
                The wellness disclaimer is pinned to the coach screen and the profile — not buried
                in a settings page you would have to go looking for.
              </p>
            </div>

            <div className="relative mx-auto w-[250px] sm:w-[290px]">
              <div
                className="pointer-events-none absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(255,178,185,0.12),transparent_65%)] blur-2xl"
                aria-hidden="true"
              />
              <div className="relative">
                <DeviceFrame
                  id="settings"
                  alt="The profile screen with the wellness disclaimer displayed above the user's wellness profile."
                />
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="memory"
          eyebrow="Memory"
          title="It remembers what you approve, and nothing else"
          lead="A coach that forgets you every morning is tiring. A coach that quietly builds a file on you is worse. The middle path is that every remembered fact passes through you first."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <ul className="space-y-4">
                <Bullet title="Suggested, never assumed">
                  A conversation may produce at most {MEMORY_EXTRACTION_MAX_FACTS_PER_TURN}{' '}
                  suggested facts, and they arrive as suggestions — never as confirmed memory.
                </Bullet>
                <Bullet title="You confirm or reject each one">
                  Confirmed facts join the coach&apos;s context. Rejected ones never do.
                </Bullet>
                <Bullet title="Removable at any time">
                  Anything remembered can be deleted, and personalisation can be switched off
                  entirely without losing your logs.
                </Bullet>
                <Bullet title="Rejections are kept briefly, for one reason">
                  So the same fact is not suggested to you over and over. They are not used to
                  personalise anything, and they are erased on schedule.
                </Bullet>
              </ul>
            </div>

            <Spec
              rows={[
                ['Confirmed facts kept', `up to ${MEMORY_MAX_FACTS_CONFIRMED}`],
                ['Suggestions awaiting review', `up to ${MEMORY_MAX_FACTS_SUGGESTED}`],
                ['Suggested per conversation', `at most ${MEMORY_EXTRACTION_MAX_FACTS_PER_TURN}`],
                ['Length of a single fact', `${MEMORY_FACT_MAX_CHARS} characters`],
                ['Rejected facts retained', `${MEMORY_REJECTED_RETENTION_DAYS} days, then erased`],
              ]}
              caption="Caps are enforced on every write; when one is exceeded the oldest facts are evicted first."
            />
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="examples"
          eyebrow="Examples"
          title="Three exchanges"
          lead="Written to show the shape of each path — a grounded answer, and two refusals that hold."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {EXCHANGES.map((exchange, i) => (
              <Reveal key={exchange.id} delay={i * 90}>
                <div className="lp-card flex h-full flex-col p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant/70">
                      {exchange.kind === 'answer' ? 'Answered' : 'Declined'}
                    </span>
                    {exchange.badge && (
                      <code className="rounded-md bg-coral/10 px-2 py-0.5 text-[11px] font-semibold text-coral">
                        {exchange.badge}
                      </code>
                    )}
                  </div>

                  <p className="mt-4 rounded-2xl bg-primary/15 px-4 py-3 text-[13px] leading-relaxed text-on-surface">
                    {exchange.question}
                  </p>
                  <p
                    className={`mt-3 rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                      exchange.kind === 'refusal'
                        ? 'border border-coral/25 bg-coral/[0.07] text-on-surface-variant'
                        : 'bg-white/[0.04] text-on-surface-variant'
                    }`}
                  >
                    {exchange.answer}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <p className="mt-5 text-center text-[12px] text-on-surface-variant/70">
            Illustrative exchanges, written to show each path. The screenshots elsewhere on this
            site are real captures.{' '}
            <Link
              to="/features#coach"
              className="text-primary transition-colors hover:text-secondary"
            >
              See the coach in the feature reference
            </Link>
            .
          </p>
        </Section>

        {/* ---------------------------------------------------------- */}
        <PageCta
          title="Ask it something tonight"
          lead="Build a profile, log a day, and the coach has something real to work from. It costs one credit a message, and the first fifty each day are free."
          disclaimer={WELLNESS_DISCLAIMER}
        />
      </div>
    </MarketingPage>
  );
}
