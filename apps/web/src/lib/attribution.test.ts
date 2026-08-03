// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildShareUrl,
  captureAttributionFromUrl,
  getAttribution,
  inviteRefFromUserId,
} from './attribution';

describe('attribution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('captures first-touch ref and utm from the URL', () => {
    const attr = captureAttributionFromUrl(
      '?ref=abc123&utm_source=tiktok&utm_medium=creator&challenge=AQUA-TEST01',
    );
    expect(attr.ref).toBe('abc123');
    expect(attr.utmSource).toBe('tiktok');
    expect(attr.utmMedium).toBe('creator');
    expect(attr.challengeCode).toBe('AQUA-TEST01');
    expect(getAttribution().ref).toBe('abc123');
  });

  it('keeps first-touch ref when a later URL arrives without one', () => {
    captureAttributionFromUrl('?ref=first');
    const second = captureAttributionFromUrl('?utm_source=later');
    expect(second.ref).toBe('first');
    expect(second.utmSource).toBe('later');
  });

  it('builds share URLs with attribution params', () => {
    const url = buildShareUrl('/welcome', {
      ref: inviteRefFromUserId('11111111-2222-3333-4444-555555555555'),
      utm_source: 'share_card',
    });
    expect(url).toContain('/welcome');
    expect(url).toContain('ref=1111111122');
    expect(url).toContain('utm_source=share_card');
  });
});
