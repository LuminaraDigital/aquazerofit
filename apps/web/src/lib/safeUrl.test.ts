import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from './safeUrl';

describe('safeHttpUrl', () => {
  it('accepts valid https and http URLs and trims surrounding whitespace', () => {
    expect(safeHttpUrl('https://world.openfoodfacts.org/product/3017620422003')).toBe(
      'https://world.openfoodfacts.org/product/3017620422003',
    );
    expect(safeHttpUrl('  http://wger.de/en/exercise/1/view/  ')).toBe(
      'http://wger.de/en/exercise/1/view/',
    );
  });

  it.each([
    ['javascript scheme', 'javascript:alert(1)'],
    ['mixed-case javascript scheme', 'JaVaScRiPt:alert(1)'],
    ['data URI', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript scheme', 'vbscript:msgbox(1)'],
    ['protocol-relative URL', '//evil.example/foo'],
    ['relative path', '/relative/path'],
    ['malformed string', 'not a url'],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['null', null],
    ['undefined', undefined],
  ])('rejects unsafe or invalid URL (%s)', (_label, input) => {
    expect(safeHttpUrl(input)).toBeUndefined();
  });
});
