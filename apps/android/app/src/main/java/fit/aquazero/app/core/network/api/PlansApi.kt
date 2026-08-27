package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.network.dto.PlanEnvelopeDto
import fit.aquazero.app.core.network.dto.ReadinessEnvelopeDto
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/** Body for `POST /plans/generate`. */
@Serializable
data class GeneratePlanRequest(
    val daysPerWeek: Int? = null,
    val focus: String? = null,
    val notes: String? = null,
)

/** `/plans/…` — current plan, readiness, generation (online-only AI lane). */
interface PlansApi {

    @GET("plans/current")
    suspend fun current(): PlanEnvelopeDto

    @GET("plans/readiness")
    suspend fun readiness(): ReadinessEnvelopeDto

    @POST("plans/generate")
    suspend fun generate(@Body body: GeneratePlanRequest): PlanEnvelopeDto
}
