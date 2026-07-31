/**
 * CLI wrapper for the bounded Open Food Facts import (logic lives in
 * src/modules/foods/offImporter.ts). OFF data lands in the SEGREGATED
 * foodsOff container — never the curated content container (ODbL posture).
 *
 *   npm run import:off --workspace apps/api                 # up to 1,500 products
 *   npm run import:off --workspace apps/api -- --max 2500   # hard cap 2,500
 *
 * OFF search API sorted by popularity, ≤10 req/min, descriptive User-Agent
 * per OFF policy. Allergens come from OFF allergens_tags/traces_tags mapped
 * best-effort onto AQF ALLERGENS (wger's mirror discards them — we do not).
 */
import { runOffImportDefaultStore } from '../src/modules/foods/offImporter';
import { getStore } from '../src/platform/store';

const maxArgIndex = process.argv.indexOf('--max');
const maxRecords =
  maxArgIndex >= 0 ? Number(process.argv[maxArgIndex + 1]) || undefined : undefined;

void (async () => {
  // eslint-disable-next-line no-console
  console.log(`[off-import] starting (max=${maxRecords ?? 1500})`);
  const stats = await runOffImportDefaultStore({ maxRecords });
  await getStore().flush();
  // eslint-disable-next-line no-console
  console.log('[off-import] done', JSON.stringify(stats, null, 1));
  process.exit(stats.state === 'completed' ? 0 : 1);
})();
