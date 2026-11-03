/**
 * The two ways a display-name filter fails in production:
 *  1. it rejects real people (Scunthorpe, Penistone, Cassidy, Cockburn), and
 *  2. it waves through the trivial evasion it exists to stop.
 * Both directions are pinned here, because tuning one always risks the other.
 */
import { describe, expect, it } from 'vitest';
import { containsProfanity } from './profanity';

describe('containsProfanity — must NOT reject real names', () => {
  const innocent = [
    'Alex Waters', 'Cassidy', 'Cockburn', 'Scunthorpe', 'Penistone',
    'Michelle', 'Assumpta', 'Titus', 'Fukuda', 'Hancock', 'Dickens',
    'Shitake Mushroom Fan', // contains 'shit' but not as a word
    'therapist', 'Therapist Jane', // contains 'rapist'
    'circumstance', 'Cummings', 'Bassett', 'Grasse', 'Hello', 'Shelly',
    'Analiese', 'Arsenal FC', 'Класс', 'José Muñoz', '李伟', 'O’Brien',
  ];
  for (const name of innocent) {
    it(`allows ${JSON.stringify(name)}`, () => {
      expect(containsProfanity(name)).toBe(false);
    });
  }
});

describe('containsProfanity — must reject the obvious cases', () => {
  const blocked = [
    'fuck', 'FUCK', 'Fuck You', 'shit', 'a bitch', 'cunt', 'nigger', 'faggot',
  ];
  for (const name of blocked) {
    it(`blocks ${JSON.stringify(name)}`, () => {
      expect(containsProfanity(name)).toBe(true);
    });
  }
});

describe('containsProfanity — normalisation defeats the usual evasion', () => {
  const evasions: Array<[string, string]> = [
    ['f.u.c.k', 'separators'],
    ['f u c k', 'spaces'],
    ['fuuuuck', 'repeated letters'],
    ['sh1t', 'leetspeak one'],
    ['@ss hole', 'symbol substitution'],
    ['n1gger', 'leet inside a slur'],
    ['C U N T', 'spaced slur'],
    ['fück', 'diacritic'],
  ];
  for (const [name, why] of evasions) {
    it(`blocks ${JSON.stringify(name)} (${why})`, () => {
      expect(containsProfanity(name)).toBe(true);
    });
  }
});

describe('containsProfanity — accepted false positives', () => {
  // Documented rather than hidden. Each of these is innocent English, but as a
  // 60-character DISPLAY NAME shown to other people the slur reading is far more
  // likely than the innocent one, so the filter deliberately errs towards
  // refusing. If a real user ever hits one, the fix is a review path, not a
  // looser wordlist.
  it('refuses "a chink of light" — innocent prose, implausible as a name', () => {
    expect(containsProfanity('a chink of light')).toBe(true);
  });
  it('refuses "Niggardly" — obscure real word that contains a slur', () => {
    expect(containsProfanity('Niggardly')).toBe(true);
  });
});

describe('containsProfanity — edge cases must not throw', () => {
  it('treats empty and whitespace as clean', () => {
    expect(containsProfanity('')).toBe(false);
    expect(containsProfanity('   ')).toBe(false);
  });
  it('treats punctuation-only as clean rather than erroring', () => {
    expect(containsProfanity('...')).toBe(false);
    expect(containsProfanity('!!!')).toBe(false);
  });
  it('tolerates non-string input', () => {
    expect(containsProfanity(undefined as unknown as string)).toBe(false);
    expect(containsProfanity(null as unknown as string)).toBe(false);
  });
});
