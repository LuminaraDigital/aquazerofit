/**
 * Runtime document metadata for the marketing routes.
 *
 * There are two halves to this app's search story and it is worth being clear
 * which one this file is.
 *
 *   BUILD TIME  `vite-plugins/seo.ts` writes a real HTML file per marketing
 *               route, each with its own title, description, canonical, OG tags
 *               and JSON-LD baked into the markup. That is what a crawler which
 *               does not execute JavaScript sees, and it is the half that
 *               actually matters for indexing.
 *
 *   RUNTIME     this file. Once the SPA takes over, client-side navigation
 *               changes the URL without reloading the document, so the tags
 *               from the shell now describe the wrong page — for link previews,
 *               for the browser tab, and for crawlers that do execute JS and
 *               read the post-render DOM. `useSeo` keeps them in step.
 *
 * Neither half is sufficient alone, which is why both exist.
 */
import { useEffect } from 'react';
import { canonicalUrl, marketingRoute, SOCIAL_IMAGE_PATH } from './site';
import { SITE } from './siteConfig';

interface SeoInput {
  /** Overrides the manifest entry for this path; rarely needed. */
  title?: string;
  description?: string;
}

/** Upsert a `<meta>` by name or property, creating it if the shell lacked one. */
function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Apply the metadata for a marketing route.
 *
 * Nothing is restored on unmount. That is deliberate: every navigation lands
 * on a route that sets its own metadata, and restoring the previous page's
 * title on the way out would make the tab flicker through a stale value.
 * Routes with no manifest entry (the signed-in app) simply never call this and
 * keep whatever the shell shipped — they are `noindex` anyway.
 */
export function useSeo(path: string, overrides: SeoInput = {}): void {
  const { title: titleOverride, description: descriptionOverride } = overrides;

  useEffect(() => {
    const entry = marketingRoute(path);
    const title = titleOverride ?? entry?.title;
    const description = descriptionOverride ?? entry?.description;
    const canonical = canonicalUrl(SITE.siteOrigin, entry?.path ?? path);
    const image = `${SITE.siteOrigin}${SOCIAL_IMAGE_PATH}`;

    if (title) {
      document.title = title;
      setMeta('property', 'og:title', title);
      setMeta('name', 'twitter:title', title);
    }
    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
      setMeta('name', 'twitter:description', description);
    }
    setCanonical(canonical);
    setMeta('property', 'og:url', canonical);
    setMeta('property', 'og:image', image);
    setMeta('name', 'twitter:image', image);
  }, [path, titleOverride, descriptionOverride]);
}
