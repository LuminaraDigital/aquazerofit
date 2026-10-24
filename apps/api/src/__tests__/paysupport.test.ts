/**
 * /paysupport is a pointer, not a refund. The text has to name the mailbox
 * and the refund page, and it must not promise that the charge will be reversed.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SUPPORT_EMAIL } from '@aquazerofit/shared';
import { botCommand, paysupportMessage, supportEmail } from '../modules/payments/paysupport';

describe('paysupport', () => {
  it('reads the command with or without a bot suffix', () => {
    expect(botCommand('/paysupport')).toBe('paysupport');
    expect(botCommand('/paysupport@AquaZeroFitBot')).toBe('paysupport');
    expect(botCommand('/Paysupport extra')).toBe('paysupport');
    expect(botCommand('hello')).toBeNull();
    expect(botCommand('/start')).toBe('start');
  });

  it('points at the support email and the refund page, and does not promise a refund', () => {
    const text = paysupportMessage(DEFAULT_SUPPORT_EMAIL, 'https://aquazerofit.com/');
    expect(text).toContain(DEFAULT_SUPPORT_EMAIL);
    expect(text).toContain('https://aquazerofit.com/refund');
    expect(text).toContain('https://aquazerofit.com/terms');
    expect(text).toContain('does not refund a payment by itself');
    expect(text.toLowerCase()).not.toContain('full refund');
    expect(text).not.toContain('9.99');
  });

  it('includes the mailbox as plain text', () => {
    const text = paysupportMessage('a<b>@evil.test', 'https://aquazerofit.com');
    expect(text).toContain('a<b>@evil.test');
    expect(text).not.toContain('&lt;');
  });

  it('uses the published mailbox when SUPPORT_EMAIL is unset', () => {
    const previous = process.env.SUPPORT_EMAIL;
    delete process.env.SUPPORT_EMAIL;
    expect(supportEmail()).toBe(DEFAULT_SUPPORT_EMAIL);
    if (previous === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = previous;
  });

  it('trims a configured mailbox and ignores a blank one', () => {
    const previous = process.env.SUPPORT_EMAIL;
    process.env.SUPPORT_EMAIL = '  help@example.com  ';
    expect(supportEmail()).toBe('help@example.com');
    process.env.SUPPORT_EMAIL = '   ';
    expect(supportEmail()).toBe(DEFAULT_SUPPORT_EMAIL);
    if (previous === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = previous;
  });
});
