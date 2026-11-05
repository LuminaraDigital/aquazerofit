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

  /*
   * The Worker's CSP has no 'unsafe-inline' for scripts, so an inline
   * onload="this.media='all'" is blocked: the Google Fonts links stayed
   * media="print", no web font ever applied, and every Material Symbols icon
   * rendered as its name ("send Open in Telegram"). Live until this test.
   */
  it('has no inline event handlers for the CSP to block', () => {
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');
    expect(html).not.toMatch(/\son[a-z]+=["']/i);
    const asyncFonts = html.match(/<link[^>]*data-async-font[^>]*>/g) ?? [];
    expect(asyncFonts).toHaveLength(2);
    for (const link of asyncFonts) expect(link).toContain('media="print"');
  });
});
