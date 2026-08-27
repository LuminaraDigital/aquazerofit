package fit.aquazero.app.core.network.api

import okhttp3.ResponseBody
import retrofit2.http.GET
import retrofit2.http.Query
import retrofit2.http.Streaming

/** `/export/…` — diary export as raw JSON/CSV for the system share sheet. */
interface ExportApi {

    @Streaming
    @GET("export/diary")
    suspend fun diary(
        @Query("format") format: String = "json",
        @Query("startDate") startDate: String? = null,
        @Query("endDate") endDate: String? = null,
    ): ResponseBody
}
