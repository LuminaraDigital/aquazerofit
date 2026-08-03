/**
 * Transactional mail copy for the auth flows.
 *
 * Kept apart from service.ts so the wording can change without touching the
 * token lifecycle, and so the copy is testable on its own.
 */
import { config } from '../../platform/config';
import { sendMail } from '../../platform/mailer';

/** Mirrors RESET_TTL_MS in service.ts; stated in the mail so the user knows. */
const RESET_TTL_MINUTES = 30;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The web client takes the token in a form field, and also accepts it as
 * `?reset=` on /sign-in to prefill that field. The mail carries both: the link
 * for the common case, the bare token for clients that mangle links or for a
 * user reading on a different device from the one they are signed in on.
 */
export function passwordResetLink(token: string): string {
  return `${config.appPublicUrl}/sign-in?reset=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = passwordResetLink(token);

  const text = [
    'Someone asked to reset the password on your AquaZeroFit account.',
    '',
    `Open this link to choose a new password: ${link}`,
    '',
    `Or enter this code in the app: ${token}`,
    '',
    `The code expires in ${RESET_TTL_MINUTES} minutes and can be used once.`,
    'If this was not you, no action is needed — your password has not changed.',
  ].join('\n');

  const html = [
    '<p>Someone asked to reset the password on your AquaZeroFit account.</p>',
    `<p><a href="${escapeHtml(link)}">Choose a new password</a></p>`,
    `<p>Or enter this code in the app: <code>${escapeHtml(token)}</code></p>`,
    `<p>The code expires in ${RESET_TTL_MINUTES} minutes and can be used once.`,
    ' If this was not you, no action is needed — your password has not changed.</p>',
  ].join('');

  await sendMail({ to, subject: 'Reset your AquaZeroFit password', text, html });
}
