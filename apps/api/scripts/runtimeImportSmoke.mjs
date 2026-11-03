/**
 * Fail the image build when a runtime import cannot be resolved from the
 * files actually present in this stage.
 *
 * Node resolves a bare specifier from the importing file, walking parent
 * directories for node_modules. npm workspaces sometimes nest a dependency
 * under apps/api/node_modules or packages/shared/node_modules instead of
 * hoisting it to the root. The runtime stage used to copy only the root
 * node_modules, so `import ... from 'zod'` in apps/api/src/platform/errors.ts
 * died with ERR_MODULE_NOT_FOUND after the zod 4 bump. This walks the API
 * entry graph and resolves every value import the same way, without booting
 * the server.
 *
 * Run from the repo root (the image WORKDIR):
 *   node apps/api/scripts/runtimeImportSmoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.cjs', '.json'];

export function extractRuntimeSpecifiers(source) {
  const cleaned = stripComments(source);
  const specs = new Set();
  // Statement-anchored so a path like '/exercises/import' or the word "from"
  // inside a string is not treated as an import. `import type` / `export type`
  // are erased and must not be resolved.
  const fromRe = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s+from\s*(['"])([^'"]+)\2/g;
  for (const match of cleaned.matchAll(fromRe)) {
    if (/^type\b/.test(match[1])) continue;
    specs.add(match[3]);
  }
  const sideRe = /(?:^|\n)\s*import\s*(['"])([^'"]+)\1/g;
  for (const match of cleaned.matchAll(sideRe)) specs.add(match[2]);
  const dynamicRe = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  for (const match of cleaned.matchAll(dynamicRe)) specs.add(match[2]);
  return [...specs];
}

export function checkRuntimeImports(rootDir) {
  const root = path.resolve(rootDir);
  const entry = path.join(root, 'apps/api/src/index.ts');
  const errorsFile = path.join(root, 'apps/api/src/platform/errors.ts');
  if (!fs.existsSync(entry)) {
    return {
      files: 0,
      packages: [],
      missing: [{ spec: 'apps/api/src/index.ts', from: root }],
    };
  }

  const seen = new Set();
  const packages = new Set();
  const missing = [];
  const queue = [entry];

  while (queue.length > 0) {
    const file = path.resolve(queue.pop());
    if (seen.has(file)) continue;
    seen.add(file);
    if (!isSourceFile(file)) continue;
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      missing.push({ spec: path.relative(root, file), from: file });
      continue;
    }
    for (const spec of extractRuntimeSpecifiers(text)) {
      if (spec.startsWith('node:') || spec.startsWith('data:') || spec.startsWith('file:')) continue;
      if (spec.startsWith('.')) {
        const resolved = resolveRelative(file, spec);
        if (!resolved) {
          missing.push({ spec, from: file });
          continue;
        }
        if (isTestFile(resolved)) continue;
        queue.push(resolved);
        continue;
      }
      const resolved = resolveBare(file, spec);
      if (!resolved) {
        missing.push({ spec, from: file });
        continue;
      }
      const name = packageName(spec);
      if (name) packages.add(name);
      if (isInsideRepoSource(root, resolved)) queue.push(resolved);
    }
  }

  // The Cloud Run crash was this exact import. Keep it even if the walker
  // ever skips the file.
  if (fs.existsSync(errorsFile)) {
    const zodFromErrors = resolveBare(errorsFile, 'zod');
    if (!zodFromErrors) missing.push({ spec: 'zod', from: errorsFile });
    else packages.add('zod');
  } else {
    missing.push({ spec: 'apps/api/src/platform/errors.ts', from: root });
  }

  missing.sort((a, b) => a.spec.localeCompare(b.spec) || a.from.localeCompare(b.from));
  const unique = [];
  const seenMissing = new Set();
  for (const item of missing) {
    const key = `${item.spec}\0${item.from}`;
    if (seenMissing.has(key)) continue;
    seenMissing.add(key);
    unique.push(item);
  }
  return { files: seen.size, packages: [...packages].sort(), missing: unique };
}

function stripComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(source.length, i + 2);
      out += ' ';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      out += ch;
      i += 1;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') {
          out += source[i];
          i += 1;
        }
        if (i < source.length) {
          out += source[i];
          i += 1;
        }
      }
      if (i < source.length) {
        out += source[i];
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function isSourceFile(file) {
  return /\.(ts|tsx|mts|mjs|js|cjs)$/.test(file) && !file.endsWith('.d.ts');
}

function isTestFile(file) {
  return (
    file.includes(`${path.sep}__tests__${path.sep}`) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
  );
}

function isInsideRepoSource(root, file) {
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return !rel.split(path.sep).includes('node_modules');
}

function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base];
  for (const ext of EXTENSIONS) candidates.push(base + ext);
  for (const ext of EXTENSIONS) candidates.push(path.join(base, `index${ext}`));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function resolveBare(fromFile, spec) {
  // createRequire walks node_modules from the importing file. import.meta.resolve
  // ignores the parent and resolves from this script, which would hide a missing
  // dependency whenever this file's own tree can see it.
  try {
    return createRequire(fromFile).resolve(spec);
  } catch {
    return null;
  }
}

function packageName(spec) {
  if (spec.startsWith('@')) {
    const [scope, name] = spec.split('/');
    return name ? `${scope}/${name}` : null;
  }
  const name = spec.split('/')[0];
  return name || null;
}

function printMissing(missing) {
  for (const item of missing) {
    console.error(`missing ${item.spec} imported from ${item.from}`);
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  const rootFlag = process.argv.indexOf('--root');
  const root = rootFlag >= 0 ? process.argv[rootFlag + 1] : process.cwd();
  if (!root) {
    console.error('runtime import smoke: --root needs a directory');
    process.exit(1);
  }
  const result = checkRuntimeImports(root);
  if (result.missing.length > 0) {
    printMissing(result.missing);
    console.error(
      `runtime import smoke failed: ${result.missing.length} unresolved import(s) from ${root}`,
    );
    process.exit(1);
  }
  console.log(
    `runtime import smoke ok: ${result.packages.length} packages across ${result.files} files (zod resolved)`,
  );
}
