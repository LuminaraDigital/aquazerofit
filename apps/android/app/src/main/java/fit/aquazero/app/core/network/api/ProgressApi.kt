package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.network.dto.ProgressInsightDto
import fit.aquazero.app.core.network.dto.ProgressSummaryDto
import retrofit2.http.GET
import retrofit2.http.Query

/** `/progress/…` — summary (unwrapped) and the weekly insight. */
interface ProgressApi {

    @GET("progress/summary")
    suspend fun summary(): ProgressSummaryDto

    @GET("progress/insight")
    suspend fun insight(@Query("periodDays") periodDays: Int? = null): ProgressInsightDto
}
