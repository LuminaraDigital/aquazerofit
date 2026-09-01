package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable

/** Response of `GET /foods?search=&limit=` — `{items}`. */
@Serializable
data class FoodsSearchDto(
    val items: List<FoodDto> = emptyList(),
)

/** Response of `GET /foods/:id` — `{food}`. */
@Serializable
data class FoodEnvelopeDto(
    val food: FoodDto,
)

/** Response of `GET /foods/barcode/:code`. */
@Serializable
data class BarcodeLookupDto(
    val food: FoodDto? = null,
    val allergens: List<Allergen> = emptyList(),
    val tracesAllergens: List<Allergen> = emptyList(),
    /** Where the record came from (`local` mirror or live OFF fallback). */
    val origin: String = "",
)

/** Response of `GET /recipes` — `{items}`. */
@Serializable
data class RecipesDto(
    val items: List<RecipeDto> = emptyList(),
)

/** Response of `GET /recipes/:id` — `{recipe}`. */
@Serializable
data class RecipeEnvelopeDto(
    val recipe: RecipeDto,
)

/** Response of `GET /exercises/:id` — `{exercise}` or the raw document. */
@Serializable
data class ExerciseEnvelopeDto(
    val exercise: ExerciseDto,
)
