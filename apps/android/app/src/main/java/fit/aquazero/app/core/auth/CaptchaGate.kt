package fit.aquazero.app.core.auth

import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.CaptchaConfigDto
import fit.aquazero.app.core.model.CaptchaRequirement
import fit.aquazero.app.core.network.api.AuthApi
import fit.aquazero.app.core.network.safeCall
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/**
 * Turns `GET /auth/captcha` into "do I have to show a challenge?".
 *
 * The decision is the server's, not a build flag: the same APK has to run
 * challenged against production and unchallenged against a local stack that
 * has no Turnstile keys, and an operator has to be able to rotate or disable
 * the keys without a store release. Asking the server is what buys all three.
 *
 * A resolved answer is cached for the process lifetime. Bot protection is
 * configuration, not per-request state, and re-asking on every keystroke of a
 * signup form would add a round trip to the one screen where latency is most
 * visible. A failed lookup is deliberately NOT cached, so the user's retry is
 * a real retry.
 */
@Singleton
class CaptchaGate internal constructor(
    private val fetchConfig: suspend () -> ApiResult<CaptchaConfigDto>,
) {

    @Inject
    constructor(@Named("authless") authApi: AuthApi) : this(
        fetchConfig = { safeCall { authApi.captchaConfig() } },
    )

    private val mutex = Mutex()

    @Volatile
    private var resolved: CaptchaRequirement? = null

    /**
     * Resolve the requirement, hitting the network at most once per process
     * for a successful answer.
     *
     * The mutex collapses concurrent callers onto one request rather than
     * letting a double-tapped button issue two.
     */
    suspend fun requirement(): CaptchaRequirement {
        resolved?.let { return it }
        return mutex.withLock {
            resolved?.let { return@withLock it }
            requirementOf(fetchConfig()).also { outcome ->
                if (outcome !is CaptchaRequirement.Unavailable) resolved = outcome
            }
        }
    }

    internal companion object {

        /**
         * The whole decision, as a pure function of one API result.
         *
         * `enabled == true` with a blank site key is still [Required]. The key
         * is the challenge page's business, not this client's, and a server
         * that says it is enforcing is taken at its word — reading a missing
         * key as "no challenge needed" would be the client quietly deciding to
         * skip a gate.
         *
         * A 404 is the one failure read as [NotRequired]: a deployment with no
         * `/auth/captcha` route predates bot protection entirely, so it has no
         * `assertHuman` on register either, and treating it as unavailable
         * would brick registration against an older server for no gain. This
         * is not a hole — the server is the gate, and a client that guesses
         * "no challenge" against a server that wants one simply gets
         * `VALIDATION_FAILED` instead of a signup.
         */
        fun requirementOf(result: ApiResult<CaptchaConfigDto>): CaptchaRequirement =
            when (result) {
                is ApiResult.Success ->
                    if (result.data.enabled) CaptchaRequirement.Required else CaptchaRequirement.NotRequired
                is ApiResult.Failure.Api ->
                    if (result.httpStatus == HTTP_NOT_FOUND) {
                        CaptchaRequirement.NotRequired
                    } else {
                        CaptchaRequirement.Unavailable(result)
                    }
                is ApiResult.Failure -> CaptchaRequirement.Unavailable(result)
            }

        private const val HTTP_NOT_FOUND = 404
    }
}
