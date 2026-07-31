/**
 * Deterministic allergen exclusion (AQF-11 §2: zero tolerance for false
 * negatives). This filter runs in CODE, after candidate selection and before
 * any model involvement — a model NEVER decides allergen safety.
 *
 * Two independent nets:
 *  1. The record's declared `allergens` field (authoritative).
 *  2. A name/ingredient keyword fallback map that catches records with missing
 *     or incomplete allergen tagging (e.g. "satay" → peanuts).
 * False positives (over-blocking) are acceptable; false negatives are not.
 */
import type { Allergen } from '@aquazerofit/shared';

export const ALLERGEN_NAME_KEYWORDS: Record<Allergen, string[]> = {
  peanuts: ['peanut', 'satay', 'groundnut', 'goober pea'],
  treeNuts: [
    'almond',
    'walnut',
    'cashew',
    'pecan',
    'pistachio',
    'hazelnut',
    'macadamia',
    'brazil nut',
    'pine nut',
    'praline',
    'nutella',
    'marzipan',
    'frangipane',
    'nut butter',
    'mixed nuts',
    'trail mix',
  ],
  milk: [
    'milk',
    'cheese',
    'butter',
    'cream',
    'yogurt',
    'yoghurt',
    'whey',
    'casein',
    'ghee',
    'custard',
    'paneer',
    'mozzarella',
    'parmesan',
    'ricotta',
    'feta',
    'halloumi',
    'latte',
    'kefir',
  ],
  eggs: ['egg', 'omelet', 'omelette', 'frittata', 'mayonnaise', 'mayo', 'meringue', 'aioli', 'quiche', 'hollandaise'],
  fish: [
    'fish',
    'salmon',
    'tuna',
    'cod',
    'anchov',
    'sardine',
    'trout',
    'mackerel',
    'snapper',
    'barramundi',
    'basa',
    'herring',
    'worcestershire',
  ],
  shellfish: [
    'shrimp',
    'prawn',
    'crab',
    'lobster',
    'oyster',
    'mussel',
    'clam',
    'scallop',
    'squid',
    'calamari',
    'octopus',
    'crayfish',
    'langoustine',
    'laksa',
  ],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'tempeh', 'miso', 'tamari', 'natto'],
  wheat: [
    'wheat',
    'bread',
    'pasta',
    'flour',
    'couscous',
    'noodle',
    'cracker',
    'tortilla',
    'seitan',
    'bulgur',
    'semolina',
    'crouton',
    'panko',
    'breadcrumb',
    'farro',
    'udon',
    'ramen',
  ],
  sesame: ['sesame', 'tahini', 'hummus', 'houmous', 'halva', 'za\'atar', 'gomashio'],
};

export interface AllergenCheckable {
  name: string;
  allergens?: readonly Allergen[] | Allergen[];
  ingredients?: readonly ({ name: string } | string)[];
}

function textsOf(item: AllergenCheckable): string[] {
  const texts = [item.name ?? ''];
  for (const ing of item.ingredients ?? []) {
    texts.push(typeof ing === 'string' ? ing : (ing?.name ?? ''));
  }
  return texts.map((t) => t.toLowerCase());
}

/** True when the item may contain the allergen (declared OR keyword hit). */
export function itemContainsAllergen(item: AllergenCheckable, allergen: Allergen): boolean {
  if ((item.allergens ?? []).includes(allergen)) return true;
  const keywords = ALLERGEN_NAME_KEYWORDS[allergen] ?? [];
  const texts = textsOf(item);
  return texts.some((text) => keywords.some((kw) => text.includes(kw)));
}

/**
 * Hard exclusion: returns only candidates that trip NO net for ANY declared
 * allergy. This is the single choke point every recommendation flows through.
 */
export function excludeAllergens<T extends AllergenCheckable>(
  candidates: readonly T[],
  allergies: readonly Allergen[],
): T[] {
  if (allergies.length === 0) return [...candidates];
  return candidates.filter((c) => !allergies.some((a) => itemContainsAllergen(c, a)));
}
