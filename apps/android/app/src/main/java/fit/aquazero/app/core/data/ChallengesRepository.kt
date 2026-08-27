package fit.aquazero.app.core.data

import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.BuddyChallengeDto
import fit.aquazero.app.core.model.BuddyChallengeKind
import fit.aquazero.app.core.model.CreateChallengeRequest
import fit.aquazero.app.core.model.JoinChallengeRequest
import fit.aquazero.app.core.model.map
import fit.aquazero.app.core.network.api.ChallengesApi
import fit.aquazero.app.core.network.safeCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Buddy huddles — private, invite-only accountability challenges.
 *
 * Online-only by design (plan §4.2): create and join are low-frequency, and a
 * queued join against a code that may already be full would be worse than a
 * plain retry. Nothing is cached in Room, so the screen states its offline
 * position rather than showing a stale roster.
 */
@Singleton
class ChallengesRepository @Inject constructor(
    private val challengesApi: ChallengesApi,
) {

    /** Huddles this account belongs to, with progress recomputed server-side. */
    suspend fun challenges(): ApiResult<List<BuddyChallengeDto>> =
        safeCall { challengesApi.challenges() }.map { it.challenges }

    /** Start a huddle. The server issues the `AQUA-XXXXXX` invite code. */
    suspend fun create(
        kind: BuddyChallengeKind,
        targetDays: Int = DEFAULT_TARGET_DAYS,
        durationDays: Int = DEFAULT_DURATION_DAYS,
    ): ApiResult<BuddyChallengeDto> =
        safeCall {
            challengesApi.create(
                CreateChallengeRequest(
                    kind = kind,
                    targetDays = targetDays,
                    durationDays = durationDays,
                ),
            )
        }.map { it.challenge }

    /**
     * Join by code. The server normalises the code itself (trim, uppercase,
     * strip spaces) and answers `NOT_FOUND` for an unknown one,
     * `VALIDATION_FAILED` for an ended or full huddle.
     */
    suspend fun join(code: String): ApiResult<BuddyChallengeDto> =
        safeCall { challengesApi.join(JoinChallengeRequest(code = normaliseCode(code))) }
            .map { it.challenge }

    companion object {
        /** `BUDDY_CHALLENGE_MAX_MEMBERS` in `packages/shared/src/constants.ts`. */
        const val MAX_MEMBERS = 4

        /** `BUDDY_CHALLENGE_CODE_PREFIX`. */
        const val CODE_PREFIX = "AQUA"

        /** Server defaults for a new huddle (`createBuddyChallengeSchema`). */
        const val DEFAULT_TARGET_DAYS = 7
        const val DEFAULT_DURATION_DAYS = 14

        /** `joinBuddyChallengeSchema` accepts 4–24 characters after normalising. */
        const val MIN_CODE_LENGTH = 4
        const val MAX_CODE_LENGTH = 24

        /** Mirror of the server's `code` transform, so the UI can pre-validate. */
        fun normaliseCode(raw: String): String =
            raw.trim().uppercase().replace(WHITESPACE, "")

        /** True when the code could plausibly be accepted — a cheap pre-flight. */
        fun isPlausibleCode(raw: String): Boolean =
            normaliseCode(raw).length in MIN_CODE_LENGTH..MAX_CODE_LENGTH

        private val WHITESPACE = Regex("\\s+")
    }
}
