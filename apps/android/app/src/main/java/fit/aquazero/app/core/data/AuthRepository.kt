package fit.aquazero.app.core.data

import fit.aquazero.app.core.auth.AuthState
import fit.aquazero.app.core.auth.CaptchaGate
import fit.aquazero.app.core.auth.SessionManager
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.CaptchaRequirement
import fit.aquazero.app.core.model.PasswordResetRequest
import fit.aquazero.app.core.model.PublicUserDto
import fit.aquazero.app.core.network.api.AuthApi
import fit.aquazero.app.core.network.safeCall
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/**
 * Feature-facing auth surface. Screens talk to this; [SessionManager] owns
 * the token machinery underneath.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val sessionManager: SessionManager,
    @param:Named("authless") private val authApi: AuthApi,
    private val outboxRepository: OutboxRepository,
    private val captchaGate: CaptchaGate,
) {

    /** Auth state for the navigation shell. */
    val authState: StateFlow<AuthState> = sessionManager.authState

    /** Unsynced-op count — the logout flow blocks on this (plan §4.2). */
    val pendingOutboxCount: Flow<Int> = outboxRepository.pendingCount

    /** Silent session restore; call once at app start. */
    suspend fun restore() = sessionManager.restore()

    suspend fun login(email: String, password: String): ApiResult<PublicUserDto> =
        sessionManager.login(email, password)

    /**
     * Does this client have to solve a challenge before a bot-gated write?
     *
     * Asked before `register` and before `requestPasswordReset`, and answered
     * by the server rather than by a build flag — see [CaptchaGate].
     */
    suspend fun captchaRequirement(): CaptchaRequirement = captchaGate.requirement()

    suspend fun register(
        email: String,
        password: String,
        displayName: String?,
        captchaToken: String? = null,
    ): ApiResult<PublicUserDto> =
        sessionManager.register(email, password, displayName, captchaToken)

    /**
     * User-initiated logout. Callers must have drained (or the user must have
     * explicitly abandoned) the outbox first.
     */
    suspend fun logout() = sessionManager.logout()

    /**
     * Request a reset mail.
     *
     * `POST /auth/password-reset/request` sits behind the same `assertHuman`
     * gate as registration, so [captchaToken] is required whenever
     * [captchaRequirement] answers [CaptchaRequirement.Required] — a caller
     * that skips the challenge gets `VALIDATION_FAILED`, not a mail.
     *
     * No Android screen calls this yet: the app has no forgot-password entry
     * point, only this data-layer method. The parameter is here so the screen
     * that adds one cannot forget the token, not because something already
     * passes it.
     */
    suspend fun requestPasswordReset(
        email: String,
        captchaToken: String? = null,
    ): ApiResult<Unit> = safeCall {
        authApi.requestPasswordReset(
            PasswordResetRequest(email = email, captchaToken = captchaToken),
        )
    }
}
