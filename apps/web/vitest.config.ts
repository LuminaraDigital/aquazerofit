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
  test: {
    /**
     * A ratchet set just under the measured figure (statements 36.9%,
     * branches 75.1%, functions 41.4%), so coverage cannot silently fall.
     *
     * The statement number is genuinely low and the threshold is honest about
     * that rather than flattering: the web suite concentrates on logic that
     * can be wrong — the auth gate, routing, the token store, targets and
     * consistency maths, the Telegram theme bridge — while most of the
     * remaining lines are presentational JSX that a snapshot would "cover"
     * without asserting anything true. The branch figure is the one worth
     * reading, and it is the one closest to the API's.
     */
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', '**/*.d.ts', 'dist/**', 'vite-plugins/**'],
      thresholds: {
        statements: 34,
        branches: 72,
        functions: 38,
        lines: 34,
      },
    },
  },
});
