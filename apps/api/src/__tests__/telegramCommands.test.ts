/**
 * Copy for the four bot commands. Pure: no webhook, no Telegram, no secrets.
 * The strings are what a person reads in the chat, so they stay short and
 * they must not contain an em dash.
 */
import { describe, expect, it } from 'vitest';
import {
  TELEGRAM_BOT_COMMANDS,
  commandName,
  replyForCommand,
  type CommandContext,
} from '../modules/payments/commands';

const ctx: CommandContext = {
  miniAppUrl: 'https://aquazerofit.com/',
  supportEmail: 'pay-help@example.com',
  termsUrl: 'https://aquazerofit.com/terms',
  privacyUrl: 'https://aquazerofit.com/privacy',
  refundUrl: 'https://aquazerofit.com/support#refunds',
  deletionUrl: 'https://aquazerofit.com/account/deletion',
  chatType: 'private',
};

describe('bot commands', () => {
  it('registers /terms alongside the commands Telegram already has', () => {
    expect(TELEGRAM_BOT_COMMANDS.map((c) => c.command)).toEqual([
      'start',
      'paysupport',
      'stop',
      'terms',
    ]);
    for (const command of TELEGRAM_BOT_COMMANDS) {
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.description.length).toBeLessThanOrEqual(256);
    }
  });

  it('parses a mention and a deep-link argument, and ignores chat', () => {
    expect(commandName('/start')).toBe('start');
    expect(commandName('/start@AquaZeroBot')).toBe('start');
    expect(commandName('/paysupport now please')).toBe('paysupport');
    expect(commandName('/terms')).toBe('terms');
    expect(commandName('/STOP')).toBe('stop');
    expect(commandName('hello')).toBeUndefined();
    expect(commandName('/help')).toBeUndefined();
  });

  it('opens the Mini App from /start and names the configured mailbox', () => {
    const start = replyForCommand('start', ctx);
    expect(start.text).toMatch(/Welcome to AquaZeroFit/);
    expect(start.buttons?.[0]).toEqual({
      text: 'Open AquaZeroFit',
      webAppUrl: 'https://aquazerofit.com/',
    });

    const pay = replyForCommand('paysupport', ctx);
    expect(pay.text).toContain('pay-help@example.com');
    expect(pay.text).toContain('https://aquazerofit.com/support#refunds');
    expect(pay.text).not.toContain('info@luminara.digital');

    const stop = replyForCommand('stop', ctx);
    expect(stop.text).toContain('https://aquazerofit.com/account/deletion');
    expect(stop.text).toContain('/paysupport');
    expect(stop.text).toMatch(/do not renew/);

    const terms = replyForCommand('terms', ctx);
    expect(terms.text).toContain('https://aquazerofit.com/terms');
    expect(terms.text).toContain('https://aquazerofit.com/privacy');
    expect(terms.text).toContain('https://aquazerofit.com/support#refunds');

    const withoutEmail = replyForCommand('paysupport', { ...ctx, supportEmail: '' });
    expect(withoutEmail.text).not.toMatch(/@/);
    expect(withoutEmail.text).toContain(ctx.refundUrl);
  });

  it('uses a link button outside a private chat, where web_app buttons do not open', () => {
    const start = replyForCommand('start', { ...ctx, chatType: 'group' });
    expect(start.buttons?.[0]).toEqual({
      text: 'Open AquaZeroFit',
      url: 'https://aquazerofit.com/',
    });
  });

  it('keeps the copy free of em dashes', () => {
    for (const command of TELEGRAM_BOT_COMMANDS) {
      const reply = replyForCommand(command.command, ctx);
      expect(reply.text).not.toMatch(/\u2014/);
      expect(command.description).not.toMatch(/\u2014/);
    }
  });
});
