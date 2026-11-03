package fit.aquazero.app.core.auth

import fit.aquazero.app.core.network.AccessTokenProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The access token lives in memory ONLY — never on disk, never in logs.
 * Process death simply forces a refresh via the vaulted refresh token.
 */
@Singleton
class AuthTokenStore @Inject constructor() : AccessTokenProvider {

    private val _accessToken = MutableStateFlow<String?>(null)

    /** Current access token, or null when signed out / not yet restored. */
    val accessToken: StateFlow<String?> = _accessToken.asStateFlow()

    /** Snapshot read for interceptors. */
    override fun current(): String? = _accessToken.value

    /** Replace the in-memory access token. */
    fun set(token: String?) {
        _accessToken.value = token
    }

    /** Drop the token (logout / forced logout). */
    fun clear() {
        _accessToken.value = null
    }
}
