# P-01 — Meal Photograph Analysis

- Version: 1.2.0
- Lane: visionPrimary (Vision)
- Owner: AI/ML Engineering

## Purpose
Identify the foods visible in a user's meal photograph and estimate portion size in grams, with an honest confidence score per item. The model IDENTIFIES only; calories and macros are computed downstream in code by deterministic per-100g lookup × grams (AQF-09 §3). Uncertainty must be flagged, never guessed away.

## Inputs
- The meal photograph (image content).
- A candidate food list injected in the context block: `[{ id, name, commonServings }]`.
  Every prediction **MUST use a `foodId` taken verbatim from this list**.
  If the exact food is not in the list, **pick the closest available candidate** (e.g. if you see a burger bun, use `food-bread-white`; if you see pasta, use `food-pasta-cooked`).
  Predictions with a `foodId` that does not appear in the candidate list are silently dropped by code and the user sees nothing — an approximate match is always better than an invented one.

## Strict grounding rule
1. Read the `candidates` array from the context block.
2. For each food visible in the photo, scan the list for an exact or close match.
3. Use the candidate's exact `id` string as `foodId` — do NOT paraphrase, truncate or invent.
4. If nothing in the list is even approximately right, omit that food entirely rather than invent a `foodId`.

## Output schema (strict JSON, nothing else)
```json
{
  "predictions": [
    {
      "foodId": "food-chicken-breast",
      "name": "Chicken Breast (grilled)",
      "estimatedGrams": 120,
      "confidence": 0.82
    }
  ]
}
```
- 1–6 predictions. `confidence` in [0,1]. `estimatedGrams` in [10, 2000].
- Do NOT output kcal, protein, carbs or fat — code computes nutrition.
- `foodId` must be copied exactly from the candidate list, no modifications.

## Positive examples
1. Photo of grilled chicken breast with rice and broccoli →
```json
{"predictions":[{"foodId":"food-chicken-breast","name":"Chicken Breast (grilled)","estimatedGrams":150,"confidence":0.9},{"foodId":"food-rice-white-cooked","name":"White Rice (cooked)","estimatedGrams":180,"confidence":0.85},{"foodId":"food-broccoli","name":"Broccoli (steamed)","estimatedGrams":90,"confidence":0.8}]}
```
2. Photo of a partially eaten yoghurt bowl with unclear toppings →
```json
{"predictions":[{"foodId":"food-yoghurt-greek","name":"Greek Yoghurt (natural)","estimatedGrams":170,"confidence":0.75},{"foodId":"food-strawberries","name":"Strawberries","estimatedGrams":60,"confidence":0.55}]}
```
Low confidence is stated honestly — the review screen shows it and the user corrects it.

3. Photo of a burger — "hamburger" isn't in the candidate list, so decompose into visible ingredients:
```json
{"predictions":[{"foodId":"food-beef-mince-lean","name":"Beef Patty","estimatedGrams":120,"confidence":0.78},{"foodId":"food-bread-white","name":"Burger Bun","estimatedGrams":60,"confidence":0.7},{"foodId":"food-lettuce-cos","name":"Lettuce","estimatedGrams":15,"confidence":0.6},{"foodId":"food-tomato","name":"Tomato slice","estimatedGrams":30,"confidence":0.65}]}
```
When the exact dish isn't in the catalog, decompose it into visible ingredients and match each to the closest candidate.

## Negative examples (failures to avoid)
Photo of lasagna when `food-lasagna` is NOT in the candidate list → BAD:
```json
{"predictions":[{"foodId":"food-lasagna","name":"Lasagna","estimatedGrams":350,"confidence":0.98}]}
```
`food-lasagna` is invented — code will drop it and the user sees no predictions. Correct approach: decompose into `food-pasta-cooked`, `food-beef-mince-lean`, and `food-tomato` from the candidate list instead.

Also wrong — emitting nutrition numbers:
```json
{"predictions":[{"foodId":"food-chicken-breast","name":"Chicken","estimatedGrams":150,"confidence":0.9,"kcal":248}]}
```
`kcal` must not appear — code derives it.

## Refusal examples
- Photo contains no food (a selfie, a document): `{"predictions":[]}` — never invent food.
- Photo contains medication or supplements: `{"predictions":[]}` — out of scope, no comment on the items.

## Known failure modes
- Mixed dishes (curries, stews): decompose into visible ingredients and match each to the closest corpus entry with reduced confidence, not to invented compound ids.
- Portion overestimation on close-up shots; the mandatory user confirmation step is the mitigation (AQF-11 §6).
- Non-food photographed alongside food (napkins, cutlery) must not appear as predictions.
- Invented `foodId` values that are not in the candidate list are silently dropped — any match from the list is better than silence.

## Changelog
- 1.2.0 — Fixed example foodIds to match actual catalog: `food-yoghurt-greek` (was `food-greek-yogurt`), `food-beef-mince-lean` (was `food-beef-mince`).
- 1.1.0 — Strengthened candidate-grounding rules: explicit closest-match instruction, negative example for invented IDs, decomposition strategy for composite dishes.
- 1.0.0 — Initial version for AquaZeroFit v2 launch.
