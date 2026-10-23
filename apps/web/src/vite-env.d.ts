/// <reference types="vite/client" />

/**
 * Build-time configuration. Both are optional: unset means "same origin",
 * which is what the dev proxy and single-origin deployments want. Split-origin
 * hosting (static site on a CDN, API on its own hostname) sets them at build
 * time — Vite inlines the values, so they are public, never secrets.
 */
interface ImportMetaEnv {
  /** Origin of the API, e.g. https://api.aquazero.fit — no trailing slash, no /api/v1. */
  readonly VITE_API_BASE_URL?: string;
  /** Origin serving committed exercise media under /uploads. Defaults to same origin. */
  readonly VITE_MEDIA_BASE_URL?: string;
  /**
   * Public origin of the marketing site, e.g. https://aquazero.fit — no
   * trailing slash. Canonical tags, the sitemap and absolute OG image URLs are
   * built from it, so a stale value points every canonical at another domain.
   */
  readonly VITE_SITE_ORIGIN?: string;
  /** Telegram bot hosting the Mini App, with or without the leading @. */
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  /**
   * Mini App short name from BotFather's /newapp. Explicitly empty for a
   * deployment with a bot but no registered Mini App.
   */
  readonly VITE_TELEGRAM_MINI_APP_SHORT_NAME?: string;
  /** Firebase Web client configuration */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
