package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.PagedExercisesDto
import fit.aquazero.app.core.model.SetLogDto
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import fit.aquazero.app.core.model.WorkoutSessionEnvelopeDto
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** One exercise's actuals in a completion payload. */
@Serializable
data class CompletedExerciseInput(
    val exerciseId: String,
    val setsCompleted: Int,
    val skipped: Boolean = false,
    val weightKg: Double? = null,
    val rir: Double? = null,
    val setLogs: List<SetLogDto>? = null,
)

/** Body for `POST /workouts/:id/complete`. */
@Serializable
data class CompleteWorkoutRequest(
    val exercises: List<CompletedExerciseInput>,
    val durationMinutes: Int? = null,
    val localDate: String? = null,
)

/** Body for `POST /workouts/:id/swap-exercise`. */
@Serializable
data class SwapExerciseRequest(
    val exerciseId: String,
    val reason: String? = null,
)

/** `/workouts/…` — today's envelope, stats, session completion, swaps. */
interface WorkoutsApi {

    /** The `/workouts/today` envelope — typed once, derive views per consumer. */
    @GET("workouts/today")
    suspend fun today(): TodayWorkoutEnvelopeDto

    @GET("workouts/stats")
    suspend fun stats(@Query("weeks") weeks: Int = 4): JsonObject

    /** Paged library search (same envelope as `/exercises`). */
    @GET("workouts/exercises")
    suspend fun libraryExercises(
        @Query("limit") limit: Int,
        @Query("offset") offset: Int,
        @Query("search") search: String? = null,
        @Query("category") category: String? = null,
        @Query("muscle") muscle: String? = null,
        @Query("equipment") equipment: String? = null,
    ): PagedExercisesDto

    @POST("workouts/{id}/complete")
    suspend fun complete(
        @Path("id") sessionId: String,
        @Body body: CompleteWorkoutRequest,
    ): WorkoutSessionEnvelopeDto

    @POST("workouts/{id}/swap-exercise")
    suspend fun swapExercise(
        @Path("id") sessionId: String,
        @Body body: SwapExerciseRequest,
    ): TodayWorkoutEnvelopeDto
}
