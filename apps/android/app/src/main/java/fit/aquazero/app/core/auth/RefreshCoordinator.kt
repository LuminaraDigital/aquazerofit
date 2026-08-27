package fit.aquazero.app.core.auth

import fit.aquazero.app.core.model.RefreshRequest
import fit.aquazero.app.core.network.RefreshOutcome
import fit.aquazero.app.core.network.TokenRefresher
import fit.aquazero.app.core.network.api.AuthApi
import java.io.IOException
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.HttpException

/** One-shot auth signals; the shell reacts to [ForcedLogout]. */
sealed interface AuthEvent {
    /** Token family revoked or refresh rejected — the user must sign in again. */
    data object ForcedLogout : AuthEvent
}

/**
 * Single-flight refresh: one rotation at a time, guarded by a [Mutex].
 * Both the OkHttp [fit.aquazero.app.core.network.TokenAuthenticator] and
 * [SessionManager.restore] funnel through here, so a burst of concurrent 401s
 * costs exactly one `POST /auth/refresh`.
 *
 * Rotation is atomic from the caller's view: the vault is written before the
 * in-memory access token is swapped, so a crash between the two leaves a
 * usable (newer) refresh token.
 */
@Singleton
class RefreshCoordinator @Inject constructor(
    @Named("authless") private val authApi: AuthApi,
    private val tokenStore: AuthTokenStore,
    private val vault: RefreshTokenVault,
) : TokenRefresher {
    private val mutex = Mutex()

    private val _events = MutableSharedFlow<AuthEvent>(extraBufferCapacity = 4)

    /** Auth lifecycle events (forced logout). */
    val events: SharedFlow<AuthEvent> = _events.asSharedFlow()

    /**
     * Refresh the token pair. [staleAccessToken] is the token the caller just
     * failed with; if another caller already rotated past it, the fresh token
     * is returned without a network call.
     */
    override suspend fun refresh(staleAccessToken: String?): RefreshOutcome = mutex.withLock {
        val current = tokenStore.current()
        if (current != null && current != staleAccessToken) {
            // Another caller rotated while we waited on the lock.
            return@withLock RefreshOutcome.Rotated(current)
        }
        val refreshToken = vault.read() ?: return@withLock invalidGrant()
        try {
            val pair = authApi.refresh(RefreshRequest(refreshToken))
            vault.store(pair.refreshToken)
            tokenStore.set(pair.accessToken)
            RefreshOutcome.Rotated(pair.accessToken)
        } catch (e: HttpException) {
            if (e.code() == 401 || e.code() == 403) invalidGrant() else RefreshOutcome.Transient
        } catch (_: IOException) {
            RefreshOutcome.Transient
        }
    }

    private suspend fun invalidGrant(): RefreshOutcome {
        tokenStore.clear()
        vault.clear()
        _events.tryEmit(AuthEvent.ForcedLogout)
        return RefreshOutcome.InvalidGrant
    }
}
