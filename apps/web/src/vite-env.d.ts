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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
