/**
 * /refund: how to ask for a refund.
 *
 * Every sentence here is something the payment code actually does. There is
 * no refund button and no automatic Stripe refund. A Stars refund is done by
 * support on request. A time limit, a promise to refund, or a promise to
 * refuse one would be a policy this repository does not contain, so none of
 * those appear.
 */
import { Link } from 'react-router-dom';
import { LegalPage, List, P, Section, type Clause } from './LegalLayout';
import { Fact } from './operator';

const CLAUSES: Clause[] = [
  { id: 'ask', heading: 'How to ask' },
  { id: 'stripe', heading: 'Web premium (Stripe)' },
  { id: 'stars', heading: 'Telegram Stars' },
  { id: 'play', heading: 'Google Play' },
];

export default function RefundPage() {
  return (
    <LegalPage
      path="/refund"
      crumb="Refunds"
      title="Refunds"
      lead="How to ask AquaZeroFit about a charge. This page tells you where to write. It does not submit a refund."
      clauses={CLAUSES}
    >
      <Section id="ask" index={1} heading="How to ask">
        <P>
          Email <Fact name="supportEmail" hint="support contact" />. In Telegram, send /paysupport
          to the bot. The bot replies with this same email and a link back to this page.
        </P>
        <P>Include:</P>
        <List
          items={[
            'The account that paid (the email on the AquaZeroFit account, or the Telegram account you paid from).',
            'What you bought: web premium, or a named coach.',
            'When you paid, if you know it.',
          ]}
        />
        <P>
          The operator is <Fact name="legalName" hint="operator legal name" />. Sending the email
          or the command asks a person to look at the charge. It does not reverse the charge by
          itself, and the app has no refund button.
        </P>
        <P>
          Telegram's own support cannot refund a purchase made in this bot. /paysupport, or the
          email above, is where that request goes.
        </P>
      </Section>

      <Section id="stripe" index={2} heading="Web premium (Stripe)">
        <P>
          On the web, premium is a subscription billed by Stripe. You pay on Stripe's checkout
          page. The price and the billing period are the ones Stripe holds for this service, and
          the plan page shows both before you pay. Stripe bills the subscription again at the end
          of each period. Each paid invoice extends premium through the end of the period on that
          invoice.
        </P>
        <P>
          The app has no button that cancels a Stripe subscription. Ask by the email or the
          /paysupport command above. Premium runs through the end of the period on the last paid
          invoice. It ends when Stripe reports that subscription deleted, if that subscription is
          still the one on the account. A deletion for a subscription a later purchase has replaced
          leaves the later period in place.
        </P>
        <P>
          The{' '}
          <Link to="/terms#credits" className="text-primary hover:text-secondary">
            terms of use
          </Link>{' '}
          state the same rules.
        </P>
      </Section>

      <Section id="stars" index={3} heading="Telegram Stars">
        <P>
          Inside the Telegram Mini App, digital goods are sold in Telegram Stars. The Mini App
          does not open Stripe checkout. A locked coach can be bought for the Stars price shown
          for that coach. The purchase unlocks that coach on your account. There is no renewal.
        </P>
        <P>
          The same coach also unlocks when you reach the level the roster requires, and the app
          refuses the purchase if you already have that coach.
        </P>
        <P>A Stars refund is done by support on request.</P>
      </Section>

      <Section id="play" index={4} heading="Google Play">
        <P>
          On Android, when Google Play billing is configured, premium is a Play subscription. The
          app opens Google Play's subscription settings, which is where that subscription is managed
          and cancelled. A Play subscription that Google reports as revoked or expired ends premium.
        </P>
      </Section>
    </LegalPage>
  );
}
