/**
 * The Cloud Run revision died after the zod 4 bump because package-lock.json
 * nested zod under the workspaces and the runtime image copied only the root
 * node_modules. These checks fail if that layout, or the ignore rule that
 * dropped apps/api/src/data, comes back.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractRuntimeSpecifiers } from '../../scripts/runtimeImportSmoke.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');

describe('runtime import smoke', () => {
  it('keeps value imports and drops import type', () => {
    const specs = extractRuntimeSpecifiers(`
      import dotenv from 'dotenv';
      import { ZodError } from 'zod';
      import type { Pool } from 'pg';
      import { readFile } from 'node:fs';
      export type { User } from '@aquazerofit/shared';
      export * from './types';
      const { PostgresStore } = await import('./pgStore');
      import 'express';
    `);
    expect(specs.sort()).toEqual(
      ['dotenv', 'zod', 'node:fs', './types', './pgStore', 'express'].sort(),
    );
  });

  it('fails when zod is not on the resolution path from errors.ts', () => {
    const root = makeFixture({ zodAt: null });
    const result = runSmoke(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('missing zod');
    expect(result.stderr).toContain(`${path.sep}platform${path.sep}errors.ts`);
  });

  it('passes when zod is hoisted to the root node_modules', () => {
    const root = makeFixture({ zodAt: 'node_modules/zod' });
    const result = runSmoke(root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('zod resolved');
  });

  it('passes when zod is nested under apps/api/node_modules', () => {
    const root = makeFixture({ zodAt: 'apps/api/node_modules/zod' });
    const result = runSmoke(root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('zod resolved');
  });

  it('resolves the API entry graph from this checkout', () => {
    const result = runSmoke(repoRoot);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('zod resolved');
  });
});

describe('cloud run packaging', () => {
  it('hoists a single zod to the root of the lockfile', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { version?: string }>;
    };
    expect(lock.packages['node_modules/zod']?.version).toBe('4.6.7');
    expect(lock.packages['apps/api/node_modules/zod']).toBeUndefined();
    expect(lock.packages['packages/shared/node_modules/zod']).toBeUndefined();
  });

  it('copies workspace node_modules and runs the import smoke in the runtime stage', () => {
    const dockerfile = fs.readFileSync(path.join(repoRoot, 'apps/api/Dockerfile'), 'utf8');
    const runtime = dockerfile.split('Stage 2: runtime')[1] ?? '';
    expect(runtime).toContain('COPY --from=build --chown=nonroot:nonroot /repo/node_modules /repo/node_modules');
    expect(runtime).toContain(
      'COPY --from=build --chown=nonroot:nonroot /repo/apps/api/node_modules /repo/apps/api/node_modules',
    );
    expect(runtime).toContain(
      'COPY --from=build --chown=nonroot:nonroot /repo/packages/shared/node_modules /repo/packages/shared/node_modules',
    );
    expect(runtime).toContain('["/nodejs/bin/node", "apps/api/scripts/runtimeImportSmoke.mjs"]');
  });

  it('anchors root-only gcloudignore names so apps/api/src/data is uploaded', () => {
    const text = fs.readFileSync(path.join(repoRoot, '.gcloudignore'), 'utf8');
    const patterns = ignorePatterns(text);
    expect(patterns).toContain('/data');
    expect(patterns).not.toContain('data');
    expect(patterns).toEqual(expect.arrayContaining(['/docs', '/design', '/content', '/evals', '/tools', '/cloudflare']));
    expect(excluded(patterns, 'apps/api/src/data/seed.ts')).toBe(false);
    expect(excluded(patterns, 'apps/api/src/platform/errors.ts')).toBe(false);
    expect(excluded(patterns, 'data/local-store.json')).toBe(true);
    expect(excluded(patterns, 'docs/CLOUDFLARE_CUTOVER.md')).toBe(true);
    expect(excluded(patterns, 'node_modules/zod/index.js')).toBe(true);
    expect(excluded(patterns, 'apps/api/node_modules/zod/index.js')).toBe(true);
    expect(excluded(patterns, 'apps/api/.env')).toBe(true);
    expect(excluded(patterns, 'apps/android/app/src/main/AndroidManifest.xml')).toBe(true);
  });

  it('deploys the live image with gcloud run deploy instead of services replace', () => {
    const cloudbuild = fs.readFileSync(path.join(repoRoot, 'cloudbuild.yaml'), 'utf8');
    const cloudbuildCommands = uncommented(cloudbuild);
    expect(cloudbuildCommands).toContain('gcloud run deploy aquazerofit-api');
    expect(cloudbuildCommands).not.toContain('services replace');
    expect(cloudbuild).toContain('_AR_REPO: api');
    expect(cloudbuild).toContain('_IMAGE: aquazerofit-api');
    expect(cloudbuild).toContain('${_REGION}-docker.pkg.dev/$PROJECT_ID/${_AR_REPO}/${_IMAGE}:$COMMIT_SHA');
    // --image alone keeps whatever scaling the live service has. The store is
    // single-instance only, so every deploy pins it and declares it to the
    // boot guard, which refuses an unset AZF_INSTANCE_COUNT on Cloud Run.
    expect(cloudbuildCommands).toContain('--min-instances=1');
    expect(cloudbuildCommands).toContain('--max-instances=1');
    expect(cloudbuildCommands).toMatch(/--update-env-vars="[^"]*\bAZF_INSTANCE_COUNT=1\b/);

    const service = fs.readFileSync(path.join(repoRoot, 'deploy/cloudrun/service.yaml'), 'utf8');
    expect(service).toContain('gcloud run deploy aquazerofit-api --image');
    expect(uncommented(service)).not.toContain('services replace');

    // .github is dockerignored, so the image build does not have the workflow.
    // The checkout test job does.
    if (fs.existsSync(path.join(repoRoot, '.git'))) {
      const ci = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
      expect(ci).toContain('apps/api/Dockerfile');
      expect(ci).not.toContain('docker push');
    }
  });
});

function runSmoke(root: string): { status: number | null; stdout: string; stderr: string } {
  const script = path.join(repoRoot, 'apps/api/scripts/runtimeImportSmoke.mjs');
  const result = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function uncommented(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

function ignorePatterns(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('!'));
}

function excluded(patterns: string[], relPath: string): boolean {
  let ignored = false;
  for (const pattern of patterns) {
    if (gitignoreMatch(pattern, relPath)) ignored = true;
  }
  return ignored;
}

function gitignoreMatch(pattern: string, relPath: string): boolean {
  let body = pattern;
  let dirOnly = false;
  if (body.endsWith('/')) {
    dirOnly = true;
    body = body.slice(0, -1);
  }
  const anchored = body.startsWith('/');
  if (anchored) body = body.slice(1);
  if (!body) return false;
  const pathSegs = relPath.split('/').filter(Boolean);
  if (!anchored && !body.includes('/')) {
    return pathSegs.some((seg, index) => {
      if (!segmentGlob(body, seg)) return false;
      if (dirOnly && index === pathSegs.length - 1) return false;
      return true;
    });
  }
  return matchAnchored(body.split('/'), pathSegs, 0, 0, dirOnly);
}

function matchAnchored(
  patSegs: string[],
  pathSegs: string[],
  pi: number,
  si: number,
  dirOnly: boolean,
): boolean {
  if (pi === patSegs.length) return si <= pathSegs.length;
  if (patSegs[pi] === '**') {
    if (pi === patSegs.length - 1) return true;
    for (let k = si; k <= pathSegs.length; k += 1) {
      if (matchAnchored(patSegs, pathSegs, pi + 1, k, dirOnly)) return true;
    }
    return false;
  }
  if (si >= pathSegs.length) return false;
  if (!segmentGlob(patSegs[pi]!, pathSegs[si]!)) return false;
  if (pi === patSegs.length - 1) {
    if (dirOnly && si === pathSegs.length - 1) return false;
    return true;
  }
  return matchAnchored(patSegs, pathSegs, pi + 1, si + 1, dirOnly);
}

function segmentGlob(pattern: string, text: string): boolean {
  const re = `^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`;
  return new RegExp(re).test(text);
}

function makeFixture(options: { zodAt: string | null }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-runtime-smoke-'));
  const errorsDir = path.join(root, 'apps/api/src/platform');
  fs.mkdirSync(errorsDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'apps/api/src/index.ts'),
    "import './platform/errors';\nimport { z } from 'zod';\nexport const marker = z;\n",
  );
  fs.writeFileSync(
    path.join(errorsDir, 'errors.ts'),
    "import { ZodError } from 'zod';\nexport const err = ZodError;\n",
  );
  if (options.zodAt) {
    const pkgDir = path.join(root, options.zodAt);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'zod', version: '4.6.7', main: 'index.js' }),
    );
    fs.writeFileSync(path.join(pkgDir, 'index.js'), 'export class ZodError extends Error {}\n');
  }
  return root;
}
