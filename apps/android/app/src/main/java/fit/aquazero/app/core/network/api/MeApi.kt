package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.network.dto.ConsentStateDto
import fit.aquazero.app.core.network.dto.ConsentUpdateRequest
import fit.aquazero.app.core.network.dto.DerivedTargetsDto
import fit.aquazero.app.core.network.dto.EntitlementsDto
import fit.aquazero.app.core.network.dto.ProfileInputDto
import fit.aquazero.app.core.network.dto.PublicUserDto
import fit.aquazero.app.core.network.dto.WellnessProfileDto
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

/** `/me/...` - account, profile, targets, consents, entitlements, deletion. */
interface MeApi {

    @GET("me")
    suspend fun me(): PublicUserDto

    @PATCH("me")
    suspend fun updateMe(@Body body: UpdateMeRequest): PublicUserDto

    /** Two-step account deletion (30-day grace). */
    @DELETE("me")
    suspend fun requestDeletion()

    @GET("me/profile")
    suspend fun profile(): WellnessProfileDto

    @PUT("me/profile")
    suspend fun saveProfile(@Body body: ProfileInputDto): ProfileSavedDto

    @GET("me/targets")
    suspend fun targets(): DerivedTargetsDto

    @GET("me/consents")
    suspend fun consents(): ConsentStateDto

    @PUT("me/consents")
    suspend fun saveConsents(@Body body: ConsentUpdateRequest): ConsentStateDto

    @GET("me/entitlements")
    suspend fun entitlements(): EntitlementsDto
}
