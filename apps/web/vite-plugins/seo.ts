/**
 * Build-time SEO: robots.txt, sitemap.xml, and one real HTML file per
 * marketing route.
 *
 * The problem this solves. AquaZeroFit ships as a single client-rendered SPA
 * behind one `index.html`. Every marketing URL therefore served byte-identical
 * markup: the same generic title, the same generic description, no canonical,
 * and an empty `<div id="root">`. Per-route titles were set at runtime in a
 * `useEffect`, which a crawler only sees if it executes JavaScript and waits
 * for React. The result is a site that is technically online and practically
 * unrankable — and if App Store organic traffic goes away, unrankable is the
 * whole problem.
 *
 * What this does about it. After the bundle is generated, the finished
 * `index.html` is cloned once per route in MARKETING_ROUTES, with that route's
 * title, description, canonical, Open Graph tags, JSON-LD and a `<noscript>`
 * summary substituted into the markup. `/features` is then a real file at
 * `features/index.html`, which every static host serves for `/features`, and
 * which is complete and correct with JavaScript disabled entirely.
 *
 * Deployment note: this relies on the host resolving `/features` to
 * `features/index.html` *before* falling back to the SPA rewrite. Netlify,
 * Vercel, Cloudflare Pages, S3+CloudFront and `nginx try_files` all do this by
 * default. A host configured to rewrite *everything* to `/index.html`
 * unconditionally will serve the generic shell again and silently undo this —
 * the SPA still works, the SEO does not.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import {
  canonicalUrl,
  MARKETING_ROUTES,
  NON_INDEXABLE_PREFIXES,
  resolveSiteConfig,
  SOCIAL_IMAGE_PATH,
  type MarketingRoute,
  type SiteConfig,
} from '../src/lib/site';

/** Tags this plugin owns. Stripped from the shell before its own are injected,
 *  so `index.html` can keep readable defaults for local development without
 *  those defaults surviving into every built page as duplicates. */
const OWNED_TAGS = [
  /<title>[\s\S]*?<\/title>\s*/i,
  /<meta\s+name=["']description["'][^>]*>\s*/gi,
  /<meta\s+property=["']og:(?:title|description|url|image|type|site_name)["'][^>]*>\s*/gi,
  /<meta\s+name=["']twitter:(?:card|title|description|image)["'][^>]*>\s*/gi,
  /<link\s+rel=["']canonical["'][^>]*>\s*/gi,
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * JSON-LD for a route.
 *
 * Everything asserted here is something the product actually is. There is
 * deliberately no `aggregateRating` and no `review`: the app has no ratings,
 * and structured data describing ratings that do not exist is fabricated
 * review content — a manual-action risk, quite apart from being untrue.
 */
function structuredData(route: MarketingRoute, cfg: SiteConfig): string {
  const org = {
    '@type': 'Organization',
    '@id': `${cfg.siteOrigin}/#organization`,
    name: 'AquaZero',
    url: `${cfg.siteOrigin}/`,
    logo: `${cfg.siteOrigin}/logo.png`,
  };

  const graph: Record<string, unknown>[] = [
    org,
    {
      '@type': 'WebSite',
      '@id': `${cfg.siteOrigin}/#website`,
      url: `${cfg.siteOrigin}/`,
      name: 'AquaZeroFit',
      publisher: { '@id': `${cfg.siteOrigin}/#organization` },
    },
    {
      '@type': 'WebPage',
      '@id': `${canonicalUrl(cfg.siteOrigin, route.path)}#webpage`,
      url: canonicalUrl(cfg.siteOrigin, route.path),
      name: route.title,
      description: route.description,
      isPartOf: { '@id': `${cfg.siteOrigin}/#website` },
    },
  ];

  if (route.path === '/') {
    graph.push({
      '@type': 'SoftwareApplication',
      '@id': `${cfg.siteOrigin}/#app`,
      name: 'AquaZeroFit',
      applicationCategory: 'HealthApplication',
      description: route.description,
      /* The Mini App is the product surface, so the install target is the
         Telegram deep link rather than a store listing. */
      installUrl: `https://t.me/${cfg.telegramBotUsername}${
        cfg.telegramMiniAppShortName ? `/${cfg.telegramMiniAppShortName}` : ''
      }`,
      operatingSystem: 'Telegram, Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${cfg.siteOrigin}/#organization` },
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

function headBlock(route: MarketingRoute, cfg: SiteConfig): string {
  const canonical = canonicalUrl(cfg.siteOrigin, route.path);
  const image = `${cfg.siteOrigin}${SOCIAL_IMAGE_PATH}`;
  return [
    `<title>${escapeHtml(route.title)}</title>`,
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="AquaZeroFit" />`,
    `<meta property="og:title" content="${escapeHtml(route.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<script type="application/ld+json">${structuredData(route, cfg)}</script>`,
  ]
    .map((line) => `    ${line}`)
    .join('\n');
}

/**
 * Crawlable content for a JavaScript-free fetch, plus the links that let a
 * crawler walk the marketing site without executing the router. Without these
 * links the sitemap is the only route to any page but the home page.
 */
function noscriptBlock(route: MarketingRoute, cfg: SiteConfig): string {
  const links = MARKETING_ROUTES.filter((r) => r.path !== route.path)
    .map((r) => `<li><a href="${r.path}">${escapeHtml(r.title.split(' | ')[0].split(' — ')[0])}</a></li>`)
    .join('');
  const telegram = `https://t.me/${cfg.telegramBotUsername}${
    cfg.telegramMiniAppShortName ? `/${cfg.telegramMiniAppShortName}` : ''
  }`;
  return [
    '    <noscript>',
    `      <h1>${escapeHtml(route.title.split(' | ')[0])}</h1>`,
    `      <p>${escapeHtml(route.summary)}</p>`,
    `      <p><a href="${telegram}">Open AquaZeroFit in Telegram</a> or <a href="/sign-in">use it in your browser</a>.</p>`,
    `      <nav><ul>${links}</ul></nav>`,
    '    </noscript>',
  ].join('\n');
}

function renderShell(shell: string, route: MarketingRoute, cfg: SiteConfig): string {
  let html = shell;
  for (const pattern of OWNED_TAGS) html = html.replace(pattern, '');
  html = html.replace(/(\s*)<\/head>/i, `\n${headBlock(route, cfg)}\n  </head>`);
  html = html.replace(
    /<div id="root"><\/div>/,
    `<div id="root"></div>\n${noscriptBlock(route, cfg)}`,
  );
  return html;
}

function renderRobots(cfg: SiteConfig): string {
  const disallow = NON_INDEXABLE_PREFIXES.map((p) => `Disallow: ${p}`).join('\n');
  return [
    '# AquaZeroFit — the marketing pages are the crawlable surface.',
    '# The signed-in application below is not useful in search results and',
    '# competes with the marketing pages for the same queries.',
    'User-agent: *',
    'Allow: /$',
    disallow,
    '',
    `Sitemap: ${cfg.siteOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

function renderSitemap(cfg: SiteConfig, lastmod: string): string {
  const urls = MARKETING_ROUTES.map((route) =>
    [
      '  <url>',
      `    <loc>${canonicalUrl(cfg.siteOrigin, route.path)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <priority>${route.priority.toFixed(1)}</priority>`,
      '  </url>',
    ].join('\n'),
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function seoPlugin(): Plugin {
  let cfg: SiteConfig = resolveSiteConfig({});

  return {
    name: 'aquazerofit:seo',
    apply: 'build',

    configResolved(resolved) {
      /* Vite has already loaded .env files for the app, but plugins get the
         raw process env, so load the VITE_ bag the same way the client does.
         Without this a deployment's VITE_SITE_ORIGIN would reach the bundle
         and not the sitemap, and the two would disagree about the canonical
         origin — the one failure mode that is worse than having neither. */
      cfg = resolveSiteConfig({
        ...loadEnv(resolved.mode, resolved.root, 'VITE_'),
        ...process.env,
      });
    },

    /**
     * `writeBundle`, not `generateBundle`.
     *
     * Vite's own `vite:build-html` plugin emits index.html from its
     * `generateBundle` hook, and it runs after user plugins — so at
     * generateBundle time the bundle has no index.html to clone and this
     * plugin silently wrote nothing at all. Waiting until everything is on
     * disk removes the ordering question rather than betting on it.
     */
    async writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      const indexPath = path.join(outDir, 'index.html');

      let shell: string;
      try {
        shell = await readFile(indexPath, 'utf8');
      } catch {
        this.error(`SEO shells: ${indexPath} was not written, so nothing could be derived from it.`);
        return;
      }

      const lastmod = new Date().toISOString().slice(0, 10);

      for (const route of MARKETING_ROUTES) {
        const html = renderShell(shell, route, cfg);
        if (route.path === '/') {
          /* The root shell is also the SPA fallback every unknown URL lands
             on, so it is rewritten in place rather than written twice. */
          await writeFile(indexPath, html, 'utf8');
          continue;
        }
        const dir = path.join(outDir, route.path.replace(/^\//, ''));
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, 'index.html'), html, 'utf8');
      }

      await writeFile(path.join(outDir, 'robots.txt'), renderRobots(cfg), 'utf8');
      await writeFile(path.join(outDir, 'sitemap.xml'), renderSitemap(cfg, lastmod), 'utf8');
    },
  };
}

/**
 * Dev-server twin for robots.txt and sitemap.xml only.
 *
 * The prerendered shells are deliberately not reproduced in dev: they exist to
 * be verified against the real build, and a dev-only imitation of them is a
 * thing that can drift from what actually ships.
 */
export function seoDevPlugin(): Plugin {
  const cfg = resolveSiteConfig(process.env as Record<string, string | undefined>);
  return {
    name: 'aquazerofit:seo-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const lastmod = new Date().toISOString().slice(0, 10);
        if (req.url === '/robots.txt') {
          res.setHeader('Content-Type', 'text/plain');
          res.end(renderRobots(cfg));
          return;
        }
        if (req.url === '/sitemap.xml') {
          res.setHeader('Content-Type', 'application/xml');
          res.end(renderSitemap(cfg, lastmod));
          return;
        }
        next();
      });
    },
  };
}
