/**
 * Replies for the bot commands Telegram expects on a paid Mini App.
 *
 * This process never calls setMyCommands or setWebhook. Both are operator
 * steps run once per bot, after deploy. TELEGRAM_BOT_COMMANDS is the payload
 * for that setMyCommands call, and the only commands this webhook answers.
 */
import type { OutboundButton } from './telegramBot';

export const TELEGRAM_BOT_COMMANDS = [
  { command: 'start', description: 'Open AquaZeroFit' },
  { command: 'paysupport', description: 'Payment help and refunds' },
  { command: 'stop', description: 'Cancel a subscription or delete data' },
  { command: 'terms', description: 'Terms, privacy and refunds' },
] as const;

export type BotCommandName = (typeof TELEGRAM_BOT_COMMANDS)[number]['command'];

const COMMAND_NAMES = new Set<string>(TELEGRAM_BOT_COMMANDS.map((c) => c.command));

export interface CommandReply {
  text: string;
  buttons?: OutboundButton[];
}

export interface CommandContext {
  miniAppUrl: string;
  supportEmail: string;
  termsUrl: string;
  privacyUrl: string;
  refundUrl: string;
  deletionUrl: string;
  /** Telegram chat type. web_app buttons only open inside a private chat. */
  chatType?: string;
}

/**
 * First token of a message, without a bot mention or deep-link argument.
 * `/start@AquaZeroBot payload` is `start`. Anything else is ignored: this bot
 * is not a conversational surface.
 */
export function commandName(text: string | undefined): BotCommandName | undefined {
  if (!text) return undefined;
  const token = text.trim().split(/\s+/, 1)[0] ?? '';
  if (!token.startsWith('/')) return undefined;
  const name = token.slice(1).split('@', 1)[0]?.toLowerCase() ?? '';
  return COMMAND_NAMES.has(name) ? (name as BotCommandName) : undefined;
}

function openButton(url: string, chatType: string | undefined): OutboundButton {
  const privateChat = chatType === undefined || chatType === 'private';
  if (privateChat && url.startsWith('https://')) {
    return { text: 'Open AquaZeroFit', webAppUrl: url };
  }
  return { text: 'Open AquaZeroFit', url };
}

export function replyForCommand(command: BotCommandName, ctx: CommandContext): CommandReply {
  switch (command) {
    case 'start':
      return {
        text: 'Welcome to AquaZeroFit. Log meals, train, and talk with your coach.',
        buttons: [openButton(ctx.miniAppUrl, ctx.chatType)],
      };
    case 'paysupport': {
      const contact = ctx.supportEmail
        ? `Email ${ctx.supportEmail}`
        : `Open ${ctx.refundUrl}`;
      return {
        text: [
          'Payment help and refunds.',
          `${contact} with the date of the charge and your Telegram username.`,
          'Coach purchases paid with Telegram Stars are one-time. If a refund is approved, the Stars are returned to your balance and the coach is removed from your account.',
          `Refunds: ${ctx.refundUrl}`,
        ].join('\n'),
      };
    }
    case 'stop':
      return {
        text: [
          'How to stop.',
          'Telegram Stars coach purchases do not renew. For a refund, send /paysupport.',
          'Premium from Google Play: cancel in the Play Store. You keep access until the period you already paid for ends.',
          'Premium paid by card: contact support. The same period rule applies.',
          `Delete your account and data: ${ctx.deletionUrl}`,
          'Deletion waits 30 days. Confirming a second time deletes it immediately. Billing and audit records are kept with your name removed.',
        ].join('\n'),
      };
    case 'terms':
      return {
        text: [`Terms: ${ctx.termsUrl}`, `Privacy: ${ctx.privacyUrl}`, `Refunds: ${ctx.refundUrl}`].join(
          '\n',
        ),
      };
  }
}
