package fit.aquazero.app.feature.challenges

import fit.aquazero.app.core.database.ChallengeEntity
import fit.aquazero.app.core.database.ChatDao
import fit.aquazero.app.core.database.ChatMessageEntity
import fit.aquazero.app.core.database.ChatSessionEntity
import fit.aquazero.app.core.database.MemoryFactEntity
import fit.aquazero.app.core.model.BuddyChallengeDto
import fit.aquazero.app.core.model.BuddyChallengeKind
import fit.aquazero.app.core.model.ChallengeEnvelopeDto
import fit.aquazero.app.core.model.ChallengePeekEnvelopeDto
import fit.aquazero.app.core.model.ChallengesDto
import fit.aquazero.app.core.model.CreateChallengeRequest
import fit.aquazero.app.core.model.JoinChallengeRequest
import fit.aquazero.app.core.network.api.ChallengesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/**
 * Doubles for the huddle lane.
 *
 * [ChallengesRepository][fit.aquazero.app.core.data.ChallengesRepository] is
 * final and thin, so the tests drive the *real* repository over these — which
 * keeps its code normalisation, envelope unwrapping and write-through caching
 * inside the assertion's reach instead of stubbing them out.
 */

/** How a fake call should behave. */
sealed interface ChallengeOutcome {
    data object Ok : ChallengeOutcome

    /** An HTTP error carrying the API's `{code, message}` envelope. */
    data class Http(val status: Int, val code: String) : ChallengeOutcome

    /** No response at all — offline. */
    data object Offline : ChallengeOutcome
}

/** In-memory [ChallengesApi]. */
class FakeChallengesApi : ChallengesApi {

    /** Server-side huddle list, returned by [challenges]. */
    var roster: List<BuddyChallengeDto> = emptyList()

    var listOutcome: ChallengeOutcome = ChallengeOutcome.Ok
    var createOutcome: ChallengeOutcome = ChallengeOutcome.Ok
    var joinOutcome: ChallengeOutcome = ChallengeOutcome.Ok

    /** The code the server issues for the next [create]. */
    var issuedCode: String = "AQUA-ZZ9911"

    val createdKinds = mutableListOf<BuddyChallengeKind>()

    /** Exactly what reached the wire — the normalisation assertion reads this. */
    val joinedCodes = mutableListOf<String>()

    override suspend fun peek(code: String): ChallengePeekEnvelopeDto =
        throw UnsupportedOperationException("not used by these tests")

    override suspend fun challenges(): ChallengesDto {
        listOutcome.raise()
        return ChallengesDto(challenges = roster)
    }

    override suspend fun challenge(id: String): ChallengeEnvelopeDto =
        throw UnsupportedOperationException("not used by these tests")

    override suspend fun create(body: CreateChallengeRequest): ChallengeEnvelopeDto {
        createdKinds += body.kind
        createOutcome.raise()
        val created = challengeDto(id = "ch-${roster.size + 1}", code = issuedCode, kind = body.kind)
        roster = roster + created
        return ChallengeEnvelopeDto(challenge = created)
    }

    override suspend fun join(body: JoinChallengeRequest): ChallengeEnvelopeDto {
        joinedCodes += body.code
        joinOutcome.raise()
        val joined = challengeDto(id = "ch-joined", code = body.code)
        roster = roster + joined
        return ChallengeEnvelopeDto(challenge = joined)
    }
}

/** In-memory [ChatDao]; only the challenge rows are backed by real state. */
class FakeChatDao : ChatDao {

    val challengeRows = MutableStateFlow<List<ChallengeEntity>>(emptyList())

    override suspend fun upsertChallenges(challenges: List<ChallengeEntity>) {
        val byId = (challengeRows.value + challenges).associateBy { it.id }
        challengeRows.value = byId.values.toList()
    }

    override fun challenges(): Flow<List<ChallengeEntity>> = challengeRows

    override suspend fun clearAllChallenges() {
        challengeRows.value = emptyList()
    }

    override suspend fun upsertSessions(sessions: List<ChatSessionEntity>) = Unit
    override fun sessions(): Flow<List<ChatSessionEntity>> = MutableStateFlow(emptyList())
    override suspend fun upsertMessages(messages: List<ChatMessageEntity>) = Unit
    override fun messages(sessionId: String): Flow<List<ChatMessageEntity>> =
        MutableStateFlow(emptyList())

    override suspend fun upsertMemoryFacts(facts: List<MemoryFactEntity>) = Unit
    override suspend fun clearMemoryFacts() = Unit
    override fun memoryFacts(): Flow<List<MemoryFactEntity>> = MutableStateFlow(emptyList())
    override suspend fun clearAllMessages() = Unit
    override suspend fun clearAllSessions() = Unit
}

/** A huddle as the server would return it. */
fun challengeDto(
    id: String,
    code: String,
    kind: BuddyChallengeKind = BuddyChallengeKind.LOGGING_STREAK,
) = BuddyChallengeDto(
    id = id,
    code = code,
    kind = kind,
    targetDays = 5,
    durationDays = 7,
)

private fun ChallengeOutcome.raise() {
    when (this) {
        ChallengeOutcome.Ok -> Unit
        ChallengeOutcome.Offline -> throw IOException("offline")
        is ChallengeOutcome.Http -> throw HttpException(
            Response.error<Any>(
                status,
                """{"code":"$code","message":"denied"}"""
                    .toResponseBody("application/json".toMediaType()),
            ),
        )
    }
}
