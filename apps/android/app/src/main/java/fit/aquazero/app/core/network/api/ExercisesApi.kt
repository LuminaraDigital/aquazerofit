package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.ExerciseEnvelopeDto
import fit.aquazero.app.core.model.PagedExercisesDto
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * `/exercises/…`. ALWAYS pass at least `limit`/`offset`: the bare
 * `GET /exercises` returns a legacy plain array, not the
 * `{items,total,limit,offset}` envelope this interface is typed against.
 */
interface ExercisesApi {

    @GET("exercises")
    suspend fun exercises(
        @Query("limit") limit: Int,
        @Query("offset") offset: Int,
        @Query("search") search: String? = null,
        @Query("category") category: String? = null,
        @Query("muscle") muscle: String? = null,
        @Query("equipment") equipment: String? = null,
        @Query("respectProfile") respectProfile: Boolean? = null,
    ): PagedExercisesDto

    @GET("exercises/{id}")
    suspend fun exercise(@Path("id") id: String): ExerciseEnvelopeDto
}
