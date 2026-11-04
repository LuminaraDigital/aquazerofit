import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('mini app boot shell', () => {
  it('is in index.html so the first paint is branded before JavaScript runs', () => {
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');
    expect(html).toContain('id="azf-boot"');
    expect(html).toContain('Loading your day');
    expect(html).toContain('background: #0e1416');
    expect(html).toContain('<div id="root"></div>');
  });
});
