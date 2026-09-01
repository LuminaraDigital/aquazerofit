/**
 * /account/deletion — how to delete an AquaZeroFit account, on the open web.
 *
 * WHY A PAGE AND NOT JUST THE SETTINGS SCREEN
 * -------------------------------------------
 * Deletion has worked in-app since launch (Settings → Delete account, which
 * calls DELETE /me). Google Play additionally requires a publicly reachable URL
 * where someone can find and start the same request WITHOUT reinstalling the
 * app, and requires that URL to state what is erased and what is kept. This
 * page is that URL, and it is declared in the Play Data safety form.
 *
 * Every statement about behaviour here is taken from the code that implements
 * it — apps/api/src/modules/me/service.ts (requestDeletion, purgeUser,
 * sweepExpiredDeletions) and config.deletionGraceDays — not from intent. If
 * that code changes, this page is wrong until it is changed too.
 *
 * No dark patterns: the page does not argue, does not bury the route, and does
 * not make export a precondition. It mentions export once because losing data
 * you wanted is the mistake this flow cannot undo.
 */
import { Link } from 'react-router-dom';
import { LegalPage, List, Notice, P, Section, Table, type Clause } from './LegalLayout';
import { Fact } from './operator';

const CLAUSES: Clause[] = [
  { id: 'summary', heading: 'The short version' },
  { id: 'in-app', heading: 'Deleting from the app' },
  { id: 'web', heading: 'Deleting from a browser' },
  { id: 'what-happens', heading: 'What happens, and when' },
  { id: 'erased', heading: 'What is erased' },
  { id: 'retained', heading: 'What is kept, and why' },
  { id: 'export', heading: 'Take a copy first' },
  { id: 'help', heading: 'If you cannot sign in' },
];

/** Mirrors config.deletionGraceDays in apps/api/src/platform/config.ts. */
const GRACE_DAYS = 30;

export default function AccountDeletionPage() {
  return (
    <LegalPage
      path="/account/deletion"
      crumb="Delete your account"
      title="Delete your account"
      lead="You can delete your AquaZeroFit account and its data yourself, from the app or from any browser. This page explains where the control is, what it removes, what survives it, and how long it takes."
      clauses={CLAUSES}
    >
      <Section id="summary" index={1} heading="The short version">
        <List
          items={[
            'Sign in, open Settings, choose “Delete account”, and confirm.',
            `Your account is flagged and erased automatically after ${GRACE_DAYS} days. Confirming a second time within that window erases it immediately.`,
            'Deletion removes your profile, logs, plans, coach conversations, remembered facts and any meal photographs still on disk.',
            'Credit and security-audit records survive, with your identity stripped out of them.',
            'You can download everything first. Deletion is not reversible once the data is gone.',
          ]}
        />
      </Section>

      <Section id="in-app" index={2} heading="Deleting from the app">
        <P>
          In the Android app and in the Telegram Mini App: <strong>Settings → Delete account</strong>
          . A confirmation dialog names what will be removed; the deletion begins when you accept
          it.
        </P>
        <P>
          You do not need to contact anyone, and there is no retention offer in the way. The control
          does what its label says.
        </P>
      </Section>

      <Section id="web" index={3} heading="Deleting from a browser">
        <P>
          You do not need the app installed. On any browser, sign in with the email address and
          password on the account, then open settings and choose the same control:
        </P>
        <List
          items={[
            <>
              <Link to="/sign-in" className="text-primary hover:text-secondary">
                Sign in
              </Link>{' '}
              with your email address and password.
            </>,
            <>
              Open{' '}
              <Link to="/settings" className="text-primary hover:text-secondary">
                Settings
              </Link>{' '}
              and scroll to the account section.
            </>,
            'Choose “Delete account” and confirm.',
          ]}
        />
        <P>
          If you signed up through Telegram and have never set a password, the Mini App is the route
          — or set an email address and password in Settings first, which gives the same account a
          second way in.
        </P>
      </Section>

      <Section id="what-happens" index={4} heading="What happens, and when">
        <P>
          Deletion is deliberately two steps, so that one mistaken tap cannot destroy months of
          logs:
        </P>
        <Table
          caption="Deletion timeline"
          head={['Step', 'What it does']}
          rows={[
            [
              'You confirm once',
              `The account is flagged for deletion and the ${GRACE_DAYS}-day grace period starts. Nothing is erased yet.`,
            ],
            [
              'You confirm again, any time in the window',
              'The account and its data are erased immediately, without waiting out the rest of the period.',
            ],
            [
              `${GRACE_DAYS} days pass`,
              'A sweep that runs at start-up and every six hours erases every account whose grace period has elapsed. No further action from you is needed.',
            ],
          ]}
        />
        <Notice icon="schedule">
          The grace period is the window in which you can change your mind — signing in again during
          it leaves the flag in place. If you are certain, confirming a second time is the way to
          finish immediately rather than waiting.
        </Notice>
      </Section>

      <Section id="erased" index={5} heading="What is erased">
        <List
          items={[
            'Your account record, sign-in credentials and any linked Telegram identity.',
            'Your wellness profile: height, weight, age, goal, activity level, equipment, allergies and dietary preferences.',
            'Every log you have kept — meals, water, workouts and weights.',
            'Meal plans, training plans and recipes generated for you.',
            'Coach conversations, and every fact the coach had remembered about you.',
            'Any meal photographs still on disk from an analysis in flight.',
            'Your membership of any buddy huddles, unwound from the huddles themselves.',
          ]}
        />
        <P>
          Every session is revoked at the same time, so the account cannot be signed into again from
          a device that was still holding a token.
        </P>
      </Section>

      <Section id="retained" index={6} heading="What is kept, and why">
        <P>Two categories outlive the account, and neither of them still points at you:</P>
        <Table
          caption="Records retained after deletion"
          head={['Record', 'Why it survives, and in what state']}
          rows={[
            [
              'Credit ledger',
              'Kept for financial integrity — it is the record of what AI work was authorised. The user reference is replaced with “anonymised”.',
            ],
            [
              'Security audit events',
              'Kept for abuse investigation: sign-in failures and refused requests are how a platform notices an attack. The user reference is replaced with “anonymised”, and any identifier left inside an entry — email address, Telegram id, display name — is replaced with a truncated hash.',
            ],
            [
              'Referral and sharing counts',
              'The event that something was shared or a huddle was joined remains as an aggregate, but the referral value and huddle code are dropped from it, so it counts an action without leading back to you.',
            ],
          ]}
        />
        <P>
          The full retention table, including the periods that apply while your account is still
          open, is in the{' '}
          <Link to="/privacy#retention" className="text-primary hover:text-secondary">
            privacy notice
          </Link>
          .
        </P>
      </Section>

      <Section id="export" index={7} heading="Take a copy first">
        <P>
          <strong>Settings → Export my data</strong> downloads everything on your account as a
          single JSON file: profile, logs, plans, conversations, consents and remembered facts. It
          takes a moment and needs nothing from us.
        </P>
        <P>
          Exporting is optional and deletion does not wait for it. It is mentioned here only because
          it is the one part of this that cannot be undone afterwards.
        </P>
      </Section>

      <Section id="help" index={8} heading="If you cannot sign in">
        <P>
          Deletion requires proof that the account is yours, which is what signing in is. If you
          have forgotten your password, use the reset link on the{' '}
          <Link to="/sign-in" className="text-primary hover:text-secondary">
            sign-in page
          </Link>{' '}
          — a reset restores access, and the deletion control is then where this page says it is.
        </P>
        <P>
          If you cannot get back in at all, write to{' '}
          <Fact name="privacyEmail" hint="privacy contact" /> from the address on the account. The{' '}
          <Link to="/support" className="text-primary hover:text-secondary">
            support page
          </Link>{' '}
          covers everything else.
        </P>
      </Section>
    </LegalPage>
  );
}
