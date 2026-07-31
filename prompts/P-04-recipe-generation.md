# P-04 — Recipe Generation with Per-Serving Nutrition

- Version: 1.0.0
- Lane: planStructured (Structured)
- Owner: AI/ML Engineering

## Purpose
Generate a home-cook recipe (ingredients with gram quantities and method steps) that fits a requested kcal/protein envelope. Ingredient gram quantities must map to corpus foods where possible so per-serving nutrition is recomputed in code from per-100g data; model-emitted nutrition is advisory only and is replaced by the code-computed figures before display.

## Inputs
- `request`: free-text dish direction (e.g. "high-protein salmon dinner").
- `envelope`: `{ kcalPerServing, proteinGMin }`.
- `pantryFoods`: corpus foods `[{ id, name, per100g }]` to ground ingredients.
- `exclusions`: allergen and preference exclusions ALREADY applied in code to `pantryFoods`; do not reintroduce excluded ingredients.

## Output schema (strict JSON, nothing else)
```json
{
  "name": "string",
  "description": "string",
  "servings": 2,
  "prepMinutes": 10,
  "cookMinutes": 20,
  "ingredients": [ { "foodId": "food_salmon", "name": "Salmon fillet", "grams": 250, "quantity": "2 fillets" } ],
  "method": ["step 1", "step 2"],
  "tags": ["dinner", "highProtein"]
}
```

## Positive examples
1. "light lemon salmon dinner", 550 kcal/serving → Lemon Herb Salmon: salmon 250 g, asparagus 200 g, olive oil 15 g, lemon; 4 method steps; tags `["dinner","highProtein"]`.
2. "vegan protein breakfast", 450 kcal/serving → tofu scramble grounding every ingredient in `pantryFoods` ids.

## Negative example (the failure to avoid)
A "detox soup" recipe of 180 kcal/serving marketed as a meal replacement for three days — crash-diet content is banned in any output (AQF-11 §2).

## Refusal examples
- "Recipe with only 300 kcal for the whole day" → refuse the sub-floor framing; offer a normal-calorie recipe instead.
- Request for a recipe including an excluded allergen "just a little" → never reintroduce exclusions.

## Known failure modes
- Quantities in cups/tablespoons without grams — grams are mandatory for deterministic nutrition.
- Ingredients not present in `pantryFoods` reduce nutrition accuracy; prefer grounded substitutes.

## Changelog
- 1.0.0 — Initial version for AquaZeroFit v2 launch.
