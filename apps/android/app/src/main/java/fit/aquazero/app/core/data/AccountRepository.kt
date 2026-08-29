package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.ConsentEntity
import fit.aquazero.app.core.database.EntitlementsEntity
import fit.aquazero.app.core.database.ProfileEntity
import fit.aquazero.app.core.database.TargetsEntity
import fit.aquazero.app.core.database.UserDao
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.ConsentStateDto
import fit.aquazero.app.core.model.ConsentUpdateRequest
import fit.aquazero.app.core.model.DerivedTargetsDto
import fit.aquazero.app.core.model.EntitlementsDto
import fit.aquazero.app.core.model.ProfileInputDto
import fit.aquazero.app.core.model.PublicUserDto
import fit.aquazero.app.core.model.WellnessProfileDto
import fit.aquazero.app.core.model.map
import fit.aquazero.app.core.network.api.AccountApi
import fit.aquazero.app.core.network.api.DeletionStatusDto
import fit.aquazero.app.core.network.api.UpdateIdentityRequest
import fit.aquazero.app.core.network.safeCall
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Account lifecycle: identity, wellness profile, derived targets, the four
 * granular consents, entitlements, data export and deletion.
 *
 * Reads are Room `Flow`s so every settings surface works offline; writes are
 * online-only with a plain retry affordance (plan §4.2 — profile/consent writes
 * are low-frequency and deliberately stay out of the outbox).
 *
 * This is a sibling of [ProfileRepository], not a replacement: it exists
 * because the wave-1 `MeApi` declares flat bodies for routes the server wraps.
 * See the contract table at the top of `AccountApi`.
 */
@Singleton
class AccountRepository @Inject constructor(
    private val accountApi: AccountApi,
    private val userDao: UserDao,
) {

    // ----- cached reads -----

    /** Cached account row. */
    fun user(): Flow<UserEntity?> = userDao.user()

    /** Cached wellness profile; null until the essentials form is submitted. */
    fun profile(): Flow<ProfileEntity?> = userDao.profile()

    /** Cached derived targets. */
    fun targets(): Flow<TargetsEntity?> = userDao.targets()

    /** Cached consent bits — the gate every consented feature reads. */
    fun consents(): Flow<ConsentEntity?> = userDao.consents()

    /** Cached entitlements snapshot. */
    fun entitlements(): Flow<EntitlementsEntity?> = userDao.entitlements()

    // ----- refreshes -----

    /** Refresh `/me` into Room. */
    suspend fun refreshMe(): ApiResult<PublicUserDto> =
        safeCall { accountApi.me() }.map { it.user }.alsoCache { userDao.upsertUser(it.toEntity()) }

    /**
     * Refresh the wellness profile. A null profile is a real, supported state
     * (first run), so it is returned as success rather than turned into an
     * error the caller has to special-case.
     */
    suspend fun refreshProfile(): ApiResult<WellnessProfileDto?> =
        safeCall { accountApi.profile() }.map { it.profile }.also { result ->
            (result as? ApiResult.Success)?.data?.let { userDao.upsertProfile(it.toEntity()) }
        }

    /**
     * Refresh derived targets. The server 404s when no profile exists yet —
     * that is the honest "we have nothing to compute from" answer and the
     * caller renders the setup prompt rather than a failure.
     */
    suspend fun refreshTargets(): ApiResult<DerivedTargetsDto> =
        safeCall { accountApi.targets() }.map { it.targets }
            .alsoCache { userDao.upsertTargets(it.toEntity()) }

    /** Refresh consents into Room. */
    suspend fun refreshConsents(): ApiResult<ConsentStateDto> =
        safeCall { accountApi.consents() }.map { it.consents }
            .alsoCache { userDao.upsertConsents(it.toEntity()) }

    /** Refresh entitlements into Room. */
    suspend fun refreshEntitlements(): ApiResult<EntitlementsDto> =
        safeCall { accountApi.entitlements() }.alsoCache { userDao.upsertEntitlements(it.toEntity()) }

    // ----- writes -----

    /** Rename the account. */
    suspend fun updateDisplayName(displayName: String): ApiResult<PublicUserDto> =
        safeCall { accountApi.updateMe(UpdateIdentityRequest(displayName = displayName)) }
            .map { it.user }
            .alsoCache { userDao.upsertUser(it.toEntity()) }

    /**
     * Save the wellness profile. The server recomputes targets from it and
     * returns both, so the clamp advisory is available the moment the form is
     * submitted without a second round trip.
     */
    suspend fun saveProfile(input: ProfileInputDto): ApiResult<SavedProfile> =
        safeCall { accountApi.saveProfile(input) }.map { dto ->
            SavedProfile(profile = dto.profile, targets = dto.targets)
        }.also { result ->
            (result as? ApiResult.Success)?.data?.let { saved ->
                userDao.upsertProfile(saved.profile.toEntity())
                saved.targets?.let { userDao.upsertTargets(it.toEntity()) }
            }
        }

    /**
     * Save all four consents. The route takes the whole object, so callers pass
     * the current state with one bit flipped — never a partial.
     */
    suspend fun saveConsents(update: ConsentUpdateRequest): ApiResult<ConsentStateDto> =
        safeCall { accountApi.saveConsents(update) }.map { it.consents }
            .alsoCache { userDao.upsertConsents(it.toEntity()) }

    // ----- privacy -----

    /**
     * The full account bundle as raw JSON text, for the system share sheet.
     * `ResponseBody.string()` is blocking, so it is read off the caller's
     * dispatcher.
     */
    suspend fun exportDiary(): ApiResult<String> = withContext(Dispatchers.IO) {
        safeCall { accountApi.export().string() }
    }

    /**
     * Request deletion, or confirm it.
     *
     * The route is genuinely two-step (`me/service.ts:requestDeletion`): the
     * first call flags the account and starts the grace period, and a second
     * call while flagged purges immediately. The caller decides which of those
     * two it is asking for and words the confirmation accordingly — the result
     * says which one actually happened.
     */
    suspend fun requestDeletion(): ApiResult<DeletionStatusDto> =
        safeCall { accountApi.requestDeletion() }

    // ----- mapping -----

    private suspend fun <T> ApiResult<T>.alsoCache(cache: suspend (T) -> Unit): ApiResult<T> =
        also { if (this is ApiResult.Success) cache(data) }

    private fun PublicUserDto.toEntity(): UserEntity = UserEntity(
        id = id,
        email = email,
        displayName = displayName,
        role = role.name.lowercase(),
        tier = tier.name.lowercase(),
        emailVerified = emailVerified,
        hasProfile = hasProfile,
        timezone = timezone,
        createdAt = createdAt,
        updatedAtMs = System.currentTimeMillis(),
    )

    private fun WellnessProfileDto.toEntity(): ProfileEntity = ProfileEntity(
        userId = userId,
        weightKg = weightKg,
        goal = goal.name.lowercase(),
        unitPreference = unitPreference.name.lowercase(),
        allergiesCsv = allergies.joinToString(",") { it.name },
        docJson = AzfJson.encodeToString(WellnessProfileDto.serializer(), this),
        updatedAt = updatedAt,
    )

    private fun DerivedTargetsDto.toEntity(): TargetsEntity = TargetsEntity(
        userId = userId,
        kcalTarget = kcalTarget,
        proteinG = proteinG,
        carbsG = carbsG,
        fatG = fatG,
        waterMl = waterMl,
        docJson = AzfJson.encodeToString(DerivedTargetsDto.serializer(), this),
        computedAt = computedAt,
    )

    private fun ConsentStateDto.toEntity(): ConsentEntity = ConsentEntity(
        userId = CONSENT_ROW_ID,
        wellnessDataProcessing = wellnessDataProcessing,
        aiPersonalisation = aiPersonalisation,
        anonymisedAnalytics = anonymisedAnalytics,
        reminders = reminders,
        updatedAt = updatedAt,
    )

    private fun EntitlementsDto.toEntity(): EntitlementsEntity = EntitlementsEntity(
        userId = CONSENT_ROW_ID,
        tier = tier.name.lowercase(),
        dailyCredits = dailyCredits,
        creditsRemaining = creditsRemaining,
        docJson = AzfJson.encodeToString(EntitlementsDto.serializer(), this),
        updatedAtMs = System.currentTimeMillis(),
    )

    private companion object {
        /**
         * Consents and entitlements are singleton rows and the payloads carry
         * no user id; the same constant key ProfileRepository already writes is
         * reused so both paths address one row rather than two.
         */
        const val CONSENT_ROW_ID = "me"
    }
}

/** Profile plus the targets the server recomputed from it. */
data class SavedProfile(
    val profile: WellnessProfileDto,
    val targets: DerivedTargetsDto?,
)
