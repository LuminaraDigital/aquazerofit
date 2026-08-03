/**
 * Outbound mail (AQF-06: account recovery).
 *
 * WHY THIS EXISTS
 * ---------------
 * Password reset issued a token and then had nowhere to send it: the only
 * delivery path was a console line behind EXPOSE_DEV_TOKENS, which is hard
 * gated off in production. A user who forgot their password in production was
 * locked out permanently with no self-service route. Nothing failed loudly —
 * the endpoint returned its enumeration-safe 202 either way — so the gap was
 * invisible from the outside.
 *
 * TRANSPORTS
 * ----------
 *  - `resend`  HTTPS to the Resend API. Chosen because it needs no dependency:
 *              a single fetch against a documented JSON endpoint. Node 20+
 *              provides fetch globally.
 *  - `console` Development: the message is printed. NEVER valid in production —
 *              assertProductionSecrets refuses to boot on it, because a silently
 *              undeliverable reset is the exact failure this module exists to
 *              prevent.
 *  - `memory`  Test default: messages are captured for assertions.
 *
 * Selection is MAIL_PROVIDER, else memory under test, else resend when
 * RESEND_API_KEY is present, else console.
 */
import { config } from './config';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always sent: some clients never render the HTML part. */
  text: string;
  html?: string;
}

export type MailProvider = 'resend' | 'console' | 'memory';

/** Captured messages under the `memory` transport. Test-only. */
const outbox: MailMessage[] = [];

/** Read and clear the in-memory outbox (test helper). */
export function drainOutbox(): MailMessage[] {
  return outbox.splice(0, outbox.length);
}

export function resolveMailProvider(): MailProvider {
  const explicit = process.env.MAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === 'resend' || explicit === 'console' || explicit === 'memory') return explicit;
  if (config.isTest) return 'memory';
  return process.env.RESEND_API_KEY?.trim() ? 'resend' : 'console';
}

async function sendViaResend(msg: MailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.mailFrom,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // The body can echo the recipient; keep it out of the log sink.
    throw new Error(`Resend rejected the message with HTTP ${res.status}`);
  }
}

/**
 * Deliver a message. Throws on failure — callers decide whether that is fatal.
 * The password-reset caller deliberately swallows it, because surfacing a send
 * failure to the requester would leak whether the account exists.
 */
export async function sendMail(msg: MailMessage): Promise<void> {
  switch (resolveMailProvider()) {
    case 'memory':
      outbox.push(msg);
      return;
    case 'resend':
      await sendViaResend(msg);
      return;
    case 'console':
      // eslint-disable-next-line no-console
      console.log(`[mail:console] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
      return;
  }
}
