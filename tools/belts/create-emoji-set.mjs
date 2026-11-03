/**
 * Provision the belt custom-emoji set on a bot, once per bot.
 *
 *   TELEGRAM_BOT_TOKEN=… node tools/belts/create-emoji-set.mjs --owner <telegram-user-id>
 *
 * Uploads design/belts/emoji/<tier>.png (built by build-belt-art.mjs) as a
 * custom-emoji sticker set named `azf_belts_by_<bot username>`, then prints
 * the JSON that goes into TELEGRAM_BELT_EMOJI_IDS. Re-running against a bot
 * that already has the set skips the upload and prints the ids again, so it is
 * also how to recover the value later.
 *
 * `--owner` is the Telegram user id that will own the set (Bot API rule: every
 * set belongs to a user, and the bot can edit sets it created). Use the
 * founder's or an ops account, not a customer's.
 *
 * Run it separately for the staging bot and the production bot: custom emoji
 * ids belong to the set, and each bot creates its own.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIERS = ['white', 'blue', 'purple', 'brown', 'black'];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const ownerIndex = process.argv.indexOf('--owner');
const owner = Number(ownerIndex > 0 ? process.argv[ownerIndex + 1] : NaN);
if (!token || !Number.isSafeInteger(owner) || owner <= 0) {
  console.error('Usage: TELEGRAM_BOT_TOKEN=… node tools/belts/create-emoji-set.mjs --owner <telegram-user-id>');
  process.exit(1);
}

async function bot(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    ...(body instanceof FormData
      ? { body }
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
  });
  return res.json();
}

const me = await bot('getMe');
if (!me.ok) {
  console.error(`getMe failed: ${me.description}`);
  process.exit(1);
}
const name = `azf_belts_by_${me.result.username}`;

let set = await bot('getStickerSet', { name });
if (!set.ok) {
  const form = new FormData();
  form.set('user_id', String(owner));
  form.set('name', name);
  form.set('title', 'AquaZeroFit Belts');
  form.set('sticker_type', 'custom_emoji');
  form.set(
    'stickers',
    JSON.stringify(
      TIERS.map((tier) => ({ sticker: `attach://${tier}`, format: 'static', emoji_list: ['🥋'] })),
    ),
  );
  for (const tier of TIERS) {
    const png = await readFile(path.join(root, 'design', 'belts', 'emoji', `${tier}.png`));
    form.set(tier, new Blob([png], { type: 'image/png' }), `${tier}.png`);
  }
  const created = await bot('createNewStickerSet', form);
  if (!created.ok) {
    console.error(`createNewStickerSet failed: ${created.description}`);
    process.exit(1);
  }
  set = await bot('getStickerSet', { name });
}

// Stickers come back in upload order, which is TIERS order.
const ids = Object.fromEntries(TIERS.map((tier, i) => [tier, set.result.stickers[i]?.custom_emoji_id]));
if (TIERS.some((tier) => !ids[tier])) {
  console.error(`Set ${name} does not hold one emoji per tier; fix it in @Stickers and re-run.`);
  process.exit(1);
}
console.log(`Set: https://t.me/addemoji/${name}`);
console.log(`TELEGRAM_BELT_EMOJI_IDS='${JSON.stringify(ids)}'`);
