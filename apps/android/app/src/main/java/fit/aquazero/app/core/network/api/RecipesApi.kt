package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.RecipeEnvelopeDto
import fit.aquazero.app.core.model.RecipesDto
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/** `/recipes/…` — recipe search and detail. */
interface RecipesApi {

    @GET("recipes")
    suspend fun recipes(
        @Query("search") search: String? = null,
        @Query("tag") tag: String? = null,
        @Query("limit") limit: Int = 50,
    ): RecipesDto

    @GET("recipes/{id}")
    suspend fun recipe(@Path("id") id: String): RecipeEnvelopeDto
}
