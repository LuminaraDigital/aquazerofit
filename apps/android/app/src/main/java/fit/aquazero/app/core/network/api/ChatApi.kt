package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.ChatMealDraftDto
import fit.aquazero.app.core.model.ChatMessagesDto
import fit.aquazero.app.core.model.ChatSessionCreatedDto
import fit.aquazero.app.core.model.ChatSessionsDto
import fit.aquazero.app.core.model.MealType
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Body for `POST /chat/meal-drafts` — "log this as a meal", never inferred.
 *
 * [localDate] must be sent, otherwise the server keys the draft to its own
 * local day rather than the user's.
 */
@Serializable
data class CreateMealDraftRequest(
    val text: String,
    val mealType: MealType? = null,
    val sessionId: String? = null,
    val localDate: String? = null,
)

/**
 * One picked item in a draft confirmation.
 *
 * [foodId] is non-null: the server requires a resolved food for every confirmed
 * line, so an item the user has not resolved must be omitted rather than sent
 * with a null id.
 */
@Serializable
data class MealDraftSelection(
    val itemId: String,
    val foodId: String,
    val grams: Double? = null,
)

/**
 * Body for `POST /chat/meal-drafts/:id/confirm` — per-item opt-in.
 *
 * The wire name is `items`; [selections] keeps the clearer name on this side.
 * [localDate] must be sent, otherwise the server keys the meal to its own
 * local day rather than the user's.
 */
@Serializable
data class ConfirmMealDraftRequest(
    @SerialName("items") val selections: List<MealDraftSelection>,
    val mealType: MealType? = null,
    val localDate: String? = null,
    /** Explicit allergen acknowledgement when conflicts were surfaced. */
    val acknowledgeAllergens: Boolean? = null,
)

/** Envelope `{draft}` returned by the meal-draft routes. */
@Serializable
data class MealDraftEnvelopeDto(
    val draft: ChatMealDraftDto,
)

/** Envelope `{drafts}` returned by `GET /chat/meal-drafts`. */
@Serializable
data class MealDraftsDto(
    val drafts: List<ChatMealDraftDto> = emptyList(),
)

/**
 * `/chat/…` — sessions, history, drafts, report. The streaming turn itself
 * goes through [fit.aquazero.app.core.network.ChatStreamClient] (SSE).
 */
interface ChatApi {

    @POST("chat/sessions")
    suspend fun createSession(): ChatSessionCreatedDto

    @GET("chat/sessions")
    suspend fun sessions(): ChatSessionsDto

    @GET("chat/sessions/{id}/messages")
    suspend fun messages(@Path("id") sessionId: String): ChatMessagesDto

    @DELETE("chat/sessions/{id}")
    suspend fun deleteSession(@Path("id") sessionId: String)

    /** Play AI-GC compliance: user-initiated report of an assistant message. */
    @POST("chat/messages/{id}/report")
    suspend fun reportMessage(@Path("id") messageId: String)

    // ----- meal drafts -----

    @POST("chat/meal-drafts")
    suspend fun createMealDraft(@Body body: CreateMealDraftRequest): MealDraftEnvelopeDto

    @GET("chat/meal-drafts")
    suspend fun mealDrafts(): MealDraftsDto

    @GET("chat/meal-drafts/{id}")
    suspend fun mealDraft(@Path("id") id: String): MealDraftEnvelopeDto

    @POST("chat/meal-drafts/{id}/dismiss")
    suspend fun dismissMealDraft(@Path("id") id: String): MealDraftEnvelopeDto

    @POST("chat/meal-drafts/{id}/confirm")
    suspend fun confirmMealDraft(
        @Path("id") id: String,
        @Body body: ConfirmMealDraftRequest,
    ): MealDraftEnvelopeDto
}
