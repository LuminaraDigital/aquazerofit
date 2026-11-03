/**
 * The one public support mailbox.
 *
 * This is the address already published for the operator (Luminara Digital),
 * not a secret and not a second contact invented for billing. SUPPORT_EMAIL
 * overrides it for a deployment. Blank and whitespace fall through to the
 * default so a half-set variable cannot blank the legal pages.
 */
export const DEFAULT_SUPPORT_EMAIL = 'info@luminara.digital';

export function resolveSupportEmail(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : DEFAULT_SUPPORT_EMAIL;
}
