/**
 * /paysupport: the payment-support command Telegram expects a bot that sells
 * digital goods to answer.
 *
 * The reply tells the person where to ask. Sending the command does not
 * refund a payment. A Stars refund is done by support on request.
 */
import { resolveSupportEmail } from '@aquazerofit/shared';
import { replyForCommand } from './commands';

/** Command name from a message, without a @bot suffix. Null when it is not a command. */
export function botCommand(text: string | undefined): string | null {
  if (!text) return null;
  const match = /^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s|$)/.exec(text.trim());
  return match ? match[1].toLowerCase() : null;
}

/** Mailbox the bot gives out. Same resolver the legal pages and config use. */
export function supportEmail(): string {
  return resolveSupportEmail(process.env.SUPPORT_EMAIL);
}

/**
 * Plain-text reply for /paysupport. The webhook sends this with parse mode
 * plain, so the mailbox is not HTML-escaped.
 */
export function paysupportMessage(email: string, publicUrl: string): string {
  const origin = publicUrl.replace(/\/+$/, '');
  return replyForCommand('paysupport', {
    miniAppUrl: origin,
    supportEmail: email,
    termsUrl: `${origin}/terms`,
    privacyUrl: `${origin}/privacy`,
    refundUrl: `${origin}/refund`,
    deletionUrl: `${origin}/account/deletion`,
  }).text;
}
