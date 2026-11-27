/**
 * Addresses the web app actually renders.
 *
 * Marketing paths are prerendered HTML and are the sitemap. The rest are
 * client routes with no file of their own. Anything else is a 404: the asset
 * host must not answer it with the home page.
 *
 * Keep this list aligned with MARKETING_ROUTES and the router in apps/web.
 */

const EXACT_ROUTES = [
  '/',
  '/features',
  '/how-it-works',
  '/aqua-coach',
  '/safety',
  '/google-play',
  '/privacy',
  '/google-play/privacy-policy',
  '/terms',
  '/refund',
  '/support',
  '/account/deletion',
  '/landing',
  '/welcome',
  '/sign-in',
  '/mobile/captcha',
  '/setup',
  '/onboarding',
  '/nutrition',
  '/nutrition/capture',
  '/nutrition/meal-plan',
  '/workouts',
  '/progress',
  '/progress/log-weight',
  '/coach',
  '/coach/select',
  '/challenges',
  '/fight-record',
  '/plan',
  '/settings',
  '/settings/notifications',
  '/settings/memory',
] as const;

const EXACT = new Set<string>(EXACT_ROUTES);

/** One extra segment: /recipes/:id, /workouts/:id, /nutrition/analysis/:jobId. */
const ONE_SEGMENT_PREFIXES = ['/nutrition/analysis/', '/recipes/', '/workouts/'] as const;

export function barePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '');
  return pathname;
}

export function hasFileExtension(pathname: string): boolean {
  const last = pathname.split('/').pop() ?? '';
  return last.includes('.');
}

export function isAppRoute(pathname: string): boolean {
  const bare = barePath(pathname);
  if (EXACT.has(bare)) return true;
  return ONE_SEGMENT_PREFIXES.some((prefix) => {
    if (!bare.startsWith(prefix)) return false;
    const rest = bare.slice(prefix.length);
    return rest.length > 0 && !rest.includes('/');
  });
}
