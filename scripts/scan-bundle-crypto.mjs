/**
 * Crypto-string scan over the built web bundle, which is also the Telegram
 * Mini App (AZF-P1 §8, §10.1 "Bundle").
 *
 *   npm run build && node scripts/scan-bundle-crypto.mjs [dist-dir]
 *
 * Telegram's Bot Developer Terms bar a Mini App from promoting third-party
 * blockchain assets, and Phase 1 carries no crypto content at all. This reads
 * every .js, .css and .html file the build emits and fails on wallet, token
 * sale, NFT, mint, airdrop, seed phrase, coin-price and similar wording. It
 * runs in CI after the build, so a dependency or a string that slips past the
 * source-level copy scans still cannot ship.
 *
 * Words like "token" and "price" alone are everywhere in honest code (auth
 * tokens, the Premium price), so the patterns match crypto phrasing rather
 * than single words, and words rather than identifiers. That is a choice to
 * know about: Telegram's own analytics SDK (@telegram-apps/analytics, wired
 * for the Mini App) ships listeners for TON Connect wallet events under
 * identifiers like `tonConnectUiEvents`. The app never emits those events and
 * they render nothing, so they do not fail this scan. A hit inside a
 * dependency that is not user-facing goes in ALLOWED with the reason;
 * nothing else does.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CRYPTO_PATTERNS = [
  /\bwallets?\b/i,
  /\bnfts?\b/i,
  /\bnon-fungible\b/i,
  /\bairdrops?\b/i,
  /\bseed phrases?\b/i,
  /\brecovery phrases?\b/i,
  /\bmint(?:ing|ed)? (?:an? |your |my |the )?(?:\w+ )?(?:nft|token|coin|belt|card|badge)s?\b/i,
  /\btokens? (?:sale|price|launch|listing|holders?|presale|swap|rewards?)\b/i,
  /\b(?:earn|collect|claim|win)\w* (?:\w+ )?(?:tokens?|coins?)\b/i,
  /\bcryptocurrenc(?:y|ies)\b/i,
  // "crypto" alone is the Web Crypto API (crypto.randomUUID); the phrasing is not.
  /\bcrypto (?:coins?|assets?|prices?|rewards?|tokens?|wallets?|trading|exchanges?|projects?)\b/i,
  /\b(?:blockchain|web3|defi)\b/i,
  /\bton ?connect\b/i,
  /\b(?:BTC|ETH|USDT|USDC|AZX)\b|\$TON\b/,
  /\b(?:bitcoin|ethereum|solana|dogecoin|toncoin)\b/i,
  /\bcoin (?:price|listing)\b/i,
  /\b(?:exchange|dex) listing\b/i,
];

/**
 * Known, reviewed hits that are not user-facing: [file pattern, exact match,
 * context pattern, reason]. All three must agree, so an entry clears that one
 * word in that one setting and nothing that happens to sit beside it. Add an
 * entry only when a dependency forces one, and say why.
 */
const ALLOWED = [
  [
    /\.js$/,
    'ethereum',
    /[`'"]ethereum[`'"]/,
    'A quoted feature name in the browser-fingerprint list of @telegram-apps/analytics, never shown to anyone.',
  ],
];

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return filesUnder(full);
      return /\.(?:js|mjs|css|html)$/.test(entry.name) ? [full] : [];
    }),
  );
  return nested.flat();
}

/** Every crypto-pattern hit in `text`, with a little context. */
export function cryptoHits(text) {
  const hits = [];
  for (const pattern of CRYPTO_PATTERNS) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    for (const match of text.matchAll(global)) {
      const start = Math.max(0, match.index - 40);
      hits.push({ match: match[0], context: text.slice(start, match.index + match[0].length + 40).replace(/\s+/g, ' ') });
    }
  }
  return hits;
}

export async function scanBundle(dist) {
  const files = await filesUnder(dist);
  if (files.length === 0) throw new Error(`No built files under ${dist}: run the web build first.`);
  const found = [];
  for (const file of files) {
    const rel = path.relative(dist, file).split(path.sep).join('/');
    for (const hit of cryptoHits(await readFile(file, 'utf8'))) {
      const allowed = ALLOWED.some(
        ([file, word, context]) => file.test(rel) && hit.match.toLowerCase() === word && context.test(hit.context),
      );
      if (!allowed) found.push({ file: rel, ...hit });
    }
  }
  return { files: files.length, found };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = path.resolve(process.argv[2] ?? path.join(root, 'apps', 'web', 'dist'));
  const { files, found } = await scanBundle(dist);
  if (found.length > 0) {
    console.error(`Crypto wording in the built bundle (${found.length}):`);
    for (const f of found) console.error(`  ${f.file}: "${f.match}" in …${f.context}…`);
    process.exit(1);
  }
  console.log(`Bundle crypto scan: ${files} files, no crypto wording.`);
}
