#!/usr/bin/env node
/**
 * Pre-merge / post-deploy smoke check.
 * Prefer APP_PUBLIC_URL (or SMOKE_BASE_URL). Without a URL, validates that
 * the built SPA and API entrypoints exist so CI still gates a broken build.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const base =
  process.env.SMOKE_BASE_URL?.replace(/\/$/, '') ||
  process.env.APP_PUBLIC_URL?.replace(/\/$/, '') ||
  '';

async function checkHttp(url) {
  const res = await fetch(url, { redirect: 'manual' });
  if (res.status >= 500) {
    throw new Error(`${url} returned ${res.status}`);
  }
  console.log(`ok ${res.status} ${url}`);
}

async function main() {
  if (base) {
    await checkHttp(`${base}/health`);
    await checkHttp(`${base}/ready`);
    console.log('smoke: remote health checks passed');
    return;
  }

  const webDist = resolve(process.cwd(), 'apps/web/dist/index.html');
  // The API runs via tsx from source; `npm run build -w api` is typecheck-only.
  const apiEntry = resolve(process.cwd(), 'apps/api/src/index.ts');
  const missing = [];
  if (!existsSync(webDist)) missing.push(webDist);
  if (!existsSync(apiEntry)) missing.push(apiEntry);
  if (missing.length) {
    console.error('smoke: missing build artifacts:\n' + missing.join('\n'));
    console.error('Run `npm run build` first, or set SMOKE_BASE_URL / APP_PUBLIC_URL.');
    process.exit(1);
  }
  console.log('smoke: web dist + API entry present (no remote URL configured)');
}

main().catch((err) => {
  console.error('smoke failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
