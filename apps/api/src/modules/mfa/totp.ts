/**
 * RFC 6238 TOTP + RFC 4648 base32, implemented on node:crypto only.
 *
 * No runtime dependency is added for this: the algorithm is an HMAC, a
 * big-endian counter and a dynamic truncation, and a vendored implementation is
 * a smaller surface than another package in the deployed tree. Correctness is
 * not asserted against our own expectations — __tests__/totp.test.ts runs the
 * published RFC 6238 Appendix B vectors and the RFC 4648 §10 base32 vectors,
 * which is the only evidence that means anything for a primitive like this.
 *
 * Scope: HMAC-SHA1 only. That is what every authenticator app (Google
 * Authenticator, Aegis, 1Password, Authy) actually implements, and an
 * `algorithm=SHA256` otpauth URI is silently ignored by several of them, which
 * would produce codes that never match with no error anywhere.
 */
import crypto from 'node:crypto';
import { secureEquals } from '../../platform/auth';

/** RFC 4648 §6 alphabet. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Default TOTP parameters: 6 digits over a 30-second step (RFC 6238 §4). */
export const TOTP_DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;

/**
 * Clock-skew tolerance, in steps, applied either side of the current step.
 *
 * One step (±30s) and no more. Every extra step multiplies the number of codes
 * a blind guesser may hit at any instant — a ±1 window means three live codes
 * out of a million, and widening it to the ±4 some implementations use would
 * make nine, for the benefit of clients whose clock is minutes wrong and which
 * should be fixing their clock.
 */
export const TOTP_SKEW_STEPS = 1;

/** RFC 4648 base32, upper case, no padding (`=` is never emitted). */
export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Decode base32, tolerating the two things humans and authenticator apps do to
 * a secret in transit: `=` padding and internal whitespace. Anything else that
 * is not in the alphabet is an error rather than a silently skipped character —
 * quietly dropping a stray byte would produce a different key and therefore
 * codes that never match, with nothing to point at.
 */
export function base32Decode(encoded: string): Buffer {
  const clean = encoded.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const index = BASE32_ALPHABET.indexOf(ch);
    if (index === -1) throw new Error(`Invalid base32 character: ${JSON.stringify(ch)}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP: HMAC-SHA1 over the 8-byte big-endian counter, dynamically truncated. */
export function hotp(secret: Buffer, counter: number, digits: number = TOTP_DIGITS): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', secret).update(counterBuf).digest();
  // Dynamic truncation (RFC 4226 §5.3): low nibble of the last byte picks the
  // offset; the high bit of the selected word is masked off so the result is
  // sign-independent across implementations.
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export interface TotpOptions {
  digits?: number;
  stepSeconds?: number;
  /** Unix epoch seconds; defaults to now. */
  now?: number;
}

/** The counter (step number) covering a point in time. */
export function totpStepAt(epochSeconds: number, stepSeconds: number = TOTP_STEP_SECONDS): number {
  return Math.floor(epochSeconds / stepSeconds);
}

/** The code for one explicit step number. */
export function totpCodeAtStep(
  secretBase32: string,
  step: number,
  digits: number = TOTP_DIGITS,
): string {
  return hotp(base32Decode(secretBase32), step, digits);
}

/** The code for a point in time (defaults to now). */
export function totpCode(secretBase32: string, options: TotpOptions = {}): string {
  const nowSeconds = options.now ?? Math.floor(Date.now() / 1000);
  const step = totpStepAt(nowSeconds, options.stepSeconds ?? TOTP_STEP_SECONDS);
  return totpCodeAtStep(secretBase32, step, options.digits ?? TOTP_DIGITS);
}

/**
 * Verify a submitted code and return the step it matched, or null.
 *
 * The STEP is returned rather than a boolean because the caller needs it: a
 * code stays valid for its whole 30-second window, so accepting one twice is a
 * replay an attacker who observed a code over the shoulder or in a phished form
 * can actually use. The service records the accepted step and refuses anything
 * at or below it (see service.verifyTotpForUser).
 *
 * Comparison is via secureEquals, never `===`.
 */
export function verifyTotp(
  secretBase32: string,
  submitted: string,
  options: TotpOptions & { skewSteps?: number } = {},
): number | null {
  const digits = options.digits ?? TOTP_DIGITS;
  const stepSeconds = options.stepSeconds ?? TOTP_STEP_SECONDS;
  const skew = options.skewSteps ?? TOTP_SKEW_STEPS;
  if (typeof submitted !== 'string') return null;
  const code = submitted.trim();
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) return null;

  const nowSeconds = options.now ?? Math.floor(Date.now() / 1000);
  const current = totpStepAt(nowSeconds, stepSeconds);
  // Current step first, then the neighbours: the overwhelmingly common case is
  // an exact match and there is nothing to hide by ordering the candidates.
  for (let delta = 0; delta <= skew; delta++) {
    for (const step of delta === 0 ? [current] : [current - delta, current + delta]) {
      if (secureEquals(code, totpCodeAtStep(secretBase32, step, digits))) return step;
    }
  }
  return null;
}

/** A fresh secret: 20 random bytes (the RFC 4226 §4 R6 recommendation), base32. */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

/**
 * The `otpauth://` URI an authenticator app scans. Label and issuer are both
 * percent-encoded; the issuer appears twice by convention (path prefix and
 * query parameter) because different apps read different ones.
 */
export function otpauthUri(params: {
  secretBase32: string;
  accountName: string;
  issuer: string;
  digits?: number;
  stepSeconds?: number;
}): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.accountName)}`;
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(params.digits ?? TOTP_DIGITS),
    period: String(params.stepSeconds ?? TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
