/**
 * DRIFT GUARD — the SPA is served by two hosts with two independently authored
 * Content-Security-Policies, and nothing until now connected them:
 *
 *   1. Express (`apps/api/src/app.ts`) sends one via helmet when it serves the
 *      built SPA from the same origin as the API;
 *   2. Azure Static Web Apps sends one from `staticwebapp.config.json` when the
 *      SPA is deployed on its own.
 *
 * They drifted, and the failure mode is the worst kind: the app works in dev
 * and on the single-origin deployment, and the bot challenge on register /
 * password-reset is silently blocked on the static host — the Turnstile origin
 * was missing from `script-src` and there was no `frame-src` at all, so the
 * challenge iframe fell back to `default-src 'self'`.
 *
 * ── How each side is derived ────────────────────────────────────────────────
 *
 * STATIC: parsed from `staticwebapp.config.json` on disk. That file *is* the
 * deployed artefact, so there is nothing closer to the truth to read.
 *
 * EXPRESS: parsed out of the *source text* of `apps/api/src/app.ts`, not
 * imported from it. Importing was tried first and is not workable here:
 * `createApp()` pulls in `./platform/config` (which validates the environment
 * and throws without it), the data store and the whole module router, and the
 * directive object is a local inside a function whose branch depends on a
 * built SPA existing on disk — so even with the environment faked, getting the
 * policy back out would mean booting the app and reading a response header,
 * which drags an API-side integration harness into the web suite. It is also
 * outside this workspace's tsconfig `include`. Parsing the source is therefore
 * the next best thing, and the parser below is deliberately loud: it resolves
 * `TURNSTILE_ORIGIN` from the same file rather than accepting a bare
 * identifier, and the first assertion fails if it did not find a plausible
 * policy — so a parser that quietly matched nothing cannot make this file pass.
 *
 * What is NOT done here: hardcoding both sides. A test that restates two
 * literals proves only that the literals were typed twice.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

const apiSource = read('../../../api/src/app.ts');
const staticSource = read('../../staticwebapp.config.json');

/**
 * Divergences that are correct rather than drift, each with the reason it is
 * allowed. Anything not listed here has to match.
 *
 * `connect-src`: on the static host the API lives on a different origin
 * (`*.aquazero.fit`), so the browser needs an explicit allowance for it. Under
 * Express the SPA and the API are the same origin and `'self'` already covers
 * it — adding the wildcard there would widen egress for nothing.
 */
const ALLOWED_EXTRA_ON_STATIC: Readonly<Record<string, readonly string[]>> = {
  'connect-src': ['https://*.aquazero.fit'],
};

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

// ---------------------------------------------------------------------------
// Express side: read the helmet directive object out of the source.
// ---------------------------------------------------------------------------

/** `const NAME = 'value'` at module scope, so `TURNSTILE_ORIGIN` can resolve. */
function moduleConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  const re = /const\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'\s*;/g;
  for (const match of source.matchAll(re)) constants.set(match[1]!, match[2]!);
  return constants;
}

/**
 * Return the object literal that starts at `openIndex`, with comments removed.
 *
 * Both hazards here are real in that file: the sources are URLs full of `//`,
 * which must not be read as a comment because they are inside quotes, and the
 * comments are English prose containing apostrophes ("the widget's XHR"),
 * which must not be read as an opening quote. So strings and comments are both
 * tracked in the one pass that counts braces.
 */
function objectLiteralAt(source: string, openIndex: number): string {
  let depth = 0;
  let quote: string | null = null;
  let out = '';
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i]!;
    if (quote) {
      out += char;
      if (char === '\\') {
        out += source[i + 1] ?? '';
        i += 1;
      } else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end - 1;
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) throw new Error('unterminated block comment in apps/api/src/app.ts');
      i = end + 1;
      continue;
    }
    out += char;
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return out;
    }
  }
  throw new Error('unterminated object literal in apps/api/src/app.ts');
}

/** `scriptSrc` -> `script-src`, matching how helmet serialises the header. */
function toDirectiveName(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function parseHelmetPolicy(source: string): Map<string, string[]> {
  const constants = moduleConstants(source);
  // The SPA branch — the API-only branch is a different, stricter policy that
  // never serves HTML, so it is not what the static host is a peer of.
  const branch = /directives:\s*spaDir\s*\?\s*\{/.exec(source);
  if (!branch) throw new Error('could not locate the SPA CSP branch in apps/api/src/app.ts');
  const literal = objectLiteralAt(source, branch.index + branch[0].length - 1);

  const policy = new Map<string, string[]>();
  for (const entry of literal.matchAll(/([A-Za-z][\w]*)\s*:\s*\[([^\]]*)\]/g)) {
    const sources = entry[2]!
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => {
        const quoted = /^'(.*)'$|^"(.*)"$/.exec(token);
        if (quoted) return quoted[1] ?? quoted[2] ?? '';
        const resolved = constants.get(token);
        if (resolved === undefined) throw new Error(`unresolved CSP source: ${token}`);
        return resolved;
      });
    policy.set(toDirectiveName(entry[1]!), sources);
  }
  return policy;
}

// ---------------------------------------------------------------------------
// Static side: the header string from the deployed config file.
// ---------------------------------------------------------------------------

function parseStaticPolicy(json: string): Map<string, string[]> {
  const config = JSON.parse(json) as {
    globalHeaders?: Record<string, string>;
  };
  const header = config.globalHeaders?.['Content-Security-Policy'];
  if (!header) throw new Error('staticwebapp.config.json declares no Content-Security-Policy');
  const policy = new Map<string, string[]>();
  for (const part of header.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const name = tokens.shift();
    if (name) policy.set(name, tokens);
  }
  return policy;
}

const express = parseHelmetPolicy(apiSource);
const staticApp = parseStaticPolicy(staticSource);

/**
 * Only cross-origin sources are compared. Keywords (`'self'`, `'none'`,
 * `'unsafe-inline'`) and scheme-only sources (`data:`, `blob:`, `https:`) mean
 * the same thing on both hosts; a third-party *origin* is the thing that gets
 * forgotten on one side and breaks a vendor widget.
 */
function thirdPartyOrigins(sources: readonly string[] | undefined): string[] {
  return [...(sources ?? [])].filter((s) => /^https?:\/\//i.test(s)).sort();
}

describe('Content-Security-Policy parity between Express and Azure Static Web Apps', () => {
  it('parsed a plausible policy from each source', () => {
    // Guards the parsers themselves: every assertion below is vacuous if these
    // maps come back empty or missing the directives that carry third parties.
    expect(express.size).toBeGreaterThanOrEqual(10);
    expect(staticApp.size).toBeGreaterThanOrEqual(10);
    for (const directive of ['script-src', 'frame-src', 'frame-ancestors', 'connect-src']) {
      expect(thirdPartyOrigins(express.get(directive)).length, `express ${directive}`)
        .toBeGreaterThanOrEqual(directive === 'connect-src' ? 0 : 1);
      expect(staticApp.has(directive), `static ${directive}`).toBe(true);
    }
  });

  it('declares the same set of directives on both hosts', () => {
    // A directive absent on one side is not "unset" — it silently inherits
    // default-src there, which is exactly how frame-src went missing.
    expect([...staticApp.keys()].sort()).toEqual([...express.keys()].sort());
  });

  it('allows the same third-party origins per directive', () => {
    for (const directive of new Set([...express.keys(), ...staticApp.keys()])) {
      const allowedExtra = ALLOWED_EXTRA_ON_STATIC[directive] ?? [];
      const expressOrigins = thirdPartyOrigins(express.get(directive));
      const staticOrigins = thirdPartyOrigins(staticApp.get(directive)).filter(
        (origin) => !allowedExtra.includes(origin),
      );
      expect(staticOrigins, `${directive} drifted between the two policies`).toEqual(
        expressOrigins,
      );
    }
  });

  it('lets Turnstile load its script and frame its challenge on both hosts', () => {
    // The specific regression this file was written for. Turnstile injects
    // https://challenges.cloudflare.com/turnstile/v0/api.js (see lib/turnstile)
    // and renders the challenge in an iframe it serves itself, so both
    // directives are required or registration and password reset are blocked.
    for (const [host, policy] of [
      ['express', express],
      ['static', staticApp],
    ] as const) {
      expect(policy.get('script-src'), `${host} script-src`).toContain(TURNSTILE_ORIGIN);
      expect(policy.get('frame-src'), `${host} frame-src`).toContain(TURNSTILE_ORIGIN);
    }
  });

  it('keeps Turnstile out of connect-src on both hosts', () => {
    // Deliberate, and explained in apps/api/src/app.ts: the widget's XHR is
    // issued from inside its own iframe, a separate browsing context governed
    // by Cloudflare's policy rather than this one. Listing it here would widen
    // the page's egress allowance for no benefit — so parity must not be
    // "fixed" in that direction by someone reading a console warning.
    expect(express.get('connect-src')).not.toContain(TURNSTILE_ORIGIN);
    expect(staticApp.get('connect-src')).not.toContain(TURNSTILE_ORIGIN);
  });
});
