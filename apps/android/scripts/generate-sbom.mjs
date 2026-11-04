#!/usr/bin/env node
/**
 * Generates a CycloneDX 1.5 JSON SBOM for the Android Gradle Catalog (`EN-1.5`).
 *
 * Parses `apps/android/gradle/libs.versions.toml` into Package URLs (`pkg:maven/...`)
 * and emits `apps/android/app/build/reports/sbom/android-cyclonedx-sbom.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const androidRoot = path.resolve(__dirname, '..');
const catalogPath = path.join(androidRoot, 'gradle', 'libs.versions.toml');
const outputPath = path.join(
  androidRoot,
  'app',
  'build',
  'reports',
  'sbom',
  'android-cyclonedx-sbom.json',
);

const raw = fs.readFileSync(catalogPath, 'utf8');
const versions = new Map();
const components = [];

let section = '';
for (const rawLine of raw.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const header = line.match(/^\[([a-zA-Z0-9_-]+)\]$/);
  if (header) {
    section = header[1];
    continue;
  }
  if (section === 'versions') {
    const m = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
    if (m) versions.set(m[1], m[2]);
  } else if (section === 'libraries') {
    const entry = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{(.+)\}/);
    if (!entry) continue;
    const body = entry[2];
    const moduleMatch = body.match(/module\s*=\s*"([^":]+):([^"]+)"/);
    const groupMatch = body.match(/group\s*=\s*"([^"]+)"/);
    const nameMatch = body.match(/name\s*=\s*"([^"]+)"/);
    const versionRefMatch = body.match(/version\.ref\s*=\s*"([^"]+)"/);
    const versionInlineMatch = body.match(/(?:^|,|\s)version\s*=\s*"([^"]+)"/);
    const group = moduleMatch ? moduleMatch[1] : groupMatch?.[1];
    const name = moduleMatch ? moduleMatch[2] : nameMatch?.[1];
    if (!group || !name) continue;
    const version =
      (versionRefMatch ? versions.get(versionRefMatch[1]) : versionInlineMatch?.[1]) ??
      (group.startsWith('androidx.compose')
        ? versions.get('androidxComposeBom')
        : group === 'com.google.firebase'
          ? versions.get('firebaseBom')
          : 'unspecified');
    const purl = `pkg:maven/${group}/${name}@${version}`;
    components.push({
      type: 'library',
      'bom-ref': purl,
      group,
      name,
      version,
      purl,
    });
  }
}

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: 'application',
      'bom-ref': 'pkg:android/fit.aquazero.app',
      group: 'fit.aquazero',
      name: 'app',
      version: process.env.AZF_VERSION_NAME || '1.0.0',
    },
  },
  components,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');
console.log(`Generated Android CycloneDX SBOM (${components.length} components) -> ${outputPath}`);
