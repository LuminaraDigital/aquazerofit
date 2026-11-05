// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { enableAsyncFonts } from './asyncFonts';

describe('enableAsyncFonts', () => {
  it('switches the non-blocking font links to screen media and leaves other links alone', () => {
    document.head.innerHTML = `
      <link rel="stylesheet" href="https://fonts.googleapis.com/a" media="print" data-async-font>
      <link rel="stylesheet" href="https://fonts.googleapis.com/b" media="print" data-async-font>
      <link rel="stylesheet" href="/print.css" media="print">`;
    enableAsyncFonts(document);
    const media = [...document.querySelectorAll('link')].map((l) => l.media);
    expect(media).toEqual(['all', 'all', 'print']);
  });
});
