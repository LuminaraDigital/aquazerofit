/**
 * Crisis signpost localisation.
 *
 * A refusal that ends in an unreachable phone number is worse than a refusal:
 * it looks like help and is not. So the properties asserted here are (a) that
 * the region really is extracted from every locale shape a client sends, (b)
 * that an unknown region is sent to a directory rather than guessed at, and
 * (c) that the no-locale answer is byte-for-byte the wording this product
 * already shipped — the back-compat guarantee `CRISIS_SIGNPOST` depends on.
 *
 * The last block proves the guardrail path actually threads the locale
 * through; a perfect parser nothing calls would be worth nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  CRISIS_HELPLINE_DIRECTORY_URL,
  CRISIS_HELPLINES,
  CRISIS_SIGNPOST,
  crisisHelplineFor,
  crisisSignpostFor,
  regionFromLocale,
} from '@aquazerofit/shared';
import type { Request } from 'express';
import { pre, refusalMessageFor } from '../modules/ai/guardrails';
import { localeOf } from '../platform/locale';

/** Express-request stand-in carrying only the header localeOf reads. */
function fakeRequest(headers: Record<string, string> = {}): Request {
  return { get: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

describe('localeOf', () => {
  it('reads the standard Accept-Language header — no new header was added', () => {
    // The /api/v1 contract is frozen; both the browser and the Android client
    // already send this one.
    expect(localeOf(fakeRequest({ 'accept-language': 'en-GB,en;q=0.9' }))).toBe('en-GB,en;q=0.9');
  });

  it('is an empty string when the caller sent none, which means AU', () => {
    expect(localeOf(fakeRequest())).toBe('');
    expect(crisisSignpostFor(localeOf(fakeRequest()))).toBe(CRISIS_SIGNPOST);
  });
});

describe('regionFromLocale', () => {
  it('reads the region from a plain BCP 47 tag', () => {
    expect(regionFromLocale('en-AU')).toBe('AU');
    expect(regionFromLocale('en-US')).toBe('US');
  });

  it('accepts the POSIX underscore form', () => {
    expect(regionFromLocale('en_GB')).toBe('GB');
  });

  it('reads the first tag of a whole Accept-Language header', () => {
    expect(regionFromLocale('en-GB,en;q=0.9')).toBe('GB');
    expect(regionFromLocale('en-NZ,en-AU;q=0.8,en;q=0.5')).toBe('NZ');
  });

  it('steps over a script subtag to find the region', () => {
    expect(regionFromLocale('zh-Hant-TW')).toBe('TW');
    expect(regionFromLocale('sr-Latn-RS')).toBe('RS');
  });

  it('is case and separator tolerant', () => {
    expect(regionFromLocale('EN-au')).toBe('AU');
    expect(regionFromLocale('  en_gb  ')).toBe('GB');
    expect(regionFromLocale('EN-LATN-ie;q=1.0')).toBe('IE');
  });

  it('returns null when there is no region to find', () => {
    // Distinct from "a region we have no line for" — this falls back to AU,
    // that falls through to the directory.
    expect(regionFromLocale('en')).toBeNull();
    expect(regionFromLocale('')).toBeNull();
    expect(regionFromLocale('   ')).toBeNull();
    expect(regionFromLocale('*')).toBeNull();
    expect(regionFromLocale(undefined)).toBeNull();
    expect(regionFromLocale(null)).toBeNull();
  });

  it('does not mistake a language-only header list for a region', () => {
    expect(regionFromLocale('en,fr;q=0.7')).toBeNull();
  });
});

describe('crisisSignpostFor', () => {
  it('is byte-identical to the shipped AU wording when no region is known', () => {
    // CRISIS_SIGNPOST is still exported for the call sites that have no locale
    // to hand; these two must never drift apart.
    expect(crisisSignpostFor(undefined)).toBe(CRISIS_SIGNPOST);
    expect(crisisSignpostFor('')).toBe(CRISIS_SIGNPOST);
    expect(crisisSignpostFor('en')).toBe(CRISIS_SIGNPOST);
    expect(CRISIS_SIGNPOST).toContain('Lifeline on 13 11 14 (Australia)');
  });

  it('names the local line for each mapped region', () => {
    expect(crisisSignpostFor('en-AU')).toContain('Lifeline on 13 11 14 (Australia)');
    expect(crisisSignpostFor('en-US')).toContain('988 Suicide & Crisis Lifeline on 988');
    expect(crisisSignpostFor('fr-CA')).toContain('(Canada)');
    expect(crisisSignpostFor('en-GB,en;q=0.9')).toContain('Samaritans on 116 123 (United Kingdom)');
    expect(crisisSignpostFor('en_IE')).toContain('Samaritans on 116 123 (Ireland)');
    expect(crisisSignpostFor('en-NZ')).toContain('on 1737 (New Zealand)');
    expect(crisisSignpostFor('hi-IN')).toContain('Tele-MANAS on 14416 (India)');
  });

  it('sends an unmapped region to the directory instead of guessing a number', () => {
    const message = crisisSignpostFor('zh-Hant-TW');
    expect(message).toContain(CRISIS_HELPLINE_DIRECTORY_URL);
    // The AU number must not survive into a signpost shown outside AU.
    expect(message).not.toContain('13 11 14');
    expect(crisisSignpostFor('de-DE')).toContain(CRISIS_HELPLINE_DIRECTORY_URL);
  });

  it('keeps the refusal itself identical whatever the region', () => {
    const lead = 'AquaZeroFit is not able to help with this, but you deserve real support';
    for (const locale of ['en-AU', 'en-US', 'de-DE', 'zh-Hant-TW', '']) {
      expect(crisisSignpostFor(locale)).toContain(lead);
    }
  });
});

describe('crisisHelplineFor', () => {
  it('falls back to the home region when the locale carries none', () => {
    expect(crisisHelplineFor('en')).toBe(CRISIS_HELPLINES.AU);
  });

  it('is null for a region with no mapped line', () => {
    expect(crisisHelplineFor('de-DE')).toBeNull();
  });
});

describe('the guardrail refusal path uses the caller locale', () => {
  it('localises the crisis signpost through refusalMessageFor', () => {
    expect(refusalMessageFor('crisis', 'en-GB,en;q=0.9')).toBe(crisisSignpostFor('en-GB'));
    expect(refusalMessageFor('crisis')).toBe(CRISIS_SIGNPOST);
  });

  it('localises the message pre() hands to the chat router', () => {
    const decision = pre('I want to kill myself', { userId: 'u_test', locale: 'en-GB,en;q=0.9' });
    expect(decision.blocked).toBe(true);
    expect(decision.category).toBe('crisis');
    expect(decision.message).toContain('Samaritans on 116 123 (United Kingdom)');
    expect(decision.message).not.toContain('13 11 14');
  });

  it('still produces the AU wording when the request sent no Accept-Language', () => {
    expect(pre('I want to kill myself', { userId: 'u_test' }).message).toBe(CRISIS_SIGNPOST);
  });

  it('leaves the non-crisis refusals unchanged by locale', () => {
    // Only the crisis branch has a number in it; localising the rest would be
    // churn with no user visible in it.
    for (const category of ['medical', 'extremeDiet', 'outOfScope'] as const) {
      expect(refusalMessageFor(category, 'de-DE')).toBe(refusalMessageFor(category));
    }
  });
});
