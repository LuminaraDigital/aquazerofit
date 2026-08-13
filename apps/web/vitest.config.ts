import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * A test config that does not depend on the working directory.
 *
 * `vite.config.ts` carries the `@` and `@aquazerofit/shared` aliases, and
 * Vitest only picks it up when it resolves this package as the project root —
 * which happens when the suite is run from `apps/web`, and not when it is run
 * from the repository root as `vitest run apps/web`. In that second form four
 * files fail with `Failed to resolve import "@/components/ui/GlassCard"`,
 * which reads like a missing file rather than a missing alias and sends the
 * reader looking in the wrong place entirely.
 *
 * `npm run test` happens to use the working form (it runs per workspace), so
 * this is not currently breaking CI — it is a trap laid for whoever next wires
 * the web suite into a root-level command. Declaring the aliases here makes
 * both invocations work, so the trap cannot spring.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@aquazerofit/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
