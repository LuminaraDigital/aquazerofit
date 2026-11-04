/**
 * apps/web/public/.well-known/assetlinks.json is the Digital Asset Links
 * statement Android fetches before it lets the app open aquazerofit.com
 * links. A malformed file, a wrong package name or a mistyped fingerprint
 * does not error anywhere: verification just fails on users' devices and the
 * links open in the browser instead. So the shape is asserted here.
 *
 * Add the Play App Signing SHA-256 with `npm run assetlinks:add -- <SHA-256>`
 * (tools/assetlinks/add-fingerprint.mjs); see
 * docs/play-store/PLAY_CONSOLE_DECLARATIONS_CHECKLIST.md.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface Statement {
  relation: string[];
  target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
}

const file = path.resolve(__dirname, '../../public/.well-known/assetlinks.json');
const statements = JSON.parse(readFileSync(file, 'utf8')) as Statement[];

/** The upload key, already enrolled. Play App Signing is added alongside it. */
const UPLOAD_KEY_SHA256 =
  'AD:0A:15:F4:73:6A:74:0C:D5:B5:CA:96:1A:FC:46:0F:FD:BB:ED:3E:B3:6D:76:18:F9:20:AB:60:F2:BB:8B:E5';

describe('assetlinks.json', () => {
  it('has one handle_all_urls statement for the Android package', () => {
    const android = statements.filter((s) => s.target?.namespace === 'android_app');
    expect(android).toHaveLength(1);
    expect(android[0]!.target.package_name).toBe('fit.aquazero.app');
    expect(android[0]!.relation).toContain('delegate_permission/common.handle_all_urls');
  });

  it('lists only well-formed, unique SHA-256 fingerprints, including the upload key', () => {
    const fingerprints = statements[0]!.target.sha256_cert_fingerprints;
    expect(fingerprints.length).toBeGreaterThan(0);
    for (const fp of fingerprints) expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    expect(fingerprints).toContain(UPLOAD_KEY_SHA256);
  });
});
