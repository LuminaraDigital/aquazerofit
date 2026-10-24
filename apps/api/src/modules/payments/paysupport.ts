/**
 * /paysupport: the payment-support command Telegram expects a bot that sells
 * digital goods to answer.
 *
 * The reply tells the person where to ask. It does not refund anything, and it
 * does not promise that a refund will be granted. Those are decisions the
 * operator makes outside this process. Stars refunds are not issued here:
 * nothing in this module calls refundStarPayment.
 */
import { resolveSupportEmail } from '@aquazerofit/shared';

/** Command name from a message, without a @bot suffix. Null when it is not a command. */
export function botCommand(text: string | undefined): string | null {
  if (!text) return null;
  const match = /^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s|$)/.exec(text.trim());
  return match ? match[1].toLowerCase() : null;
}

function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Mailbox the bot gives out. Same resolver the legal pages use. */
export function supportEmail(): string {
  return resolveSupportEmail(process.env.SUPPORT_EMAIL);
}

/**
 * Plain reply for /paysupport. HTML-escaped because the bot sends with
 * parse_mode HTML. The public URL is the deployment's APP_PUBLIC_URL, so the
 * links match the host that is actually running.
 */
export function paysupportMessage(email: string, publicUrl: string): string {
  const origin = publicUrl.replace(/\/+$/, '');
  const safeEmail = escapeTelegramHtml(email);
  const refund = escapeTelegramHtml(`${origin}/refund`);
  const terms = escapeTelegramHtml(`${origin}/terms`);
  return [
    'Payment support for AquaZeroFit.',
    '',
    `Email ${safeEmail} and include the account that paid and what you bought: web premium through Stripe, or a coach bought with Telegram Stars.`,
    '',
    `Refund page: ${refund}`,
    `Terms: ${terms}`,
    '',
    'Sending /paysupport does not refund a payment by itself. Telegram support cannot refund a purchase made in this bot. Ask here, or by that email.',
  ].join('\n');
}
