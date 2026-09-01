package fit.aquazero.app.feature.settings

import fit.aquazero.app.core.database.ConsentEntity
import fit.aquazero.app.core.database.EntitlementsEntity
import fit.aquazero.app.core.database.ProfileEntity
import fit.aquazero.app.core.database.TargetsEntity
import fit.aquazero.app.core.database.UserDao
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.model.AddMemoryFactRequest
import fit.aquazero.app.core.model.ConsentStateDto
import fit.aquazero.app.core.model.ConsentUpdateRequest
import fit.aquazero.app.core.model.EntitlementsDto
import fit.aquazero.app.core.model.MemoryEnvelopeDto
import fit.aquazero.app.core.model.MemoryFactCategory
import fit.aquazero.app.core.model.MemoryFactDto
import fit.aquazero.app.core.model.MemoryFactStatus
import fit.aquazero.app.core.model.ProfileInputDto
import fit.aquazero.app.core.model.UpdateMemoryFactRequest
import fit.aquazero.app.core.model.UserMemoryDto
import fit.aquazero.app.core.network.api.AccountApi
import fit.aquazero.app.core.network.api.ConsentsEnvelopeDto
import fit.aquazero.app.core.network.api.DeletionStatusDto
import fit.aquazero.app.core.network.api.ProfileAndTargetsDto
import fit.aquazero.app.core.network.api.ProfileEnvelopeDto
import fit.aquazero.app.core.network.api.TargetsEnvelopeDto
import fit.aquazero.app.core.network.api.UpdateIdentityRequest
import fit.aquazero.app.core.network.api.UserEnvelopeDto
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/**
 * Hand-written doubles for the settings lane: no Retrofit, no Room, no Hilt.
 *
 * The repositories under test are thin, so they are exercised for real over
 * these fakes rather than being mocked out — that keeps the envelope
 * unwrapping and the error mapping inside the test's reach.
 */

/** How a fake call should behave. */
sealed interface FakeOutcome {
    data object Ok : FakeOutcome

    /** An HTTP error carrying the API's `{code, message}` envelope. */
    data class Http(val status: Int, val code: String) : FakeOutcome

    /** No response at all — offline. */
    data object Offline : FakeOutcome
}

/** In-memory [AccountApi]. */
class FakeAccountApi : AccountApi {

    var memoryDoc: UserMemoryDto = UserMemoryDto(id = "mem-1")
    var memoryOutcome: FakeOutcome = FakeOutcome.Ok
    var mutationOutcome: FakeOutcome = FakeOutcome.Ok
    var deletionPurged: Boolean = false

    var consentsDoc: ConsentStateDto = ConsentStateDto(
        wellnessDataProcessing = true,
        aiPersonalisation = true,
        anonymisedAnalytics = true,
        reminders = false,
        updatedAt = "2026-08-27T00:00:00.000Z",
    )

    val savedConsents = mutableListOf<ConsentUpdateRequest>()
    val deletionCalls = mutableListOf<Unit>()
    val addedFacts = mutableListOf<AddMemoryFactRequest>()
    val statusUpdates = mutableListOf<Pair<String, MemoryFactStatus?>>()
    val deletedFactIds = mutableListOf<String>()
    var clearCalls = 0

    // ----- identity -----

    override suspend fun me(): UserEnvelopeDto = throw notUsed()

    override suspend fun updateMe(body: UpdateIdentityRequest): UserEnvelopeDto = throw notUsed()

    override suspend fun requestDeletion(): DeletionStatusDto {
        deletionCalls += Unit
        val purged = deletionPurged
        deletionPurged = true
        return DeletionStatusDto(
            purged = purged,
            deletionRequestedAt = "2026-08-27T00:00:00.000Z",
        )
    }

    // ----- profile -----

    override suspend fun profile(): ProfileEnvelopeDto = ProfileEnvelopeDto(profile = null)

    override suspend fun saveProfile(body: ProfileInputDto): ProfileAndTargetsDto = throw notUsed()

    override suspend fun targets(): TargetsEnvelopeDto = throw notUsed()

    // ----- consents -----

    override suspend fun consents(): ConsentsEnvelopeDto = ConsentsEnvelopeDto(consentsDoc)

    override suspend fun saveConsents(body: ConsentUpdateRequest): ConsentsEnvelopeDto {
        savedConsents += body
        consentsDoc = consentsDoc.copy(
            wellnessDataProcessing = body.wellnessDataProcessing,
            aiPersonalisation = body.aiPersonalisation,
            anonymisedAnalytics = body.anonymisedAnalytics,
            reminders = body.reminders,
        )
        return ConsentsEnvelopeDto(consentsDoc)
    }

    // ----- entitlements / export -----

    override suspend fun entitlements(): EntitlementsDto = throw notUsed()

    override suspend fun export(): ResponseBody =
        "{}".toResponseBody("application/json".toMediaType())

    // ----- memory -----

    override suspend fun memory(): MemoryEnvelopeDto {
        memoryOutcome.raise()
        return MemoryEnvelopeDto(memoryDoc)
    }

    override suspend fun addFact(body: AddMemoryFactRequest): MemoryEnvelopeDto {
        addedFacts += body
        mutationOutcome.raise()
        memoryDoc = memoryDoc.copy(
            facts = memoryDoc.facts + MemoryFactDto(
                id = "fact-${memoryDoc.facts.size + 1}",
                text = body.text,
                category = body.category,
                status = MemoryFactStatus.CONFIRMED,
            ),
        )
        return MemoryEnvelopeDto(memoryDoc)
    }

    override suspend fun updateFact(
        factId: String,
        body: UpdateMemoryFactRequest,
    ): MemoryEnvelopeDto {
        statusUpdates += factId to body.status
        mutationOutcome.raise()
        memoryDoc = memoryDoc.copy(
            facts = memoryDoc.facts.map { fact ->
                if (fact.id != factId) {
                    fact
                } else {
                    fact.copy(
                        text = body.text ?: fact.text,
                        status = body.status ?: fact.status,
                    )
                }
            },
        )
        return MemoryEnvelopeDto(memoryDoc)
    }

    override suspend fun deleteFact(factId: String): MemoryEnvelopeDto {
        deletedFactIds += factId
        mutationOutcome.raise()
        memoryDoc = memoryDoc.copy(facts = memoryDoc.facts.filterNot { it.id == factId })
        return MemoryEnvelopeDto(memoryDoc)
    }

    override suspend fun clearMemory() {
        clearCalls++
        mutationOutcome.raise()
        memoryDoc = UserMemoryDto(id = memoryDoc.id, version = memoryDoc.version + 1)
    }

    private fun notUsed(): Throwable = UnsupportedOperationException("not used by this test")
}

/** Turn a [FakeOutcome] into the exception `safeCall` expects to translate. */
private fun FakeOutcome.raise() {
    when (this) {
        FakeOutcome.Ok -> Unit
        FakeOutcome.Offline -> throw IOException("offline")
        is FakeOutcome.Http -> throw HttpException(
            Response.error<Any>(
                status,
                """{"code":"$code","message":"denied"}"""
                    .toResponseBody("application/json".toMediaType()),
            ),
        )
    }
}

/** In-memory [UserDao] backed by plain state flows. */
class FakeUserDao : UserDao {

    val userFlow = MutableStateFlow<UserEntity?>(null)
    val profileFlow = MutableStateFlow<ProfileEntity?>(null)
    val targetsFlow = MutableStateFlow<TargetsEntity?>(null)
    val consentsFlow = MutableStateFlow<ConsentEntity?>(null)
    val entitlementsFlow = MutableStateFlow<EntitlementsEntity?>(null)

    override suspend fun upsertUser(user: UserEntity) {
        userFlow.value = user
    }

    override fun user(): Flow<UserEntity?> = userFlow

    override suspend fun userOnce(): UserEntity? = userFlow.value

    override suspend fun upsertProfile(profile: ProfileEntity) {
        profileFlow.value = profile
    }

    override fun profile(): Flow<ProfileEntity?> = profileFlow

    override suspend fun profileOnce(): ProfileEntity? = profileFlow.value

    override suspend fun upsertTargets(targets: TargetsEntity) {
        targetsFlow.value = targets
    }

    override fun targets(): Flow<TargetsEntity?> = targetsFlow

    override suspend fun targetsOnce(): TargetsEntity? = targetsFlow.value

    override suspend fun upsertConsents(consents: ConsentEntity) {
        consentsFlow.value = consents
    }

    override fun consents(): Flow<ConsentEntity?> = consentsFlow

    override suspend fun upsertEntitlements(entitlements: EntitlementsEntity) {
        entitlementsFlow.value = entitlements
    }

    override fun entitlements(): Flow<EntitlementsEntity?> = entitlementsFlow

    override suspend fun clearUser() {
        userFlow.value = null
    }

    override suspend fun clearProfile() {
        profileFlow.value = null
    }

    override suspend fun clearTargets() {
        targetsFlow.value = null
    }

    override suspend fun clearConsents() {
        consentsFlow.value = null
    }

    override suspend fun clearEntitlements() {
        entitlementsFlow.value = null
    }

    override suspend fun clearAllAccountRows() {
        clearUser()
        clearProfile()
        clearTargets()
        clearConsents()
        clearEntitlements()
    }
}

/** A suggested fact, as the extraction pipeline would file it. */
fun suggestedFact(id: String, text: String = "Trains before work") = MemoryFactDto(
    id = id,
    text = text,
    category = MemoryFactCategory.CONTEXT,
    status = MemoryFactStatus.SUGGESTED,
)

/** A confirmed fact. */
fun confirmedFact(id: String, text: String = "Avoids overhead pressing") = MemoryFactDto(
    id = id,
    text = text,
    category = MemoryFactCategory.CONSTRAINT,
    status = MemoryFactStatus.CONFIRMED,
)
