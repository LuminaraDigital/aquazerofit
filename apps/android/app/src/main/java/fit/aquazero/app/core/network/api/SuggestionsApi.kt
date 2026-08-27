package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.RecommendationFeedbackRequest
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * `/recommendations/…` as the server actually validates and replies.
 *
 * Two corrections over the wave-1 [RecommendationsApi], both caught by reading
 * `apps/api/src/modules/recommendations/router.ts` rather than the shared TS
 * types (the pattern CONTRACT.md flags at the end):
 *
 *  - `POST /recommendations/meals` is validated by `mealRecommendationRequestSchema`,
 *    which requires **both** `mealType` and `localDate`. The wave-1 request DTO
 *    carries only an optional `mealType`, so every call 400s. Sending the date
 *    also matters for correctness: without it the server would key the
 *    suggestion to its own local day, so a late-evening request could be
 *    budgeted against tomorrow.
 *  - `POST /recommendations/:id/log` replies `{mealLog, recommendation}`, not
 *    the `{log}` envelope of `POST /meal-logs`. The wave-1 declaration
 *    (`MealLogEnvelopeDto`) cannot decode it.
 */
interface SuggestionsApi {

    @POST("recommendations/meals")
    suspend fun suggestMeal(@Body body: SuggestMealRequest): SuggestionEnvelopeDto

    /**
     * Log a suggestion as a meal. Online-only and never automatic: the confirm
     * gate is the user pressing the button (product invariant 1).
     */
    @POST("recommendations/{id}/log")
    suspend fun logSuggestion(
        @Path("id") id: String,
        @Body body: LogSuggestionRequest,
    ): LoggedSuggestionDto

    @POST("recommendations/{id}/feedback")
    suspend fun feedback(
        @Path("id") id: String,
        @Body body: RecommendationFeedbackRequest,
    ): SuggestionEnvelopeDto
}

/** Body of `POST /recommendations/meals` — both fields required server-side. */
@Serializable
data class SuggestMealRequest(
    val mealType: MealType,
    val localDate: String,
)

/**
 * `{recommendation, remaining}`. `remaining` is the budget the server computed
 * in code; it is decoded so the plan surface can state it rather than guess.
 */
@Serializable
data class SuggestionEnvelopeDto(
    val recommendation: MealRecommendationDto,
    val remaining: RemainingBudgetDto? = null,
)

/** Remaining daily budget alongside a suggestion. */
@Serializable
data class RemainingBudgetDto(
    val kcal: Double = 0.0,
    val proteinG: Double = 0.0,
    val carbsG: Double = 0.0,
    val fatG: Double = 0.0,
)

/** Body of `POST /recommendations/:id/log` — the day the meal belongs to. */
@Serializable
data class LogSuggestionRequest(
    val localDate: String,
)

/** `{mealLog, recommendation}` — the created log plus the updated suggestion. */
@Serializable
data class LoggedSuggestionDto(
    val mealLog: MealLogDto,
    val recommendation: MealRecommendationDto? = null,
)
