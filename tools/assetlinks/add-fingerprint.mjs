#!/usr/bin/env node
/**
 * Add an Android signing certificate SHA-256 to the App Links statement at
 * apps/web/public/.well-known/assetlinks.json.
 *
 *   npm run assetlinks:add -- <SHA-256>     add one (idempotent)
 *   npm run assetlinks:add -- --list        print what is there
 *
 * Android verifies App Links against the certificate that signed the APK on
 * the device. A Play install is signed with the Play App Signing key, not the
 * upload key, so the statement needs the Play App Signing SHA-256 (Play
 * Console → Test and release → App integrity → App signing → "App signing key
 * certificate"). Paste it exactly as Play shows it; colons, spaces and case
 * do not matter. Fingerprints are public values, never secrets, but only add
 * one you copied from Play Console or from `keytool -list -v` on a keystore
 * you hold: a wrong value silently fails verification.
 *
 * The file is then validated by apps/web/src/lib/assetlinks.test.ts. Commit
 * it and deploy the web build; Android re-verifies on install or update.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../../apps/web/public/.well-known/assetlinks.json');
const PACKAGE = 'fit.aquazero.app';

/** "ad0a15…" or "AD:0A:15:…" or with spaces → "AD:0A:15:…", or null if not 32 bytes of hex. */
export function normaliseFingerprint(input) {
  const hex = String(input).replace(/[\s:]/g, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) return null;
  return hex.match(/.{2}/g).join(':');
}

async function main(argv) {
  const statements = JSON.parse(await readFile(FILE, 'utf8'));
  const target = statements.find(
    (s) => s?.target?.namespace === 'android_app' && s.target.package_name === PACKAGE,
  );
  if (!target) throw new Error(`${FILE} has no android_app statement for ${PACKAGE}`);
  const list = target.target.sha256_cert_fingerprints;

  if (argv.length === 0 || argv[0] === '--list') {
    for (const fp of list) console.log(fp);
    return argv.length === 0 ? 1 : 0;
  }

  let changed = false;
  for (const raw of argv) {
    const fp = normaliseFingerprint(raw);
    if (!fp) {
      console.error(`Not a SHA-256 fingerprint (expected 32 bytes of hex): ${raw}`);
      return 1;
    }
    if (list.includes(fp)) {
      console.log(`Already present: ${fp}`);
      continue;
    }
    list.push(fp);
    changed = true;
    console.log(`Added: ${fp}`);
  }
  if (changed) await writeFile(FILE, `${JSON.stringify(statements, null, 2)}\n`, 'utf8');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
