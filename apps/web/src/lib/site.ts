/**
 * Delivery configuration for the two surfaces: web is marketing, Telegram is
 * the product.
 *
 * This module deliberately imports NOTHING and reads no environment. It is
 * consumed twice — once by the browser bundle and once by `vite-plugins/seo.ts`,
 * which runs in Node while Vite is still loading its config:
 *
 *   - No imports, because Vite bundles a config file's *relative* imports but
 *     externalises bare ones, and `@aquazerofit/shared` resolves to raw
 *     TypeScript that Node then cannot load. An import from the shared package
 *     here fails `vite build` with an error that points at this file rather
 *     than at the import that caused it.
 *
 *   - No environment, because the two callers read environment differently:
 *     the browser has `import.meta.env` (statically replaced at build time) and
 *     Node has `process.env` via Vite's `loadEnv`. Reading either one *inside*
 *     this module would work in one caller and silently return undefined in the
 *     other. Instead `resolveSiteConfig` takes the bag and both callers supply
 *     their own — see `siteConfig.ts` (browser) and the SEO plugin (Node).
 */

export interface SiteConfig {
  /** Public origin of the marketing site, no trailing slash. */
  siteOrigin: string;
  /** Bot hosting the Mini App, without the leading `@`. */
  telegramBotUsername: string;
  /** Mini App short name registered with BotFather, or '' if none. */
  telegramMiniAppShortName: string;
}

/**
 * The values below are the most deployment-specific thing in the repository.
 * A fork that leaves `telegramBotUsername` as-is sends its own visitors to
 * somebody else's bot, so every one of them is overridable at build time.
 */
export const SITE_DEFAULTS: SiteConfig = {
  siteOrigin: 'https://aquazero.fit',
  telegramBotUsername: 'AquaZeroFitBot',
  /**
   * The Mini App short name is what makes `t.me/<bot>/<app>` open the app
   * directly instead of opening a chat the visitor then has to press Start in
   * — one tap instead of three, on the only conversion step that matters. Set
   * it to '' for a deployment with a bot but no registered Mini App; the link
   * degrades to `t.me/<bot>?startapp=…`, which opens the bot's main Mini App.
   */
  telegramMiniAppShortName: 'app',
};

type EnvBag = Record<string, string | undefined>;

function read(env: EnvBag, key: string): string | undefined {
  const trimmed = env[key]?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveSiteConfig(env: EnvBag = {}): SiteConfig {
  return {
    siteOrigin: (read(env, 'VITE_SITE_ORIGIN') ?? SITE_DEFAULTS.siteOrigin).replace(/\/+$/, ''),
    telegramBotUsername: (
      read(env, 'VITE_TELEGRAM_BOT_USERNAME') ?? SITE_DEFAULTS.telegramBotUsername
    ).replace(/^@/, ''),
    /* '' is a meaningful value here (bot with no Mini App), so an explicitly
       empty override must survive rather than fall back to the default. */
    telegramMiniAppShortName:
      env.VITE_TELEGRAM_MINI_APP_SHORT_NAME?.trim() ?? SITE_DEFAULTS.telegramMiniAppShortName,
  };
}

/**
 * Telegram deep-link payload limit (`?start=` / `?startapp=`): 1–64 characters
 * drawn from `A–Z a–z 0–9 _ -`. Telegram silently refuses a link whose payload
 * breaks either rule, so attribution has to be *encoded* to fit rather than
 * assumed to fit.
 */
export const TELEGRAM_START_PARAM_MAX_CHARS = 64;

/**
 * Social preview image, resolved against the site origin for OG/Twitter.
 *
 * Must be 1200x630 — the ratio every major crawler crops to. The previous
 * value here was a 1280x900 screenshot, which is close enough to look fine
 * locally and wrong everywhere it actually matters: Twitter and Facebook trim
 * a 1.42:1 image to 1.91:1 by cutting the top and bottom off, which is exactly
 * where a screenshot keeps its heading. This file matches what production
 * serves.
 */
export const SOCIAL_IMAGE_PATH = '/og-image.jpg';

export interface MarketingRoute {
  /** Route path, always rooted, never with a trailing slash (except `/`). */
  path: string;
  /** `<title>`. Kept under ~60 chars so search results do not truncate it. */
  title: string;
  /** Meta description. ~150–160 chars is the usable budget. */
  description: string;
  /**
   * Crawlable copy rendered into the prerendered shell's `<noscript>`. The app
   * is a client-rendered SPA: without this a crawler that does not execute
   * JavaScript sees an empty `<div id="root">` and has nothing but the title to
   * rank on. It is a standalone summary, not a copy of the page.
   */
  summary: string;
  /** Relative weight in the sitemap. */
  priority: number;
}

/**
 * Every publicly crawlable route.
 *
 * Single source of the sitemap, the prerendered per-route HTML shells and the
 * runtime `useSeo` defaults. Adding a marketing page means adding it here — a
 * page missing from this list still renders perfectly, it is just invisible to
 * search, which is the kind of omission nobody notices for months.
 */
export const MARKETING_ROUTES: readonly MarketingRoute[] = [
  {
    path: '/',
    title: 'AquaZeroFit — AI wellness inside Telegram',
    description:
      'Photograph a meal and see it counted. Calorie, macro and hydration targets you could recompute by hand, adaptive home training and a coach grounded in your actual day — inside Telegram.',
    summary:
      'AquaZeroFit is an AI wellness coach that runs inside Telegram. Photograph a meal and it is logged and counted. Your calorie, macro and hydration targets are computed from your own figures using published formulas you could recompute by hand — no invented numbers. Home training adapts to the equipment you actually have, and Aqua Coach answers from your real logged day inside strict wellness boundaries. AquaZeroFit provides general wellness and fitness support only; it does not provide medical diagnosis, treatment or professional healthcare advice. It is free software under the GNU AGPL v3, and it runs in an ordinary web browser as well, for anyone whose network or workplace blocks Telegram.',
    priority: 1,
  },
  {
    path: '/features',
    title: 'Features — meal photos, targets, training | AquaZeroFit',
    description:
      'Meal logging by photograph, calorie and macro targets derived from published formulas, equipment-aware home training, and a coach that answers from your logged day.',
    summary:
      'AquaZeroFit features: log meals by photograph or by searching a food corpus; calorie, macro and hydration targets derived from published formulas rather than from a black box; home training matched to the equipment you actually own; progress tracking across weight and calorie trends; and Aqua Coach, a conversational assistant grounded in your own logged data.',
    priority: 0.8,
  },
  {
    path: '/how-it-works',
    title: 'How it works — from meal photo to target | AquaZeroFit',
    description:
      'Build a wellness profile, log your day, and see targets computed from your own figures. Every number is one you could recompute by hand.',
    summary:
      'How AquaZeroFit works: you supply a small set of wellness essentials, and the app derives your calorie, macro and hydration targets from them using published formulas. You log meals by photograph or by search, log your weight, and follow home training matched to your equipment. Targets adapt as measured progress arrives. Every derived number is reproducible by hand from your own inputs.',
    priority: 0.8,
  },
  {
    path: '/aqua-coach',
    title: 'Aqua Coach — a coach that knows its limits | AquaZeroFit',
    description:
      'A conversational wellness coach grounded in your actual logged day, answering inside boundaries it will not cross. General wellness support only, never medical advice.',
    summary:
      'Aqua Coach is a conversational wellness assistant grounded in your actual logged nutrition, training and progress data rather than in generic advice. It operates inside enforced safety boundaries: it provides general wellness and fitness support only, and it does not provide medical diagnosis, treatment or professional healthcare advice. When a conversation moves outside those limits it says so and signposts real support instead of improvising.',
    priority: 0.8,
  },
  {
    path: '/safety',
    title: 'Safety and boundaries | AquaZeroFit',
    description:
      'The wellness boundary is a product requirement, not a disclaimer: what AquaZeroFit will and will not answer, and how those limits are enforced in code.',
    summary:
      'AquaZeroFit treats its wellness boundary as a product requirement rather than as a disclaimer. It provides general wellness and fitness support only and does not provide medical diagnosis, treatment or professional healthcare advice. Calorie floors, crisis signposting and refusal behaviour are enforced in code and covered by an automated safety evaluation suite that gates every release.',
    priority: 0.6,
  },
  {
    path: '/privacy',
    title: 'Privacy notice | AquaZeroFit',
    description:
      'What AquaZeroFit stores, why it stores it, and which personalisation is opt-in. Your wellness data is yours.',
    summary:
      'The AquaZeroFit privacy notice: what data is stored, why it is stored, how long it is retained, and which personalisation features are opt-in rather than on by default.',
    priority: 0.4,
  },
  {
    path: '/terms',
    title: 'Terms of use | AquaZeroFit',
    description: 'The terms under which AquaZeroFit is offered, including its wellness boundary.',
    summary:
      'The terms of use for AquaZeroFit, including the general-wellness boundary, acceptable use, and the GNU AGPL v3 licence the software is offered under.',
    priority: 0.4,
  },
  {
    path: '/support',
    title: 'Support | AquaZeroFit',
    description: 'How to get help with AquaZeroFit, report a problem, or reach a real person.',
    summary:
      'How to get support for AquaZeroFit: common questions, how to report a problem or a security vulnerability, and how to reach a person.',
    priority: 0.4,
  },
];

/**
 * Route prefixes that must never be indexed: the signed-in application and the
 * auth screens. None of them are useful search results, and indexing them
 * competes with the marketing pages for the same queries.
 */
export const NON_INDEXABLE_PREFIXES: readonly string[] = [
  '/api/',
  '/uploads/',
  '/sign-in',
  '/welcome',
  /* Host surfaces for the native app (the WebView challenge page). They are
     not pages a human navigates to and they carry no content to rank. */
  '/mobile/',
  '/setup',
  '/onboarding',
  '/nutrition',
  '/workouts',
  '/recipes',
  '/progress',
  '/coach',
  '/challenges',
  '/settings',
  '/plan',
];

export function marketingRoute(path: string): MarketingRoute | undefined {
  const normalised = path !== '/' ? path.replace(/\/+$/, '') : path;
  return MARKETING_ROUTES.find((route) => route.path === normalised);
}

/** Absolute canonical URL for a route path. */
export function canonicalUrl(siteOrigin: string, path: string): string {
  return path === '/' ? `${siteOrigin}/` : `${siteOrigin}${path}`;
}
