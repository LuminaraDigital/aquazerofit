/**
 * /terms — terms of use for the hosted service.
 *
 * Note the distinction this page has to hold: the AGPL v3 governs the software
 * and the rights it gives you over the code. These terms govern use of the
 * hosted service. They are separate instruments and neither replaces the other.
 *
 * Liability, warranty and governing-law clauses are the parts a lawyer must
 * write for the operator's jurisdiction; they are marked rather than guessed.
 */
import { Link } from 'react-router-dom';
import { FREE_TIER_DAILY_CREDITS, RANGES, SOURCE_CODE_URL } from '@aquazerofit/shared';
import { LegalPage, List, Notice, P, Section, type Clause } from './LegalLayout';
import { Fact } from './operator';

const CLAUSES: Clause[] = [
  { id: 'agreement', heading: 'This agreement' },
  { id: 'service', heading: 'What the service is' },
  { id: 'not-medical', heading: 'Not medical advice' },
  { id: 'eligibility', heading: 'Who may use it' },
  { id: 'account', heading: 'Your account' },
  { id: 'acceptable-use', heading: 'Acceptable use' },
  { id: 'ai-output', heading: 'AI output' },
  { id: 'credits', heading: 'Credits and availability' },
  { id: 'your-content', heading: 'Your content' },
  { id: 'software-licence', heading: 'The software licence' },
  { id: 'termination', heading: 'Ending the agreement' },
  { id: 'liability', heading: 'Warranties and liability' },
  { id: 'law', heading: 'Governing law and changes' },
];

export default function TermsPage() {
  return (
    <LegalPage
      documentTitle="Terms of use — AquaZeroFit"
      crumb="Terms"
      title="Terms of use"
      lead="The rules for using the hosted AquaZeroFit service. Short, and worth reading — particularly the parts about what the service is not."
      clauses={CLAUSES}
    >
      <Section id="agreement" index={1} heading="This agreement">
        <P>
          These terms are between you and <Fact name="legalName" hint="operator legal name" />, who
          operates the service. By creating an account or using the service you accept them. If you
          do not, do not use the service.
        </P>
      </Section>

      <Section id="service" index={2} heading="What the service is">
        <P>
          AquaZeroFit is a general wellness and fitness tool. It computes nutrition and hydration
          targets from figures you provide, records what you log, generates meal and training
          suggestions, and offers a conversational coach constrained to that subject matter.
        </P>
      </Section>

      <Section id="not-medical" index={3} heading="Not medical advice">
        <Notice icon="medical_information" tone="coral">
          AquaZeroFit provides general wellness and fitness support only. It does not provide
          medical diagnosis, treatment or professional healthcare advice, and nothing it produces is
          a substitute for a qualified clinician.
        </Notice>
        <P>
          Do not use the service to diagnose or treat a condition, and do not delay seeking
          professional care because of something it told you. If you are pregnant, managing a
          medical condition, recovering from injury, or have a history of disordered eating, speak
          to a healthcare professional before acting on anything here.
        </P>
        <P>
          If you are in crisis, the service will not attempt to help you and will point you to real
          support instead. Please use it.
        </P>
      </Section>

      <Section id="eligibility" index={4} heading="Who may use it">
        <P>
          You must be at least {RANGES.age.min} years old, and old enough under the law of{' '}
          <Fact name="jurisdiction" hint="governing jurisdiction" /> to agree to these terms. The
          service is not intended for children.
        </P>
      </Section>

      <Section id="account" index={5} heading="Your account">
        <List
          items={[
            'Give accurate details. The targets the service computes are only as sound as the figures you enter.',
            'Keep your credentials to yourself. You are responsible for activity under your account.',
            'One person per account. Do not share an account with someone whose body and goals are not yours — the maths will be wrong for both of you.',
            'Tell us promptly if you believe your account has been accessed by someone else.',
          ]}
        />
      </Section>

      <Section id="acceptable-use" index={6} heading="Acceptable use">
        <P>You agree not to:</P>
        <List
          items={[
            'Attempt to get the service to produce medical advice, or to circumvent its safety guardrails, including by role-play or hypothetical framing.',
            'Use it to pursue an unsafe calorie target, or to support disordered eating in yourself or anyone else.',
            'Scrape it, overload it, or work around rate limits.',
            'Attempt to access another user’s data, or probe the service for vulnerabilities outside the process in our security policy.',
            'Upload content you have no right to upload, or anything unlawful.',
          ]}
        />
        <P>
          Testing the safety guardrails in good faith and reporting what you find is welcome — that
          is what the{' '}
          <a
            href={`${SOURCE_CODE_URL}/blob/main/SECURITY.md`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:text-secondary"
          >
            security policy
          </a>{' '}
          is for.
        </P>
      </Section>

      <Section id="ai-output" index={7} heading="AI output">
        <P>
          Some features use language and vision models. Their output is generated, not verified: a
          portion estimated from a photograph can be wrong, and a suggestion is a suggestion. You
          decide what to log and what to eat.
        </P>
        <P>
          Numbers presented as fact — your targets, your logged totals, your trends — are computed
          deterministically rather than generated, and the{' '}
          <Link to="/safety" className="text-primary hover:text-secondary">
            safety page
          </Link>{' '}
          explains where that line sits.
        </P>
      </Section>

      <Section id="credits" index={8} heading="Credits and availability">
        <P>
          AI features consume credits, and the free allowance is {FREE_TIER_DAILY_CREDITS} credits
          each day. Deterministic features — targets, logging, hydration, the exercise library,
          charts — do not consume credits and keep working when the allowance is spent.
        </P>
        <P>
          Credits are not sold. The service integrates no payment provider, so there is nothing to
          buy and no subscription to cancel. If paid plans are ever introduced, their prices,
          renewal and refund terms must be set out in this clause before that happens.
        </P>
        <P>
          The service is provided as it is available. It may change, be interrupted for maintenance,
          or have features withdrawn. Third-party model providers can also fail, in which case AI
          features degrade while the deterministic ones continue.
        </P>
      </Section>

      <Section id="your-content" index={9} heading="Your content">
        <P>
          What you enter and upload remains yours. You grant us only the permission needed to run
          the service for you: to store it, process it, and pass the relevant slice to a model
          provider when you use a feature that requires one. We do not use your content to train
          models, and we do not sell it.
        </P>
        <P>
          The{' '}
          <Link to="/privacy" className="text-primary hover:text-secondary">
            privacy notice
          </Link>{' '}
          sets out what is collected and how long it is kept.
        </P>
      </Section>

      <Section id="software-licence" index={10} heading="The software licence">
        <P>
          AquaZeroFit is free software under the GNU Affero General Public Licence v3. That licence
          governs the <em>code</em>: your right to read it, modify it and run your own instance.
          These terms govern the <em>hosted service</em> we operate. They are separate, and nothing
          here restricts the rights the AGPL grants you over the software.
        </P>
        <P>
          Because the service is offered over a network, the corresponding source of the running
          version is available to you —{' '}
          <a
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:text-secondary"
          >
            here
          </a>
          . If you run a modified version for others, the AGPL requires you to offer them your
          modified source too.
        </P>
      </Section>

      <Section id="termination" index={11} heading="Ending the agreement">
        <P>
          You can stop at any time by deleting your account in the app. Deletion erases your data as
          described in the privacy notice, after a 30-day grace period — or immediately if you
          confirm the request a second time.
        </P>
        <P>
          We may suspend or close an account that breaches these terms, particularly the acceptable
          use clause. Where it is safe and lawful to do so, we will say why.
        </P>
      </Section>

      <Section id="liability" index={12} heading="Warranties and liability">
        <P>
          The service is provided without warranties beyond those that cannot lawfully be excluded.
          Nothing in these terms limits rights you have under consumer law that cannot be limited.
        </P>
        <P>
          The remaining limitations of liability — their scope and any cap — must be drafted for{' '}
          <Fact name="jurisdiction" hint="governing jurisdiction" /> by a lawyer before these terms
          are relied upon. Consumer protection law in many jurisdictions restricts what a service
          like this may exclude, and a boilerplate clause copied from elsewhere is as likely to be
          unenforceable as it is to be unfair.
        </P>
      </Section>

      <Section id="law" index={13} heading="Governing law and changes">
        <P>
          These terms are governed by the law of{' '}
          <Fact name="jurisdiction" hint="governing jurisdiction" />, and disputes go to its courts.
        </P>
        <P>
          If we change these terms materially we will say so in the app before the change takes
          effect. The version in force is the one published here, effective{' '}
          <Fact name="effectiveDate" hint="effective date" />. Questions go to{' '}
          <Fact name="supportEmail" hint="support contact" />.
        </P>
      </Section>
    </LegalPage>
  );
}
