package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.ConsentUpdateRequest
import fit.aquazero.app.core.model.DerivedTargetsDto
import fit.aquazero.app.core.model.EntitlementsDto
import fit.aquazero.app.core.model.ProfileInputDto
import fit.aquazero.app.core.model.WellnessProfileDto
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.PUT

/** Response of `PUT /me/profile` - `{profile, targets}`. */
@Serializable
data class ProfileSavedDto(
    val profile: WellnessProfileDto,
    val targets: DerivedTargetsDto? = null,
)

/** Body for `PATCH /me` (display name, timezone). */
@Serializable
data class UpdateMeRequest(
    val displayName: String? = null,
    val timezone: String? = null,
)

/*
 * The `/me` routes wrap every payload in a single-key envelope. Declaring the
 * inner type directly compiles fine and then throws at runtime on the first
 * call. The envelopes live in AccountEnvelopes.kt in this package and are
 * shared with AccountApi.
 */

/** `/me/...` - account, profile, targets, consents, entitlements, deletion. */
interface MeApi {

    @GET("me")
    suspend fun me(): UserEnvelopeDto

    @PATCH("me")
    suspend fun updateMe(@Body body: UpdateMeRequest): UserEnvelopeDto

    /** Two-step account deletion (30-day grace). */
    @DELETE("me")
    suspend fun requestDeletion()

    @GET("me/profile")
    suspend fun profile(): ProfileEnvelopeDto

    @PUT("me/profile")
    suspend fun saveProfile(@Body body: ProfileInputDto): ProfileSavedDto

    @GET("me/targets")
    suspend fun targets(): TargetsEnvelopeDto

    @GET("me/consents")
    suspend fun consents(): ConsentsEnvelopeDto

    @PUT("me/consents")
    suspend fun saveConsents(@Body body: ConsentUpdateRequest): ConsentsEnvelopeDto

    @GET("me/entitlements")
    suspend fun entitlements(): EntitlementsDto
}
