package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.UserTier
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

/** Body for `POST /billing/play/verify` — the token Play handed the client. */
@Serializable
data class PlayVerifyRequest(
    val purchaseToken: String,
    val productId: String,
)

/**
 * Reply of `POST /billing/play/verify`.
 *
 * This is the server saying what it decided, not the client being told what to
 * believe: the app never writes a tier from this body. The one caller
 * ([fit.aquazero.app.core.data.BillingRepository]) treats a 200 purely as
 * permission to acknowledge the purchase with Google, and the tier the UI shows
 * comes from a fresh `GET /me/entitlements` afterwards. Anything else would put
 * the entitlement decision on the device, where the user owns both ends of it.
 *
 * [premiumUntil] is decoded so a contract mismatch is not silently tolerated,
 * and deliberately not stored — a cached expiry is a claim that keeps being
 * true on the device after it has stopped being true on the server.
 */
@Serializable
data class PlayVerificationDto(
    /** Least-entitled default, matching [fit.aquazero.app.core.model.EntitlementsDto]. */
    val tier: UserTier = UserTier.FREE,
    val premiumUntil: String? = null,
)

/**
 * `/billing/…` — Google Play purchase verification.
 *
 * Errors this route raises, and what each means to the caller
 * (`apps/api` billing router): `400 VALIDATION_FAILED` — the token or product
 * id was malformed; `402 PURCHASE_INVALID` — Google itself rejected the token,
 * so there is nothing to grant and nothing to acknowledge; `503
 * BILLING_UNAVAILABLE` — the server has no Play credentials configured, which
 * is an outage rather than a verdict on the purchase and must be retried.
 */
interface BillingApi {

    @POST("billing/play/verify")
    suspend fun verifyPlayPurchase(@Body body: PlayVerifyRequest): PlayVerificationDto
}
