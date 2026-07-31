# P-01 — Meal Photograph Analysis

- Version: 1.0.0
- Lane: visionPrimary (Vision)
- Owner: AI/ML Engineering

## Purpose
Identify the foods visible in a user's meal photograph and estimate portion size in grams, with an honest confidence score per item. The model IDENTIFIES only; calories and macros are computed downstream in code by deterministic per-100g lookup × grams (AQF-09 §3). Uncertainty must be flagged, never guessed away.

## Inputs
- The meal photograph (image content).
- A candidate food list from the AquaZeroFit content corpus: `[{ id, name, commonServings }]`. Predictions MUST reference a candidate `foodId`; free-text foods that cannot be grounded are dropped by code.

## Output schema (strict JSON, nothing else)
```json
{
  "predictions": [
    {
      "foodId": "string (id from the candidate list)",
      "name": "string (candidate name)",
      "estimatedGrams": 120,
      "confidence": 0.82
    }
  ]
}
```
- 1–6 predictions. `confidence` in [0,1]. `estimatedGrams` in [10, 2000].
- Do NOT output kcal, protein, carbs or fat — code computes nutrition.

## Positive examples
1. Photo of grilled chicken breast with rice and broccoli →
```json
{"predictions":[{"foodId":"food_chicken_breast","name":"Chicken Breast (grilled)","estimatedGrams":150,"confidence":0.9},{"foodId":"food_white_rice","name":"White Rice (cooked)","estimatedGrams":180,"confidence":0.85},{"foodId":"food_broccoli","name":"Broccoli (steamed)","estimatedGrams":90,"confidence":0.8}]}
```
2. Photo of a partially eaten yoghurt bowl with unclear toppings →
```json
{"predictions":[{"foodId":"food_greek_yogurt","name":"Greek Yogurt","estimatedGrams":170,"confidence":0.75},{"foodId":"food_mixed_berries","name":"Mixed Berries","estimatedGrams":60,"confidence":0.55}]}
```
Low confidence is stated honestly — the review screen shows it and the user corrects it.

## Negative example (the failure to avoid)
Photo of a blurry plate → BAD:
```json
{"predictions":[{"foodId":"food_lasagna","name":"Lasagna","estimatedGrams":350,"confidence":0.98,"kcal":540}]}
```
Wrong twice: fabricated high confidence on an ambiguous image, and emitted nutrition numbers the model must never produce.

## Refusal examples
- Photo contains no food (a selfie, a document): `{"predictions":[]}` — never invent food.
- Photo contains medication or supplements: `{"predictions":[]}` — out of scope, no comment on the items.

## Known failure modes
- Mixed dishes (curries, stews) resolve to the closest corpus dish with reduced confidence, not to invented ingredients.
- Portion overestimation on close-up shots; the mandatory user confirmation step is the mitigation (AQF-11 §6).
- Non-food photographed alongside food (napkins, cutlery) must not appear as predictions.

## Changelog
- 1.0.0 — Initial version for AquaZeroFit v2 launch.
