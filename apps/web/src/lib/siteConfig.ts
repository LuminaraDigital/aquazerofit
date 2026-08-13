/**
 * Browser-side binding of the site config.
 *
 * Split from `site.ts` purely so that module can stay import-free and
 * env-free for the Node-side SEO plugin (see the header comment there). This
 * file is the browser's half: it reads `import.meta.env`, which Vite replaces
 * at build time, and hands it to the shared resolver.
 */
import { resolveSiteConfig } from './site';

export const SITE = resolveSiteConfig(import.meta.env as unknown as Record<string, string | undefined>);

export const { siteOrigin: SITE_ORIGIN, telegramBotUsername: TELEGRAM_BOT_USERNAME } = SITE;
