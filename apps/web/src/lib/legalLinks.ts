/**
 * Public legal pages. Absolute URLs so Telegram.WebApp.openLink can open
 * them; a relative path is rejected by the client.
 */
export const LEGAL_LINKS = {
  privacy: 'https://aquazerofit.com/privacy',
  terms: 'https://aquazerofit.com/terms',
  accountDeletion: 'https://aquazerofit.com/account/deletion',
} as const;
