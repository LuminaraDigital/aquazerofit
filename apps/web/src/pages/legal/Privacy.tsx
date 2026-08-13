/**
 * /privacy — privacy notice.
 *
 * Everything describing the software's behaviour is taken from the code:
 * the photo lifecycle (vision router), memory retention (shared constants),
 * account deletion and the anonymised ledger/audit retention (me/service.ts),
 * and the Open Food Facts barcode fallback, whose disclosure here is a
 * REQUIRED pre-launch action recorded in docs/research/security-privacy-review.md.
 *
 * Operator-specific facts come from ./operator and are marked in the page
 * until supplied. See that file before publishing.
 */
import { Link } from 'react-router-dom';
import {
  GROWTH_EVENT_RETENTION_DAYS,
  MEAL_PHOTO_MAX_BYTES,
  MEMORY_REJECTED_RETENTION_DAYS,
  RANGES,
  SOURCE_CODE_URL,
} from '@aquazerofit/shared';
import { LegalPage, List, Notice, P, Section, Table, type Clause } from './LegalLayout';
import { Fact } from './operator';

const CLAUSES: Clause[] = [
  { id: 'summary', heading: 'The short version' },
  { id: 'who', heading: 'Who is responsible' },
  { id: 'what', heading: 'What we collect' },
  { id: 'why', heading: 'Why we use it' },
  { id: 'ai', heading: 'AI processing' },
  { id: 'photos', heading: 'Meal photographs' },
  { id: 'third-parties', heading: 'Who else sees it' },
  { id: 'retention', heading: 'How long it is kept' },
  { id: 'rights', heading: 'Your controls and rights' },
  { id: 'security', heading: 'Security' },
  { id: 'children', heading: 'Age' },
  { id: 'changes', heading: 'Changes and contact' },
];

export default function PrivacyPage() {
  const mib = Math.round(MEAL_PHOTO_MAX_BYTES / (1024 * 1024));

  return (
    <LegalPage
      path="/privacy"
      crumb="Privacy"
      title="Privacy notice"
      lead="What AquaZeroFit collects, why, who else can see it, and how to get rid of it. The service handles what you eat and what you weigh, so this is written to be read rather than to be survived."
      clauses={CLAUSES}
    >
      <Section id="summary" index={1} heading="The short version">
        <List
          items={[
            'We collect what you enter — your wellness profile, food and water logs, workouts, weights — plus the account details needed to sign you in.',
            'Meal photographs are stripped of their metadata on upload, never served publicly, and deleted within a day of the analysis finishing.',
            'AI features send the relevant slice of your data to a model provider. They are off until you consent, and the coach only remembers facts you have approved.',
            'You can delete your account from the app. Doing so erases your data and anonymises the records we must keep.',
            'We do not sell your data, and we do not use it for advertising.',
          ]}
        />
        <Notice icon="info">
          This notice describes the software. If you are reading it on a deployment run by someone
          other than the authors, the operator named below is the one answerable for it.
        </Notice>
      </Section>

      <Section id="who" index={2} heading="Who is responsible">
        <P>
          The service is operated by <Fact name="legalName" hint="operator legal name" />, at{' '}
          <Fact name="postalAddress" hint="postal address" />. Privacy questions and requests go to{' '}
          <Fact name="privacyEmail" hint="privacy contact" />.
        </P>
        <P>
          Data is stored and processed in <Fact name="hostingRegion" hint="hosting region" />.
        </P>
      </Section>

      <Section id="what" index={3} heading="What we collect">
        <Table
          caption="Categories of data collected"
          head={['Category', 'What it includes']}
          rows={[
            [
              'Account',
              'Email address and a password hash, or — if you arrive through Telegram — the account identifier Telegram supplies. A display name and timezone if you set them.',
            ],
            [
              'Wellness profile',
              'Age, sex, height, weight, activity level and goal. Equipment you own and foods you need to avoid.',
            ],
            [
              'Logs',
              'Meals and their nutrition values, water, workouts completed, and weights you record — each with the date you assigned it.',
            ],
            [
              'Generated content',
              'Meal plans, training plans, recipes and coach conversations produced for you, and any facts you have approved the coach to remember.',
            ],
            [
              'Usage',
              'Credit transactions for AI features, and security audit events such as sign-ins and refused requests.',
            ],
            [
              'Referral and sharing',
              'When you share a card or create, join or share a buddy huddle, we record that the action happened, which kind it was, and the huddle code. If you arrived from an invite or a campaign link, the referral and campaign values from that link are recorded with it. These are counts of actions, not a profile of your browsing, and they are never sold or used for advertising.',
            ],
            [
              'Technical',
              'IP address and request metadata, used for rate limiting and abuse investigation.',
            ],
          ]}
        />
        <P>
          Health-adjacent data — what you eat, what you weigh — is treated as sensitive throughout,
          which is why the AI features that use it are gated behind consent rather than on by
          default.
        </P>
        <Notice icon="info">
          We set no advertising or third-party cookies and run no third-party analytics. The
          referral values above are stored in your browser&apos;s local storage, under the key{' '}
          <code className="rounded bg-surface-variant/60 px-1 py-0.5 text-[0.9em]">azf_attr_v1</code>
          , so a huddle invite still works after you sign up. Clearing site data removes it. Whether
          this deployment needs to ask consent before storing it depends on the law of{' '}
          <Fact name="jurisdiction" hint="governing jurisdiction" /> and must be settled before this
          notice is relied upon.
        </Notice>
      </Section>

      <Section id="why" index={4} heading="Why we use it">
        <List
          items={[
            'To run the service you asked for: computing your targets, keeping your logs, generating the plans and answers you request.',
            'To keep the service working and safe: rate limiting, abuse investigation, and auditing whether the safety guardrails fired.',
            'To meet legal and accounting obligations, which is the only reason any record survives your account deletion.',
          ]}
        />
        <P>
          The lawful basis for each purpose under your local data protection law —{' '}
          <Fact name="jurisdiction" hint="governing jurisdiction" /> — must be stated here before
          this notice is relied upon.
        </P>
      </Section>

      <Section id="ai" index={5} heading="AI processing">
        <P>
          Some features send a slice of your data to a third-party model provider: analysing a meal
          photograph, generating a plan or recipe, and answering in the coach. The slice is the
          minimum the feature needs — for the coach, that is today&apos;s nutrition totals, the
          session on your plan, a progress summary, and recent conversation.
        </P>
        <List
          items={[
            'AI personalisation is off until you turn it on, and can be switched off again at any time.',
            'The coach may propose facts to remember about you. They stay proposals until you confirm them, and confirmed facts can be deleted individually or all at once.',
            'Facts you reject are kept briefly — so the same suggestion is not made again — and then erased.',
            <>
              The providers in use on this deployment are{' '}
              <Fact name="aiProviders" hint="configured AI providers" />. Their own terms govern
              what they do with data they receive, and that must be checked before this notice is
              relied upon. The operator last verified those terms on{' '}
              <Fact name="aiProvidersVerifiedOn" hint="date provider terms last verified" />;
              provider terms change, so this date is re-checked whenever a provider is added,
              removed or revises its terms.
            </>,
          ]}
        />
        <Notice icon="lock">
          The deterministic parts of the product — your targets, meal totals, hydration, charts, the
          exercise library — involve no model and no third party at all.
        </Notice>
      </Section>

      <Section id="photos" index={6} heading="Meal photographs">
        <P>
          A photograph of a meal is taken with a device that knows where you live, so the upload
          path is deliberately narrow.
        </P>
        <List
          items={[
            `Uploads are limited to ${mib} MB and must actually decode as an image — the type your device declares is not trusted.`,
            'EXIF, XMP, IPTC and ICC metadata are discarded by re-encoding the image before it is stored. GPS coordinates, capture time and camera serial do not survive.',
            'The file is stored under an unguessable name and is never exposed on a public path.',
            'It is sent to the vision provider for analysis, and the result is returned to you as a proposal. Nothing is written to your logs until you confirm it.',
            'The photograph and its job record are deleted within 24 hours of the analysis finishing. If the analysis fails, the photograph is deleted immediately.',
          ]}
        />
      </Section>

      <Section id="third-parties" index={7} heading="Who else sees it">
        <Table
          caption="Third parties"
          head={['Recipient', 'What reaches them']}
          rows={[
            [
              <Fact key="ai" name="aiProviders" hint="configured AI providers" />,
              'The feature-specific slice described above, when you use an AI feature.',
            ],
            [
              'Open Food Facts',
              'When you scan a barcode that is not in our local mirror, that barcode is sent to Open Food Facts to look up the product. No account identifier or token is sent — but the request reveals to them that someone at your IP address scanned that product.',
            ],
            [
              'Telegram',
              'If you use the Telegram Mini App, Telegram supplies signed launch data identifying your Telegram account, and their own privacy terms cover your use of Telegram itself.',
            ],
            [
              'Hosting provider',
              <>
                Infrastructure in <Fact key="host" name="hostingRegion" hint="hosting region" />{' '}
                that stores the data on our behalf.
              </>,
            ],
          ]}
        />
        <P>We do not sell personal data, and we do not share it with advertisers.</P>
      </Section>

      <Section id="retention" index={8} heading="How long it is kept">
        <Table
          caption="Retention periods"
          head={['Data', 'Kept for']}
          rows={[
            ['Your account, profile and logs', 'Until you delete your account.'],
            [
              'Meal photographs',
              'Up to 24 hours after the analysis finishes; immediately on failure.',
            ],
            [
              'Facts you rejected for the coach to remember',
              `${MEMORY_REJECTED_RETENTION_DAYS} days, then erased.`,
            ],
            [
              'Account after you request deletion',
              '30 days, then purged automatically. Requesting deletion a second time purges it at once.',
            ],
            [
              'Credit ledger and security audit records',
              'Retained after deletion for financial integrity and abuse investigation, with your identity removed: the user reference is replaced with “anonymised” and any identifiers left in the record are hashed.',
            ],
            [
              'Referral and sharing records',
              `${GROWTH_EVENT_RETENTION_DAYS} days, then deleted automatically. Deleting your account does not wait for that: it drops the referral and huddle code from any of your remaining records, so what is left counts an action without pointing back at you.`,
            ],
          ]}
        />
      </Section>

      <Section id="rights" index={9} heading="Your controls and rights">
        <P>Inside the app you can, at any time and without asking anyone:</P>
        <List
          items={[
            'Turn AI personalisation on or off.',
            'Review, confirm, reject or delete every fact the coach has remembered.',
            'Edit or delete individual logs.',
            'Delete your account, which erases your data as set out above.',
          ]}
        />
        <P>
          Depending on where you live you may also have rights to access a copy of your data, to
          correct it, to restrict or object to processing, to portability, and to complain to a
          supervisory authority. There is no automated export yet — a request to{' '}
          <Fact name="privacyEmail" hint="privacy contact" /> is the route, and the response time we
          commit to must be stated here before this notice is relied upon.
        </P>
        <Notice icon="delete" tone="coral">
          Deletion is real: your profile, logs, plans, conversations, remembered facts and any meal
          photographs still on disk are erased. Only the anonymised ledger and audit entries remain,
          and they no longer point at you.
        </Notice>
      </Section>

      <Section id="security" index={10} heading="Security">
        <P>
          Passwords are stored hashed with bcrypt. Sessions use short-lived access tokens with
          rotating refresh tokens. Requests are rate limited per account and per network, and
          sign-in failures are throttled. Uploads are validated by decoding rather than by trusting
          the declared type.
        </P>
        <P>
          The{' '}
          <Link to="/safety" className="text-primary hover:text-secondary">
            safety page
          </Link>{' '}
          sets out the specifics, and the source is public if you would rather read the code than
          our description of it.
        </P>
      </Section>

      <Section id="children" index={11} heading="Age">
        <P>
          The service is not designed for children. The wellness profile accepts ages from{' '}
          {RANGES.age.min} upward, and accounts should not be created for anyone younger. Some
          jurisdictions set a higher minimum age for consenting to this kind of processing; the
          applicable minimum for <Fact name="jurisdiction" hint="governing jurisdiction" /> must be
          confirmed here before this notice is relied upon.
        </P>
      </Section>

      <Section id="changes" index={12} heading="Changes and contact">
        <P>
          If this notice changes materially we will say so in the app before the change takes
          effect. The version in force is the one published here, effective{' '}
          <Fact name="effectiveDate" hint="effective date" />.
        </P>
        <P>
          Privacy requests: <Fact name="privacyEmail" hint="privacy contact" />. General help:{' '}
          <Link to="/support" className="text-primary hover:text-secondary">
            the support page
          </Link>
          . Security vulnerabilities should go through{' '}
          <a
            href={`${SOURCE_CODE_URL}/blob/main/SECURITY.md`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:text-secondary"
          >
            private vulnerability reporting
          </a>{' '}
          rather than email.
        </P>
      </Section>
    </LegalPage>
  );
}
