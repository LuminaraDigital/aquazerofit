/**
 * Writes /llms.txt into the build output, next to robots.txt and sitemap.xml.
 *
 * The Worker serves apps/web/dist with SPA not-found handling. A path is the
 * SPA shell only when no file matches. This file has to exist on disk before
 * that fallback, which is why it is written here rather than left to a route.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { LLMS_CONTENT_TYPE, renderLlmsTxt } from '../src/lib/llms';
import { resolveSiteConfig } from '../src/lib/site';

export function llmsPlugin(): Plugin {
  let cfg = resolveSiteConfig({});

  return {
    name: 'aquazerofit:llms',
    apply: 'build',

    configResolved(resolved) {
      // Same env bag as the SEO plugin: the sitemap origin and these links
      // have to name the same host.
      cfg = resolveSiteConfig({
        ...loadEnv(resolved.mode, resolved.root, 'VITE_'),
        ...process.env,
      });
    },

    async writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      await writeFile(path.join(outDir, 'llms.txt'), renderLlmsTxt(cfg), 'utf8');
    },
  };
}

/** Dev-server twin. The built file is what production serves. */
export function llmsDevPlugin(): Plugin {
  const cfg = resolveSiteConfig(process.env as Record<string, string | undefined>);
  return {
    name: 'aquazerofit:llms-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0];
        if (pathname !== '/llms.txt') {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', LLMS_CONTENT_TYPE);
        res.end(renderLlmsTxt(cfg));
      });
    },
  };
}
