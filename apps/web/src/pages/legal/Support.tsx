/**
 * /support — help, contact routes and reporting channels.
 *
 * The crisis signpost leads the page deliberately. On a product that handles
 * eating and body weight, the person who most needs the support page is not
 * always the one with a billing question, and making them scroll for it would
 * be a poor decision dressed up as information architecture.
 */
import { Link } from 'react-router-dom';
import { CRISIS_SIGNPOST, FREE_TIER_DAILY_CREDITS, SOURCE_CODE_URL } from '@aquazerofit/shared';
import { MarketingPage, PageHero } from '../landing/Page';
import { Reveal } from '../landing/motion';
import { DraftNotice, Fact } from './operator';

interface Answer {
  question: string;
  answer: React.ReactNode;
}

const ANSWERS: Answer[] = [
  {
    question: 'My calorie target looks wrong',
    answer: (
      <>
        Check the figures in your wellness profile first — height, weight, activity level and goal
        all move the number. If your target looks higher than you expected, it may have been clamped
        to the calorie floor, in which case the app shows an advisory beside it. The{' '}
        <Link to="/features#targets" className="text-primary hover:text-secondary">
          formulas and constants
        </Link>{' '}
        are published, so you can recompute it by hand and see where the difference is.
      </>
    ),
  },
  {
    question: 'The coach refused to answer me',
    answer: (
      <>
        It refuses anything clinical, anything below the safety floors, legal and financial
        questions, and crisis conversations. It is tuned to over-block rather than under-block, so
        it occasionally declines something harmless.{' '}
        <Link to="/aqua-coach#guardrails" className="text-primary hover:text-secondary">
          The published categories
        </Link>{' '}
        show exactly what falls where. Rephrasing a genuinely in-scope question usually works.
      </>
    ),
  },
  {
    question: 'A meal photo estimate was well off',
    answer: (
      <>
        Expected, and the reason the result arrives as an editable proposal rather than a logged
        entry — a photograph cannot weigh your dinner. Correct the portions before confirming. Good
        light and a top-down angle noticeably improve the estimate.
      </>
    ),
  },
  {
    question: 'AI features stopped working today',
    answer: (
      <>
        You have likely spent the day&apos;s free allowance of {FREE_TIER_DAILY_CREDITS} credits; it
        resets daily. Everything deterministic — targets, logging, hydration, the exercise library,
        charts — keeps working regardless, and a provider outage has the same effect on AI features
        while leaving the rest running.
      </>
    ),
  },
  {
    question: 'I want my data deleted',
    answer: (
      <>
        Settings → delete account. Your profile, logs, plans, conversations and remembered facts are
        erased after a 30-day grace period, or immediately if you confirm the request a second time.
        Ledger and audit records are kept anonymised.{' '}
        <Link to="/privacy#retention" className="text-primary hover:text-secondary">
          What is kept, and for how long
        </Link>
        .
      </>
    ),
  },
  {
    question: 'The coach remembered something I did not want it to',
    answer: (
      <>
        Settings → memory. Every fact is listed, and each can be deleted individually or all at
        once. You can also switch AI personalisation off entirely, which stops remembered facts
        being used at all without touching your logs.
      </>
    ),
  },
];

export default function SupportPage() {
  return (
    <MarketingPage documentTitle="Support — AquaZeroFit">
      <PageHero
        crumb="Support"
        title={
          <>
            Help, and how to <span className="lp-gradient-text">reach a person</span>
          </>
        }
        lead="Most questions about AquaZeroFit are answered by knowing how it decides things, so the common ones are below with links into the detail. If yours is not here, the contact routes are at the bottom."
        secondary={{ to: '/features', label: 'Browse the features' }}
      />

      <div className="mx-auto max-w-6xl space-y-20 px-5 pb-24 sm:pb-32">
        {/* Crisis first, deliberately. */}
        <Reveal>
          <section
            id="urgent"
            aria-labelledby="urgent-heading"
            className="lp-card scroll-mt-24 border-l-2 border-l-coral p-6 sm:p-8"
          >
            <h2
              id="urgent-heading"
              className="flex items-center gap-2 font-heading text-xl font-semibold text-on-surface"
            >
              <span className="material-symbols-outlined text-[20px] text-coral" aria-hidden="true">
                emergency_home
              </span>
              If you need help right now
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-on-surface">{CRISIS_SIGNPOST}</p>
            <p className="mt-4 text-[13px] leading-relaxed text-on-surface-variant/75">
              AquaZeroFit is a wellness tool, not a health service, and it will not attempt to
              handle a crisis. If you are outside Australia, your local emergency number or crisis
              line is the right call.
            </p>
          </section>
        </Reveal>

        {/* Common questions */}
        <section id="questions" className="scroll-mt-24">
          <Reveal>
            <h2 className="font-heading text-3xl font-semibold leading-[1.1] text-on-surface sm:text-[38px]">
              Common questions
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {ANSWERS.map((item, i) => (
              <Reveal key={item.question} delay={(i % 2) * 80}>
                <div className="lp-card h-full p-6">
                  <h3 className="font-heading text-lg font-semibold text-on-surface">
                    {item.question}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-on-surface-variant/80">
                    {item.answer}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Contact routes */}
        <section id="contact" className="scroll-mt-24">
          <Reveal>
            <h2 className="font-heading text-3xl font-semibold leading-[1.1] text-on-surface sm:text-[38px]">
              Getting in touch
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant/75">
              Different problems go to different places, mostly so that security reports never sit
              in a public queue.
            </p>
          </Reveal>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <Reveal>
              <div className="lp-card h-full p-6">
                <span
                  className="material-symbols-outlined text-[22px] text-primary"
                  aria-hidden="true"
                >
                  mail
                </span>
                <h3 className="mt-4 font-heading text-lg font-semibold text-on-surface">
                  General help
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                  Anything about your account, a number that looks wrong, or a feature behaving
                  oddly: <Fact name="supportEmail" hint="support contact" />.
                </p>
                <p className="mt-3 text-[12px] leading-relaxed text-on-surface-variant/70">
                  Typical response time: <Fact name="supportResponseTime" hint="response time" />
                </p>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <div className="lp-card h-full p-6">
                <span
                  className="material-symbols-outlined text-[22px] text-primary"
                  aria-hidden="true"
                >
                  shield_lock
                </span>
                <h3 className="mt-4 font-heading text-lg font-semibold text-on-surface">
                  Security issues
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                  Report vulnerabilities privately through GitHub, never as a public issue. The
                  policy sets out scope and what to expect.
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
            </Reveal>

            <Reveal delay={180}>
              <div className="lp-card h-full p-6">
                <span
                  className="material-symbols-outlined text-[22px] text-primary"
                  aria-hidden="true"
                >
                  bug_report
                </span>
                <h3 className="mt-4 font-heading text-lg font-semibold text-on-surface">
                  Bugs and requests
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/75">
                  AquaZeroFit is open source. Bugs, feature requests and questions about the code
                  belong in the issue tracker, where anyone can see the answer.
                </p>
                <a
                  href={`${SOURCE_CODE_URL}/issues`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                >
                  Issue tracker
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    arrow_outward
                  </span>
                </a>
              </div>
            </Reveal>
          </div>

          <Reveal delay={120}>
            <div className="mt-4 lp-card p-6">
              <h3 className="font-heading text-lg font-semibold text-on-surface">Accessibility</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-on-surface-variant/75">
                If something here is difficult to use with a screen reader, a keyboard, or at a
                larger text size, that is a bug and we want to hear about it. Send it to{' '}
                <Fact name="supportEmail" hint="support contact" /> and describe what you were
                trying to do — it will be treated as a defect, not a request.
              </p>
            </div>
          </Reveal>
        </section>

        {/* Draft notice sits last here: this page is useful even while the
            operator details are outstanding, unlike the legal documents. */}
        <Reveal>
          <div className="max-w-3xl">
            <DraftNotice />
          </div>
        </Reveal>
      </div>
    </MarketingPage>
  );
}
