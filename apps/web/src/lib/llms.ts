/**
 * /llms.txt, the llmstxt.org index for the public marketing site.
 *
 * Generated from MARKETING_ROUTES so a page can appear here only when it is
 * already in the sitemap. Descriptions are the route meta descriptions.
 */
import { canonicalUrl, MARKETING_ROUTES, type MarketingRoute, type SiteConfig } from './site';

/** Google Play listing linked from the public site. */
export const PLAY_STORE_LISTING_URL =
  'https://play.google.com/store/apps/details?id=fit.aquazero.app';

/**
 * One blockquote line. Prices match the Premium catalog: A$9.99 a month
 * and A$79.99 a year. The Play URL is the listing the site already links.
 */
export const LLMS_SUMMARY =
  `AquaZeroFit is an AI fitness and nutrition coach app; the Android app is on Google Play at ${PLAY_STORE_LISTING_URL}, available in Australia; Premium is A$9.99/month or A$79.99/year.`;

export const LLMS_CONTENT_TYPE = 'text/plain; charset=utf-8';

interface LlmsSection {
  heading: string;
  paths: readonly string[];
}

/** Every marketing route sits in exactly one section. */
export const LLMS_SECTIONS: readonly LlmsSection[] = [
  {
    heading: 'Product',
    paths: ['/', '/features', '/how-it-works', '/aqua-coach', '/safety', '/google-play'],
  },
  {
    heading: 'Policies and support',
    paths: [
      '/privacy',
      '/google-play/privacy-policy',
      '/terms',
      '/refund',
      '/account/deletion',
      '/support',
    ],
  },
];

export function llmsLinkLabel(route: MarketingRoute): string {
  if (route.path === '/') return 'Home';
  const [beforePipe] = route.title.split(' | ');
  const [beforeColon] = beforePipe.split(':');
  return beforeColon.trim();
}

export function llmsSectionPaths(): string[] {
  return LLMS_SECTIONS.flatMap((section) => [...section.paths]);
}

function routeFor(path: string): MarketingRoute {
  const route = MARKETING_ROUTES.find((item) => item.path === path);
  if (!route) {
    throw new Error(`llms.txt lists ${path}, which is not a marketing route`);
  }
  return route;
}

function linkLine(path: string, cfg: SiteConfig): string {
  const route = routeFor(path);
  const url = canonicalUrl(cfg.siteOrigin, route.path);
  return `- [${llmsLinkLabel(route)}](${url}): ${route.description}`;
}

/** llmstxt.org document: H1, one blockquote, then H2 link lists. */
export function renderLlmsTxt(cfg: SiteConfig): string {
  const sections = LLMS_SECTIONS.map((section) =>
    [`## ${section.heading}`, '', ...section.paths.map((path) => linkLine(path, cfg))].join('\n'),
  );
  return [`# AquaZeroFit`, '', `> ${LLMS_SUMMARY}`, '', sections.join('\n\n'), ''].join('\n');
}
