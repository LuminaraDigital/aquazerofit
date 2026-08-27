package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.ConsentStateDto
import fit.aquazero.app.core.model.DerivedTargetsDto
import fit.aquazero.app.core.model.PublicUserDto
import fit.aquazero.app.core.model.WellnessProfileDto
import kotlinx.serialization.Serializable

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

/** `{user}` — `GET /me`, `PATCH /me`. */
@Serializable
data class UserEnvelopeDto(val user: PublicUserDto)

/** Body of `PATCH /me` (shared `updateIdentitySchema`). */
@Serializable
data class UpdateIdentityRequest(
    val displayName: String? = null,
    val timezone: String? = null,
)

/**
 * `{profile}` — `GET /me/profile`. The profile is null until the essentials
 * form has been submitted, which is the first-run state, not an error.
 */
@Serializable
data class ProfileEnvelopeDto(val profile: WellnessProfileDto? = null)

/** `{profile, targets}` — `PUT /me/profile`. */
@Serializable
data class ProfileAndTargetsDto(
    val profile: WellnessProfileDto,
    val targets: DerivedTargetsDto? = null,
)

/** `{targets}` — `GET /me/targets` (404s when no profile exists yet). */
@Serializable
data class TargetsEnvelopeDto(val targets: DerivedTargetsDto)

/** `{consents}` — `GET`/`PUT /me/consents`. */
@Serializable
data class ConsentsEnvelopeDto(val consents: ConsentStateDto)

/**
 * `DELETE /me`. [purged] false means the grace period just started; true means
 * this was the second call and the account is gone.
 */
@Serializable
data class DeletionStatusDto(
    val purged: Boolean = false,
    val deletionRequestedAt: String? = null,
    val message: String = "",
)
