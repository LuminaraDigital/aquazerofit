// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { pinThreadToLatest } from './threadScroll';

describe('pinThreadToLatest', () => {
  it('moves the document scroller to the end of the thread', () => {
    const scroller = { scrollHeight: 900, scrollTop: 40 };
    const doc = {
      scrollingElement: scroller,
      documentElement: { scrollHeight: 900, scrollTop: 12 },
      body: { scrollHeight: 400, scrollTop: 8 },
    } as unknown as Document;

    pinThreadToLatest(doc);

    expect(scroller.scrollTop).toBe(900);
    expect(doc.documentElement.scrollTop).toBe(900);
    expect(doc.body.scrollTop).toBe(400);
  });
});
