/**
 * The deep-link payload is the only thing that crosses the web → Telegram
 * boundary, and Telegram refuses a link whose payload breaks its rules rather
 * than repairing it. So the encoder's contract is pinned here: what it emits
 * is always legal, and what survives a round trip is never silently wrong.
 */
import { describe, expect, it } from 'vitest';
import { decodePayload, encodePayload, telegramAppUrl, telegramProtocolUrl } from './telegramLink';
import { TELEGRAM_START_PARAM_MAX_CHARS } from './site';

/** Telegram's own rule for `start`/`startapp`: A–Z a–z 0–9 _ - , 1–64 chars. */
const LEGAL = /^[A-Za-z0-9_-]{1,64}$/;

describe('encodePayload', () => {
  it('returns null when there is nothing worth carrying', () => {
    expect(encodePayload({})).toBeNull();
    expect(encodePayload({ ref: null, utmSource: null })).toBeNull();
  });

  it('emits a payload Telegram will accept', () => {
    const payload = encodePayload({ ref: 'abc123', challengeCode: 'HUDDLE7' });
    expect(payload).toMatch(LEGAL);
  });

  it('round-trips the fields it carries', () => {
    const attr = { ref: 'abc123', challengeCode: 'HUDDLE7', utmSource: 'reddit' };
    const decoded = decodePayload(encodePayload(attr));

    expect(decoded.ref).toBe('abc123');
    expect(decoded.challengeCode).toBe('HUDDLE7');
    expect(decoded.utmSource).toBe('reddit');
  });

  it('stays legal when every value is hostile', () => {
    const payload = encodePayload({
      ref: 'a b/c?d=e&f',
      utmSource: 'ünïcodé',
      utmMedium: 'a'.repeat(200),
      utmCampaign: '<script>',
      challengeCode: 'x'.repeat(200),
    });

    expect(payload).toMatch(LEGAL);
    expect((payload ?? '').length).toBeLessThanOrEqual(TELEGRAM_START_PARAM_MAX_CHARS);
  });

  it('drops whole fields at the budget rather than truncating a value', () => {
    // A truncated campaign is indistinguishable from a real shorter one and
    // would quietly corrupt the report it feeds, so the field must vanish.
    const payload = encodePayload({
      ref: 'r'.repeat(24),
      challengeCode: 'C'.repeat(24),
      utmSource: 'source',
      utmCampaign: 'campaign',
    });

    expect(payload).toMatch(LEGAL);
    const decoded = decodePayload(payload);
    expect(decoded.ref).toBe('r'.repeat(24));
    for (const value of Object.values(decoded)) {
      // Nothing that survived may be a prefix of what went in.
      expect(value).not.toBe('camp');
    }
  });

  it('drops a value that sanitises away to nothing instead of emitting a bare key', () => {
    const payload = encodePayload({ ref: '???', challengeCode: 'OK1' });
    expect(payload).toBe('c-OK1');
  });
});

describe('decodePayload', () => {
  it('is total — a hostile payload costs attribution, never the launch', () => {
    for (const bad of [null, undefined, '', '__', 'x', '-nokey', 'zz-unknownkey', 'r-']) {
      expect(() => decodePayload(bad)).not.toThrow();
    }
    expect(decodePayload('zz-unknown')).toEqual({});
    expect(decodePayload('-nokey')).toEqual({});
  });

  it('normalises a challenge code to upper case so joins match', () => {
    expect(decodePayload('c-huddle7').challengeCode).toBe('HUDDLE7');
  });

  it('keeps the fields it recognises when a neighbouring segment is junk', () => {
    expect(decodePayload('zz-junk__r-abc').ref).toBe('abc');
  });
});

describe('telegramAppUrl', () => {
  it('points at the Mini App, not at a chat', () => {
    expect(telegramAppUrl()).toMatch(/^https:\/\/t\.me\/[^/]+\/[^?]+$/);
  });

  it('appends the payload only when there is one', () => {
    expect(telegramAppUrl()).not.toContain('startapp');
    expect(telegramAppUrl({ ref: 'abc' })).toContain('startapp=r-abc');
  });
});

describe('telegramProtocolUrl', () => {
  it('resolves the same bot and app through the tg:// handler', () => {
    const url = telegramProtocolUrl({ ref: 'abc' });
    expect(url.startsWith('tg://resolve?')).toBe(true);
    expect(url).toContain('domain=');
    expect(url).toContain('startapp=r-abc');
  });
});
