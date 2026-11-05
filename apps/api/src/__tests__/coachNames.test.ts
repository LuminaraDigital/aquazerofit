/**
 * Coach names share one world with the Shén story cast.
 *
 * The story gives a few names to its own characters, and a coach who carries
 * the same one reads as that character on every card, chapter and picker:
 * Terry Bauer was "The Outlaw" while the story's biker boss Julius fights as
 * Outlaw, which is why the coach was renamed. Ring names must also stay unique
 * among the coaches, and each coach's voice must introduce him by the ring
 * name the picker shows, or the persona and the card disagree.
 */
import { describe, expect, it } from 'vitest';
import { COACHES } from '@aquazerofit/shared';

/** Names the Shén story owns: Kobe Wolf, and Julius "Outlaw". */
const STORY_OWNED = ['wolf', 'outlaw'];

describe('coach ring names', () => {
  it('are unique', () => {
    const rings = COACHES.map((c) => c.ringName.toLowerCase());
    expect(new Set(rings).size).toBe(rings.length);
  });

  it('never take a name the Shén story gives its own characters', () => {
    const clashes = COACHES.filter((c) =>
      STORY_OWNED.some((name) => c.ringName.toLowerCase().split(/\s+/).includes(name)),
    ).map((c) => `${c.name}: ${c.ringName}`);
    expect(clashes).toEqual([]);
  });
});
