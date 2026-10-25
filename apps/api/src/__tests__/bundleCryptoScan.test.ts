/**
 * The CI bundle scan (scripts/scan-bundle-crypto.mjs, AZF-P1 §8): its
 * patterns catch crypto phrasing and leave honest code alone.
 */
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: a plain .mjs script outside the workspaces, imported for its pure matcher.
const { cryptoHits } = (await import('../../../../scripts/scan-bundle-crypto.mjs')) as {
  cryptoHits: (text: string) => Array<{ match: string }>;
};

describe('bundle crypto scan', () => {
  it.each([
    'Connect your wallet',
    'Claim your airdrop',
    'Mint an NFT of your belt',
    'AZX token price',
    'Earn crypto rewards',
    'Back up your seed phrase',
    'Pay with Bitcoin',
    'Built on the blockchain',
  ])('catches "%s"', (text) => {
    expect(cryptoHits(text).length).toBeGreaterThan(0);
  });

  it.each([
    'crypto.randomUUID()',
    'globalThis.crypto.subtle.digest',
    'Your access token expired',
    'Premium price',
    'A mint green accent',
    'tonConnectUiEvents',
  ])('leaves "%s" alone', (text) => {
    expect(cryptoHits(text)).toEqual([]);
  });
});
