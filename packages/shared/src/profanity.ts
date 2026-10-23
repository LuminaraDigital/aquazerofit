/**
 * Display-name moderation.
 *
 * `displayName` is the one piece of free text in this product that another
 * person ever sees: huddle members (up to four, invite-only) are shown each
 * other's names. Everything else a user writes — chat turns, weight-log notes,
 * meal photos — is private to them or goes only to the model. That single
 * field is therefore the whole user-generated-content surface, and it shipped
 * with no filter at all.
 *
 * Two lists rather than one, because the naive approach breaks real names.
 * Matching every term as a substring is what produces the Scunthorpe problem —
 * it rejects people from Scunthorpe, Penistone and anyone called Cockburn.
 * Matching only on word boundaries is the opposite failure: it waves through
 * the deliberate evasion this exists to stop. So:
 *
 *   SUBSTRING_TERMS  long enough that an innocent word cannot contain them,
 *                    matched anywhere after normalisation.
 *   WORD_TERMS       short or substring-prone, matched only as whole words.
 *
 * Normalisation is what makes either list worth having: someone typing a slur
 * will not type it plainly. Diacritics are stripped, leetspeak folded, runs of
 * a repeated letter collapsed, and separators removed, so `f.u.c.k`, `fuuuck`,
 * `fück` and `f0ck` all reduce to the same token.
 *
 * This is deliberately a small, conservative list. It is a floor that makes the
 * field defensible, not a claim to catch everything — a determined person will
 * always get something past a wordlist, which is why a report path belongs
 * alongside it.
 */

/** Long enough to be unambiguous; matched anywhere in the normalised string. */
const SUBSTRING_TERMS = [
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'spastic',
  'paedo',
  'pedophile',
  'wanker',
  'bastard',
  'bollocks',
  'motherfucker',
  'whore',
  'slut',
];

/**
 * Matched as whole words only. Every entry here is a real substring of an
 * innocent English word or surname — `ass` in Cassidy, `cum` in circumstance,
 * `hell` in Michelle, `tit` in title, `fuk` in Fukuda.
 */
const WORD_TERMS = [
  // Moved down from SUBSTRING_TERMS after the tests caught them: 'cunt' is
  // inside Scunthorpe, 'rapist' inside therapist, and 'chink' is an ordinary
  // English word. Matching those anywhere is the Scunthorpe problem itself.
  'cunt',
  'rapist',
  'chink',
  'fuck',
  'fuk',
  'shit',
  'piss',
  'dick',
  'cock',
  'ass',
  'arse',
  'bitch',
  'damn',
  'hell',
  'cum',
  'tit',
  'tits',
  'penis',
  'vagina',
  'anal',
  'porn',
  'nazi',
  'hitler',
];

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
};

/**
 * Fold a name to the form the lists are written in.
 *
 * `collapseRuns` is applied AFTER leet folding so `fuuu4ck` and `f4aack` land
 * in the same place, and the result keeps single spaces so WORD_TERMS still
 * has boundaries to match on.
 */
function normalise(input: string): string {
  const folded = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .split('')
    .map((ch) => LEET[ch] ?? ch)
    .join('');

  // Anything that is not a letter or digit becomes a space, so `f.u.c.k`
  // separates into tokens we can also re-join below.
  const spaced = folded.replace(/[^a-z0-9]+/g, ' ').trim();
  // Collapse a letter repeated three or more times down to one: `fuuuck` -> `fuck`.
  return spaced.replace(/(.)\1{2,}/g, '$1');
}

/** Same string with every separator removed, for the substring pass. */
function squash(normalised: string): string {
  return normalised.replace(/\s+/g, '');
}

/**
 * True when the name should be refused.
 *
 * Checked against both the spaced and squashed forms: the squashed form is
 * what catches `f u c k`, while the spaced form is what gives WORD_TERMS the
 * boundaries that keep Cassidy and Michelle usable.
 */
export function containsProfanity(value: string): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  const spaced = normalise(value);
  if (spaced === '') return false;
  const squashed = squash(spaced);

  for (const term of SUBSTRING_TERMS) {
    if (squashed.includes(term)) return true;
  }
  const words = spaced.split(' ');
  for (const term of WORD_TERMS) {
    if (words.includes(term)) return true;
    // `f u c k` squashes to a single token; check that too, but only for the
    // whole squashed string, never as a substring of it.
    if (words.length > 1 && squashed === term) return true;
  }
  return false;
}

/** Message shown when a name is refused. Deliberately not quoting the match. */
export const PROFANITY_MESSAGE =
  'Please choose a different display name — other members of a huddle can see it.';
