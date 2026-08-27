package fit.aquazero.app.core.data

import fit.aquazero.app.core.auth.AuthState
import fit.aquazero.app.core.auth.SessionManager
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.network.api.AuthApi
import fit.aquazero.app.core.model.PasswordResetRequest
import fit.aquazero.app.core.model.PublicUserDto
import fit.aquazero.app.core.network.safeCall
import fit.aquazero.app.core.sync.OutboxRepository
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * Feature-facing auth surface. Screens talk to this; [SessionManager] owns
 * the token machinery underneath.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val sessionManager: SessionManager,
    @Named("authless") private val authApi: AuthApi,
    private val outboxRepository: OutboxRepository,
) {

    /** Auth state for the navigation shell. */
    val authState: StateFlow<AuthState> = sessionManager.authState

    /** Unsynced-op count — the logout flow blocks on this (plan §4.2). */
    val pendingOutboxCount: Flow<Int> = outboxRepository.pendingCount

    /** Silent session restore; call once at app start. */
    suspend fun restore() = sessionManager.restore()

    suspend fun login(email: String, password: String): ApiResult<PublicUserDto> =
        sessionManager.login(email, password)

    suspend fun register(
        email: String,
        password: String,
        displayName: String?,
    ): ApiResult<PublicUserDto> = sessionManager.register(email, password, displayName)

    /**
     * User-initiated logout. Callers must have drained (or the user must have
     * explicitly abandoned) the outbox first.
     */
    suspend fun logout() = sessionManager.logout()

    suspend fun requestPasswordReset(email: String): ApiResult<Unit> =
        safeCall { authApi.requestPasswordReset(PasswordResetRequest(email = email)) }
}
