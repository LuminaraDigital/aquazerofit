package fit.aquazero.app.core.network

/**
 * What the HTTP layer needs from the auth layer, expressed as interfaces the
 * HTTP layer owns.
 *
 * [HeaderInterceptor] needs a token to attach and [TokenAuthenticator] needs
 * someone to rotate it on a 401 — but neither needs to know how tokens are
 * stored, encrypted or refreshed. Declaring those two capabilities here, and
 * letting `core.auth` implement them, keeps the dependency running one way:
 * auth depends on network, never the reverse.
 *
 * Without this the two would import each other, which reads as harmless while
 * everything is one module and becomes an unbuildable Gradle cycle the moment
 * it is not.
 */

/** Read-only access to the current bearer token. */
interface AccessTokenProvider {
    /** The access token to attach, or null when signed out. */
    fun current(): String?
}

/** Outcome of a refresh attempt. */
sealed interface RefreshOutcome {
    /** New pair installed; [accessToken] is ready to use. */
    data class Rotated(val accessToken: String) : RefreshOutcome

    /** The refresh token is dead (401/family revocation) — session is over. */
    data object InvalidGrant : RefreshOutcome

    /** Transient failure (network/5xx) — session state unknown, retry later. */
    data object Transient : RefreshOutcome
}

/**
 * Rotates the access token. Implementations must be single-flight: a burst of
 * concurrent 401s has to cost exactly one `POST /auth/refresh`.
 */
interface TokenRefresher {
    /**
     * Rotate, given the token the caller failed with. If another caller has
     * already rotated past [staleAccessToken], the fresh token is returned
     * without a network call.
     */
    suspend fun refresh(staleAccessToken: String?): RefreshOutcome
}
