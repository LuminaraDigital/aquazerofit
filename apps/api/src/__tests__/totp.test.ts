/**
 * TOTP/base32 primitives checked against PUBLISHED vectors, not against our own
 * expectations: RFC 6238 Appendix B for TOTP (HMAC-SHA1 column) and RFC 4648
 * §10 for base32. An implementation that only passes hand-written assertions
 * proves that it is self-consistent, which is not the property that matters
 * when a third-party authenticator app has to agree with it.
 */
import { describe, expect, it } from 'vitest';
import {
  TOTP_STEP_SECONDS,
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totpCode,
  totpCodeAtStep,
  totpStepAt,
  verifyTotp,
} from '../modules/mfa/totp';

/**
 * RFC 6238 Appendix B: "the ASCII string value '12345678901234567890'" is the
 * shared secret for the SHA-1 vectors. Base32 of those 20 bytes is what our
 * API takes.
 */
const RFC_SEED_ASCII = '12345678901234567890';
const RFC_SEED_BASE32 = base32Encode(Buffer.from(RFC_SEED_ASCII, 'utf8'));

describe('RFC 4648 §10 base32 test vectors', () => {
  const vectors: Array<[string, string]> = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];

  // The RFC prints these with '=' padding (MY======, MZXW6YTBOI======);
  // otpauth secrets are conventionally unpadded, so encode emits no '='.
  it.each(vectors)('encodes %j as %j (padding stripped)', (input, expected) => {
    expect(base32Encode(Buffer.from(input, 'utf8'))).toBe(expected);
  });

  it.each(vectors)('decodes the encoding of %j back to itself', (input) => {
    const encoded = base32Encode(Buffer.from(input, 'utf8'));
    expect(base32Decode(encoded).toString('utf8')).toBe(input);
  });

  it('accepts the RFC padded forms and internal whitespace', () => {
    expect(base32Decode('MY======').toString('utf8')).toBe('f');
    expect(base32Decode('MZXW 6YTB OI').toString('utf8')).toBe('foobar');
    expect(base32Decode('mzxw6ytboi').toString('utf8')).toBe('foobar');
  });

  it('rejects a character outside the alphabet rather than skipping it', () => {
    // '1', '8', '9' and '0' are NOT in the RFC 4648 base32 alphabet.
    expect(() => base32Decode('MZXW6YTB01')).toThrow(/Invalid base32/);
  });
});

describe('RFC 6238 Appendix B test vectors (HMAC-SHA1, 8 digits, T0=0, X=30)', () => {
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  it.each(vectors)('T=%d produces %s', (epochSeconds, expected) => {
    expect(totpCode(RFC_SEED_BASE32, { now: epochSeconds, digits: 8 })).toBe(expected);
  });

  it('derives the same codes through the explicit step number', () => {
    for (const [epochSeconds, expected] of vectors) {
      const step = totpStepAt(epochSeconds, TOTP_STEP_SECONDS);
      expect(totpCodeAtStep(RFC_SEED_BASE32, step, 8)).toBe(expected);
    }
  });

  it('matches the RFC 4226 §5.4 HOTP vectors for the same seed', () => {
    // RFC 4226 Appendix D, counters 0..9, 6 digits, same ASCII seed.
    const hotpVectors = [
      '755224', '287082', '359152', '969429', '338314',
      '254676', '287922', '162583', '399871', '520489',
    ];
    const secret = Buffer.from(RFC_SEED_ASCII, 'utf8');
    hotpVectors.forEach((expected, counter) => {
      expect(hotp(secret, counter, 6)).toBe(expected);
    });
  });
});

describe('verifyTotp', () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000;

  it('accepts the current code and returns its step', () => {
    const code = totpCode(secret, { now });
    expect(verifyTotp(secret, code, { now })).toBe(totpStepAt(now));
  });

  it('accepts one step either side (clock skew) and no further', () => {
    const step = totpStepAt(now);
    expect(verifyTotp(secret, totpCodeAtStep(secret, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(secret, totpCodeAtStep(secret, step + 1), { now })).toBe(step + 1);
    expect(verifyTotp(secret, totpCodeAtStep(secret, step - 2), { now })).toBeNull();
    expect(verifyTotp(secret, totpCodeAtStep(secret, step + 2), { now })).toBeNull();
  });

  it('rejects malformed input without throwing', () => {
    expect(verifyTotp(secret, '', { now })).toBeNull();
    expect(verifyTotp(secret, '12345', { now })).toBeNull();
    expect(verifyTotp(secret, '1234567', { now })).toBeNull();
    expect(verifyTotp(secret, 'abcdef', { now })).toBeNull();
    expect(verifyTotp(secret, undefined as unknown as string, { now })).toBeNull();
  });

  it("rejects another account's code", () => {
    const other = generateTotpSecret();
    expect(verifyTotp(secret, totpCode(other, { now }), { now })).toBeNull();
  });
});

describe('secret and otpauth URI', () => {
  it('generates at least 20 bytes of entropy, base32 without padding', () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret).length).toBeGreaterThanOrEqual(20);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret).not.toContain('=');
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it('builds a URI an authenticator app can consume', () => {
    const uri = otpauthUri({
      secretBase32: 'MZXW6YTBOI',
      accountName: 'admin@aquazero.fit',
      issuer: 'AquaZeroFit',
    });
    const parsed = new URL(uri);
    expect(parsed.protocol).toBe('otpauth:');
    expect(parsed.host).toBe('totp');
    expect(decodeURIComponent(parsed.pathname)).toBe('/AquaZeroFit:admin@aquazero.fit');
    expect(parsed.searchParams.get('secret')).toBe('MZXW6YTBOI');
    expect(parsed.searchParams.get('issuer')).toBe('AquaZeroFit');
    expect(parsed.searchParams.get('algorithm')).toBe('SHA1');
    expect(parsed.searchParams.get('digits')).toBe('6');
    expect(parsed.searchParams.get('period')).toBe('30');
  });
});
