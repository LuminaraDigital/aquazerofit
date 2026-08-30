import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { seoDevPlugin, seoPlugin } from './vite-plugins/seo';

export default defineConfig({
  plugins: [react(), seoPlugin(), seoDevPlugin()],
  resolve: {
    alias: {
      '@aquazerofit/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    /**
     * Stated rather than inherited. Vite's default is already `false`, so this
     * changes nothing about the output — but "production source maps are not
     * published" is a security property of this deployment, and a property
     * that holds only because nobody has looked at it is one a future Vite
     * default or a copied config can quietly revoke. Maps would hand anyone
     * the unminified client, including comments and the shape of internal
     * modules, from a static host that serves whatever is in dist/.
     *
     * If maps are ever wanted for an error tracker, the answer is 'hidden':
     * it emits the files and omits the //# sourceMappingURL comment, so the
     * tracker can be fed them out of band without the browser fetching them.
     */
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4040', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4040', changeOrigin: true },
    },
  },
});
