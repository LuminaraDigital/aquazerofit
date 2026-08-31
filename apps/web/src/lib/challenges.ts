/** Google Play listing for the native Android app. */
export const ANDROID_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=fit.aquazero.app';

/** App Link + web fallback for buddy huddle invites (matches Android DeepLinkStore). */
export function joinChallengeUrl(code: string): string {
  const normalised = code.trim().toUpperCase();
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://app.aquazero.fit';
  return `${origin}/challenges?code=${encodeURIComponent(normalised)}`;
}

/** True on mobile Android browsers (not the installed WebView/TWA). */
export function isAndroidMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Android/i.test(ua) && !/wv|Telegram/i.test(ua);
}
