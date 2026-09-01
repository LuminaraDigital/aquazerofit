package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** Mirrors TS `FoodNutrients` / `NutritionSummary` (identical shapes). */
@Serializable
data class FoodNutrientsDto(
    val kcal: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val fiberG: Double? = null,
    val sugarG: Double? = null,
    val sodiumMg: Double? = null,
    val potassiumMg: Double? = null,
    val calciumMg: Double? = null,
    val ironMg: Double? = null,
)

/** One `commonServings` entry on a food. */
@Serializable
data class FoodServingDto(
    val label: String,
    val grams: Double,
)

/** Mirrors TS `Food`. */
@Serializable
data class FoodDto(
    val id: String,
    val type: String = "food",
    val name: String,
    val brand: String? = null,
    val category: String = "",
    val per100g: FoodNutrientsDto,
    val commonServings: List<FoodServingDto> = emptyList(),
    val allergens: List<Allergen> = emptyList(),
    val source: String = "",
    val licence: String = "",
    val barcode: String? = null,
    val nutriscore: Nutriscore? = null,
    val isVegan: Boolean? = null,
    val isVegetarian: Boolean? = null,
    val sourceUrl: String? = null,
)

/** Mirrors TS `RecipeIngredient`. */
@Serializable
data class RecipeIngredientDto(
    val foodId: String? = null,
    val name: String,
    val quantity: String = "",
    val grams: Double = 0.0,
)

/** Mirrors TS `Recipe`. */
@Serializable
data class RecipeDto(
    val id: String,
    val type: String = "recipe",
    val name: String,
    val description: String = "",
    val imageUrl: String? = null,
    val prepMinutes: Int = 0,
    val cookMinutes: Int = 0,
    val servings: Int = 1,
    val perServing: FoodNutrientsDto,
    val ingredients: List<RecipeIngredientDto> = emptyList(),
    val method: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val suitableFor: List<DietaryPreference> = emptyList(),
    val allergens: List<Allergen> = emptyList(),
    val source: String = "",
    val licence: String = "",
)

/** Mirrors TS `ExerciseMedia`. Attribution fields are never stripped. */
@Serializable
data class ExerciseMediaDto(
    val kind: String,
    val url: String,
    val caption: String? = null,
    val source: String? = null,
    val licence: String? = null,
    val licenceAuthor: String? = null,
    val licenceUrl: String? = null,
    val attributionText: String? = null,
    val isAiGenerated: Boolean? = null,
)

/** Mirrors TS `Exercise`. */
@Serializable
data class ExerciseDto(
    val id: String,
    val type: String = "exercise",
    val name: String,
    val description: String = "",
    val category: String = "strength",
    val primaryMuscles: List<String> = emptyList(),
    val secondaryMuscles: List<String> = emptyList(),
    val equipment: List<Equipment> = emptyList(),
    val difficulty: ExerciseExperience = ExerciseExperience.BEGINNER,
    val media: List<ExerciseMediaDto> = emptyList(),
    val licence: String = "",
    val licenceAuthor: String = "",
    val sourceId: String = "",
    val wgerUuid: String? = null,
    val variationGroup: String? = null,
    val licenceUrl: String? = null,
    val isAiGeneratedMedia: Boolean? = null,
)

/**
 * Mirrors TS `AchievementDefinition`. The `rule` union
 * (`{kind: 'streak'|'weightLoss'|…}`) is kept as raw JSON — the client only
 * renders name/description/icon; rule interpretation stays server-side.
 */
@Serializable
data class AchievementDefinitionDto(
    val id: String,
    val type: String = "achievementDefinition",
    val name: String,
    val description: String = "",
    val icon: String = "",
    val rule: JsonObject? = null,
)

/** Paged envelope for `GET /exercises?limit=&offset=` — `{items,total,limit,offset}`. */
@Serializable
data class PagedExercisesDto(
    val items: List<ExerciseDto>,
    val total: Int,
    val limit: Int,
    val offset: Int,
)
