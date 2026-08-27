package fit.aquazero.app.core.auth

import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.network.RefreshOutcome
import fit.aquazero.app.core.network.api.AuthApi
import fit.aquazero.app.core.model.LoginRequest
import fit.aquazero.app.core.model.LogoutRequest
import fit.aquazero.app.core.model.PublicUserDto
import fit.aquazero.app.core.model.RegisterRequest
import fit.aquazero.app.core.network.safeCall
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Session state consumed by the navigation shell. */
sealed interface AuthState {
    /** Restore has not completed yet — show the splash/hold state. */
    data object Unknown : AuthState

    /** No valid session — route to the pre-auth flow. */
    data object SignedOut : AuthState

    /** Valid session. [user] is present after login/register, may be null after a silent restore. */
    data class SignedIn(val user: PublicUserDto?) : AuthState
}

/**
 * Owns the auth lifecycle: silent restore on app start, login/register/logout,
 * and reaction to forced logout (token-family revocation).
 */
@Singleton
class SessionManager @Inject constructor(
    @Named("authless") private val authApi: AuthApi,
    private val tokenStore: AuthTokenStore,
    private val vault: RefreshTokenVault,
    private val refreshCoordinator: RefreshCoordinator,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _authState = MutableStateFlow<AuthState>(AuthState.Unknown)

    /** Current auth state; the nav shell keys its root graph off this. */
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    init {
        scope.launch {
            refreshCoordinator.events.collect { event ->
                if (event is AuthEvent.ForcedLogout) forceLogout()
            }
        }
    }

    /**
     * Silent restore: vault → `POST /auth/refresh` (body transport) → tokens.
     * Transient failures keep the vaulted token and still enter [AuthState.SignedIn]
     * (offline-first: cached data is usable; API calls will retry auth).
     */
    suspend fun restore() {
        if (_authState.value !is AuthState.Unknown) return
        val hasVaultedToken = vault.read() != null
        if (!hasVaultedToken) {
            _authState.value = AuthState.SignedOut
            return
        }
        when (refreshCoordinator.refresh(staleAccessToken = null)) {
            is RefreshOutcome.Rotated -> _authState.value = AuthState.SignedIn(user = null)
            is RefreshOutcome.InvalidGrant -> _authState.value = AuthState.SignedOut
            is RefreshOutcome.Transient -> _authState.value = AuthState.SignedIn(user = null)
        }
    }

    /** Email/password login. On success the session is installed atomically. */
    suspend fun login(email: String, password: String): ApiResult<PublicUserDto> =
        installSession { authApi.login(LoginRequest(email = email, password = password)) }

    /** Registration; the server signs the new account straight in. */
    suspend fun register(
        email: String,
        password: String,
        displayName: String?,
    ): ApiResult<PublicUserDto> = installSession {
        authApi.register(
            RegisterRequest(email = email, password = password, displayName = displayName),
        )
    }

    /**
     * User-initiated logout. Best-effort server revocation; local state is
     * cleared regardless. Callers must drain/confirm the outbox BEFORE calling
     * this (plan §4.2 logout policy).
     */
    suspend fun logout() {
        val refreshToken = vault.read()
        runCatching { authApi.logout(LogoutRequest(refreshToken = refreshToken)) }
        clearSession()
    }

    /** Security-event logout (token family revoked). Keeps outbox rows; see plan §4.2. */
    fun forceLogout() {
        tokenStore.clear()
        _authState.value = AuthState.SignedOut
    }

    private suspend fun installSession(
        block: suspend () -> fit.aquazero.app.core.model.AuthResponseDto,
    ): ApiResult<PublicUserDto> {
        val result = safeCall(block)
        return when (result) {
            is ApiResult.Success -> {
                vault.store(result.data.refreshToken)
                tokenStore.set(result.data.accessToken)
                _authState.value = AuthState.SignedIn(result.data.user)
                ApiResult.Success(result.data.user)
            }
            is ApiResult.Failure -> result
        }
    }

    private suspend fun clearSession() {
        tokenStore.clear()
        vault.clear()
        _authState.value = AuthState.SignedOut
    }
}
