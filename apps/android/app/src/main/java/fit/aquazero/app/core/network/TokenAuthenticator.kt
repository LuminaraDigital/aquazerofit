package fit.aquazero.app.core.network

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/**
 * OkHttp 401 handler. Delegates to a [TokenRefresher] (single-flight via
 * Mutex, body-transport `POST /auth/refresh`, atomic rotation through the
 * vault) and retries the failed request exactly once with the new token.
 * A refresh rejection (family revocation) has already triggered forced
 * logout inside the coordinator; we simply give up here.
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    private val refreshCoordinator: TokenRefresher,
) : Authenticator {

    override fun authenticate(route: Route?, response: Response): Request? {
        val failedAuth = response.request.header("Authorization") ?: return null
        if (responseCount(response) >= 2) return null // one retry only

        val staleToken = failedAuth.removePrefix("Bearer ").ifBlank { null }
        val outcome = runBlocking { refreshCoordinator.refresh(staleToken) }
        return when (outcome) {
            is RefreshOutcome.Rotated ->
                response.request.newBuilder()
                    .header("Authorization", "Bearer ${outcome.accessToken}")
                    .build()
            is RefreshOutcome.InvalidGrant, is RefreshOutcome.Transient -> null
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
