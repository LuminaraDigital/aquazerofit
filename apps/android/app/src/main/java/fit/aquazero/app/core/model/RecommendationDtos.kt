package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable

/** Mirrors TS `MealRecommendation`. */
@Serializable
data class MealRecommendationDto(
    val id: String,
    val userId: String = "",
    val type: String = "recommendation",
    val name: String,
    val description: String = "",
    val mealType: MealType = MealType.SNACK,
    val kcal: Double = 0.0,
    val proteinG: Double = 0.0,
    val carbsG: Double = 0.0,
    val fatG: Double = 0.0,
    val ingredients: List<String> = emptyList(),
    val rationale: String = "",
    val ai: AiMetadataDto? = null,
    val feedback: String? = null,
    val loggedMealId: String? = null,
    val createdAt: String = "",
)

/** Body for `POST /recommendations/meals`. */
@Serializable
data class MealRecommendationRequest(
    /** Required by the route: it rejects the call without both of these. */
    val mealType: MealType,
    val localDate: String,
)

/** Body for `POST /recommendations/:id/feedback`. */
@Serializable
data class RecommendationFeedbackRequest(
    val feedback: String,
)
