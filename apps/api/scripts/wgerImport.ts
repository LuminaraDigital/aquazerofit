/**
 * CLI wrapper for the wger exercise ETL (logic lives in src/data/wger/importer.ts).
 *
 *   npm run import:wger --workspace apps/api                # full import
 *   npm run import:wger --workspace apps/api -- --incremental
 *   npm run import:wger --workspace apps/api -- --no-images
 *
 * Full mode: crawl exerciseinfo, upsert by wgerUuid, retire legacy `wger-1xx`
 * seeds, mirror images to apps/api/assets/exercises/. Incremental mode skips
 * unchanged records via the stored last_update_global cursor and replays the
 * wger deletion-log.
 */
import { runWgerImport } from '../src/data/wger/importer';
import { getStore } from '../src/platform/store';

const incremental = process.argv.includes('--incremental');
const mirrorImages = !process.argv.includes('--no-images');

void (async () => {
  // eslint-disable-next-line no-console
  console.log(`[wger-import] starting (${incremental ? 'incremental' : 'full'}, images=${mirrorImages})`);
  const stats = await runWgerImport({ incremental, mirrorImages });
  await getStore().flush();
  // eslint-disable-next-line no-console
  console.log('[wger-import] done', JSON.stringify(stats, null, 1));
  process.exit(stats.state === 'completed' ? 0 : 1);
})();
