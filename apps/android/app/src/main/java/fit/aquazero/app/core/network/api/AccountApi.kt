package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.AddMemoryFactRequest
import fit.aquazero.app.core.model.ConsentUpdateRequest
import fit.aquazero.app.core.model.EntitlementsDto
import fit.aquazero.app.core.model.MemoryEnvelopeDto
import fit.aquazero.app.core.model.ProfileInputDto
import fit.aquazero.app.core.model.UpdateMemoryFactRequest
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Streaming

/**
 * `/me/…` as the server actually replies.
 *
 * This exists alongside [MeApi] rather than replacing it because the wave-1
 * [MeApi] declares flat bodies for five routes that the server wraps
 * (`apps/api/src/modules/me/router.ts`): `GET /me` and `PATCH /me` reply
 * `{user}`, `GET /me/profile` replies `{profile}` (nullable), `GET /me/targets`
 * replies `{targets}`, and both `GET` and `PUT /me/consents` reply
 * `{consents}`.
 *
 * A flat DTO cannot decode a wrapped body — the failure is a runtime
 * `SerializationException`, which `safeCall` does not catch. The settings and
 * setup lanes cannot work through the broken declarations, so they go through
 * this interface instead. `PUT /me/profile` and `GET /me/entitlements` are the
 * two shapes wave 1 got right and are re-declared here only so one lane has one
 * entry point. MeApi and ProfileRepository still need the same correction
 * applied at their source.
 *
 * Coach memory is mounted inside the same router (under `/me/memory`) and had
 * no Kotlin service at all; it lives here for the same reason.
 */
interface AccountApi {

    // ----- identity -----

    @GET("me")
    suspend fun me(): UserEnvelopeDto

    @PATCH("me")
    suspend fun updateMe(@Body body: UpdateIdentityRequest): UserEnvelopeDto

    /**
     * Two-step deletion. The first call flags the account and starts the grace
     * period; a second call while flagged purges immediately
     * (`me/service.ts:requestDeletion`).
     */
    @DELETE("me")
    suspend fun requestDeletion(): DeletionStatusDto

    // ----- profile + targets -----

    @GET("me/profile")
    suspend fun profile(): ProfileEnvelopeDto

    @PUT("me/profile")
    suspend fun saveProfile(@Body body: ProfileInputDto): ProfileAndTargetsDto

    @GET("me/targets")
    suspend fun targets(): TargetsEnvelopeDto

    // ----- consents -----

    @GET("me/consents")
    suspend fun consents(): ConsentsEnvelopeDto

    @PUT("me/consents")
    suspend fun saveConsents(@Body body: ConsentUpdateRequest): ConsentsEnvelopeDto

    // ----- entitlements + export -----

    /** Flat body — this route genuinely does not wrap. */
    @GET("me/entitlements")
    suspend fun entitlements(): EntitlementsDto

    /** Full account bundle for the share sheet. */
    @Streaming
    @GET("me/export")
    suspend fun export(): ResponseBody

    // ----- coach memory (all routes 403 CONSENT_REQUIRED without aiPersonalisation) -----

    @GET("me/memory")
    suspend fun memory(): MemoryEnvelopeDto

    @POST("me/memory/facts")
    suspend fun addFact(@Body body: AddMemoryFactRequest): MemoryEnvelopeDto

    @PATCH("me/memory/facts/{factId}")
    suspend fun updateFact(
        @Path("factId") factId: String,
        @Body body: UpdateMemoryFactRequest,
    ): MemoryEnvelopeDto

    @DELETE("me/memory/facts/{factId}")
    suspend fun deleteFact(@Path("factId") factId: String): MemoryEnvelopeDto

    /** Wipe — replies `204 No Content`, so the return type must be `Unit`. */
    @DELETE("me/memory")
    suspend fun clearMemory()
}
