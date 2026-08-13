/**
 * Vitest projects for the monorepo.
 *
 * Without this, a root-level `vitest run apps/web` treats the repository root
 * as the project root, so `apps/web/vite.config.ts` — which declares the `@`
 * and `@aquazerofit/shared` aliases — is never loaded. Four web files then fail
 * with `Failed to resolve import "@/components/ui/GlassCard"`, a message that
 * points at a missing file rather than a missing alias and sends the reader
 * looking in entirely the wrong place.
 *
 * `npm run test` runs each workspace in its own directory and so never hit
 * this. That is precisely what made it worth fixing: the bug was invisible from
 * the command CI runs and waiting for whoever first typed the obvious one.
 *
 * `packages/shared` is not listed because it has no test script and no test
 * files; it is covered through the suites that import it.
 */
export default ['apps/api', 'apps/web'];
