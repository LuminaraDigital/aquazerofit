package fit.aquazero.app.core.data

import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.RecommendationFeedbackRequest
import fit.aquazero.app.core.model.map
import fit.aquazero.app.core.network.api.LogSuggestionRequest
import fit.aquazero.app.core.network.api.SuggestMealRequest
import fit.aquazero.app.core.network.api.SuggestionsApi
import fit.aquazero.app.core.network.safeCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * AI meal suggestions (`/recommendations/…`) — the data behind the meal plan.
 *
 * Online-only (plan §4.2). The server is tolerant by design: with
 * `aiPersonalisation` off it answers with a deterministic pick and
 * `ai.provider = "deterministic"`, so a suggestion arriving with no model
 * behind it is a normal result, not a degraded one to apologise for. The
 * screen reads [MealRecommendationDto.ai] to say which it got.
 */
@Singleton
class MealSuggestionRepository @Inject constructor(
    private val suggestionsApi: SuggestionsApi,
) {

    /**
     * Ask for one meal. `localDate` is always sent explicitly: omitted, the
     * server keys the suggestion to *its* local day, so a late-evening request
     * could be budgeted against the wrong date.
     */
    suspend fun suggest(
        mealType: MealType,
        localDate: String = LocalDates.today(),
    ): ApiResult<MealSuggestion> =
        safeCall {
            suggestionsApi.suggestMeal(SuggestMealRequest(mealType = mealType, localDate = localDate))
        }.map { envelope ->
            MealSuggestion(
                recommendation = envelope.recommendation,
                remainingKcal = envelope.remaining?.kcal,
                remainingProteinG = envelope.remaining?.proteinG,
            )
        }

    /**
     * Log a suggestion as a meal. Server-side create, not an outbox write: the
     * server owns the link between the suggestion and the log it produced, and
     * a duplicate would be created by a blind replay. Called only from an
     * explicit user action (product invariant 1).
     */
    suspend fun logSuggestion(
        recommendationId: String,
        localDate: String = LocalDates.today(),
    ): ApiResult<MealLogDto> =
        safeCall {
            suggestionsApi.logSuggestion(recommendationId, LogSuggestionRequest(localDate))
        }.map { it.mealLog }

    /** Send an up/down signal into the evaluation loop. */
    suspend fun sendFeedback(
        recommendationId: String,
        feedback: SuggestionFeedback,
    ): ApiResult<MealRecommendationDto> =
        safeCall {
            suggestionsApi.feedback(
                recommendationId,
                RecommendationFeedbackRequest(feedback = feedback.wire),
            )
        }.map { it.recommendation }
}

/** A suggestion plus the remaining budget the server computed for the day. */
data class MealSuggestion(
    val recommendation: MealRecommendationDto,
    val remainingKcal: Double?,
    val remainingProteinG: Double?,
)

/** The only two feedback values `recommendationFeedbackSchema` accepts. */
enum class SuggestionFeedback(val wire: String) {
    UP("up"),
    DOWN("down"),
}
