package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.MealLogEnvelopeDto
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealRecommendationRequest
import fit.aquazero.app.core.model.RecommendationFeedbackRequest
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Path

/** Envelope `{recommendation}`. */
@Serializable
data class RecommendationEnvelopeDto(
    val recommendation: MealRecommendationDto,
)

/** `/recommendations/…` — suggest-a-meal lane (online-only). */
interface RecommendationsApi {

    @POST("recommendations/meals")
    suspend fun suggestMeal(@Body body: MealRecommendationRequest): RecommendationEnvelopeDto

    /** Log a recommendation as a meal (confirm gate applies UI-side). */
    @POST("recommendations/{id}/log")
    suspend fun logRecommendation(@Path("id") id: String): MealLogEnvelopeDto

    @POST("recommendations/{id}/feedback")
    suspend fun feedback(
        @Path("id") id: String,
        @Body body: RecommendationFeedbackRequest,
    ): RecommendationEnvelopeDto
}
