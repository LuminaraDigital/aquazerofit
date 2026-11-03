package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.ChallengeEntity
import fit.aquazero.app.core.database.ChatDao
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.BuddyChallengeDto
import fit.aquazero.app.core.model.BuddyChallengeKind
import fit.aquazero.app.core.model.ChallengePeekDto
import fit.aquazero.app.core.model.CreateChallengeRequest
import fit.aquazero.app.core.model.JoinChallengeRequest
import fit.aquazero.app.core.model.map
import fit.aquazero.app.core.network.api.ChallengesApi
import fit.aquazero.app.core.network.safeCall
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Buddy huddles — private, invite-only accountability challenges.
 *
 * Create and join stay online-only; the cached roster supports offline list
 * reads so the screen can show the last known huddle state without network.
 */
@Singleton
class ChallengesRepository @Inject constructor(
    private val challengesApi: ChallengesApi,
    private val chatDao: ChatDao,
) {

    /** Cached huddles for offline display (server wins on refresh). */
    fun cachedChallenges(): Flow<List<BuddyChallengeDto>> =
        chatDao.challenges().map { entities ->
            entities.mapNotNull { entity ->
                runCatching {
                    AzfJson.decodeFromString(BuddyChallengeDto.serializer(), entity.docJson)
                }.getOrNull()
            }
        }

    /** Public peek for invite links before sign-in or join. */
    suspend fun peek(code: String): ApiResult<ChallengePeekDto> =
        safeCall { challengesApi.peek(normaliseCode(code)) }.map { it.challenge }

    /** Huddles this account belongs to, with progress recomputed server-side. */
    suspend fun challenges(): ApiResult<List<BuddyChallengeDto>> {
        val result = safeCall { challengesApi.challenges() }.map { it.challenges }
        if (result is ApiResult.Success) {
            cacheChallenges(result.data)
        }
        return result
    }

    /** Start a huddle. The server issues the `AQUA-XXXXXX` invite code. */
    suspend fun create(
        kind: BuddyChallengeKind,
        targetDays: Int = DEFAULT_TARGET_DAYS,
        durationDays: Int = DEFAULT_DURATION_DAYS,
    ): ApiResult<BuddyChallengeDto> =
        when (
            val result = safeCall {
                challengesApi.create(
                    CreateChallengeRequest(
                        kind = kind,
                        targetDays = targetDays,
                        durationDays = durationDays,
                    ),
                )
            }.map { it.challenge }
        ) {
            is ApiResult.Success -> {
                challenges()
                result
            }
            is ApiResult.Failure -> result
        }

    suspend fun join(code: String): ApiResult<BuddyChallengeDto> =
        when (
            val result = safeCall {
                challengesApi.join(JoinChallengeRequest(code = normaliseCode(code)))
            }.map { it.challenge }
        ) {
            is ApiResult.Success -> {
                challenges()
                result
            }
            is ApiResult.Failure -> result
        }

    private suspend fun cacheChallenges(challenges: List<BuddyChallengeDto>) {
        val now = System.currentTimeMillis()
        chatDao.upsertChallenges(
            challenges.map { challenge ->
                ChallengeEntity(
                    id = challenge.id,
                    code = challenge.code,
                    status = challenge.status.name.lowercase(),
                    docJson = AzfJson.encodeToString(BuddyChallengeDto.serializer(), challenge),
                    cachedAt = now,
                )
            },
        )
    }

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
