package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.VisionConfirmResponseDto
import fit.aquazero.app.core.model.VisionJobEnvelopeDto
import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.GET
import retrofit2.http.Part
import retrofit2.http.Path
import kotlinx.serialization.Serializable

/** Body for `POST /meal-photos/:jobId/confirm` — the user-edited item list. */
@Serializable
data class VisionConfirmRequest(
    val items: List<fit.aquazero.app.core.model.MealLogItemDto>,
    val mealType: fit.aquazero.app.core.model.MealType? = null,
    val localDate: String? = null,
)

/** `/meal-photos/…` — photo upload, job polling, confirm gate. Online-only. */
interface VisionApi {

    /** Upload a meal photo (≤10MB JPEG/PNG/HEIC) with its meal type. */
    @Multipart
    @POST("meal-photos")
    suspend fun upload(
        @Part photo: MultipartBody.Part,
        @Part mealType: MultipartBody.Part,
    ): VisionJobEnvelopeDto

    /** Poll job status (1s cadence while queued/processing). */
    @GET("meal-photos/{jobId}")
    suspend fun job(@Path("jobId") jobId: String): VisionJobEnvelopeDto

    /**
     * Confirm the (edited) predictions into a MealLog. A replayed confirm
     * returns CONFLICT; reconcile by matching the day's meal logs on
     * `visionJobId` until backend delta 10 lands.
     */
    @POST("meal-photos/{jobId}/confirm")
    suspend fun confirm(
        @Path("jobId") jobId: String,
        @Body body: VisionConfirmRequest,
    ): VisionConfirmResponseDto
}
