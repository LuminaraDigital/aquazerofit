package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.network.dto.BarcodeLookupDto
import fit.aquazero.app.core.network.dto.FoodEnvelopeDto
import fit.aquazero.app.core.network.dto.FoodsSearchDto
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/** `/foods/…` — server-side search, barcode lookup, detail. */
interface FoodsApi {

    @GET("foods")
    suspend fun search(
        @Query("search") search: String,
        @Query("limit") limit: Int = 25,
    ): FoodsSearchDto

    /** EAN-8/EAN-13 lookup; local OFF mirror first, live OFF fallback. */
    @GET("foods/barcode/{code}")
    suspend fun barcode(@Path("code") code: String): BarcodeLookupDto

    @GET("foods/{id}")
    suspend fun food(@Path("id") id: String): FoodEnvelopeDto
}
