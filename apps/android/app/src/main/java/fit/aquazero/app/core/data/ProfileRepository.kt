package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.ConsentEntity
import fit.aquazero.app.core.database.ProfileEntity
import fit.aquazero.app.core.database.TargetsEntity
import fit.aquazero.app.core.database.UserDao
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.network.api.MeApi
import fit.aquazero.app.core.model.ConsentStateDto
import fit.aquazero.app.core.model.ConsentUpdateRequest
import fit.aquazero.app.core.model.DerivedTargetsDto
import fit.aquazero.app.core.model.ProfileInputDto
import fit.aquazero.app.core.model.PublicUserDto
import fit.aquazero.app.core.model.WellnessProfileDto
import fit.aquazero.app.core.network.safeCall
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

/**
 * Account, wellness profile, derived targets and consents. Server-owned,
 * online-write, cached in Room for offline display (server wins on refresh).
 */
@Singleton
class ProfileRepository @Inject constructor(
    private val meApi: MeApi,
    private val userDao: UserDao,
) {

    /** Cached account row. */
    fun user(): Flow<UserEntity?> = userDao.user()

    /** Cached wellness profile. */
    fun profile(): Flow<ProfileEntity?> = userDao.profile()

    /** Cached derived targets (rings read these offline). */
    fun targets(): Flow<TargetsEntity?> = userDao.targets()

    /** Cached consent bits. */
    fun consents(): Flow<ConsentEntity?> = userDao.consents()

    /** Refresh `/me` into Room. */
    suspend fun refreshMe(): ApiResult<PublicUserDto> =
        safeCall { meApi.me() }.also { result ->
            if (result is ApiResult.Success) userDao.upsertUser(result.data.toEntity())
        }

    /** Refresh profile + targets into Room. */
    suspend fun refreshProfileAndTargets(): ApiResult<Unit> {
        val profile = safeCall { meApi.profile() }
        if (profile is ApiResult.Success) userDao.upsertProfile(profile.data.toEntity())
        val targets = safeCall { meApi.targets() }
        if (targets is ApiResult.Success) userDao.upsertTargets(targets.data.toEntity())
        return when {
            profile is ApiResult.Failure -> profile
            targets is ApiResult.Failure -> targets
            else -> ApiResult.Success(Unit)
        }
    }

    /** Save the profile; the server recomputes targets and both are cached. */
    suspend fun saveProfile(input: ProfileInputDto): ApiResult<WellnessProfileDto> =
        when (val result = safeCall { meApi.saveProfile(input) }) {
            is ApiResult.Success -> {
                userDao.upsertProfile(result.data.profile.toEntity())
                result.data.targets?.let { userDao.upsertTargets(it.toEntity()) }
                ApiResult.Success(result.data.profile)
            }
            is ApiResult.Failure -> result
        }

    /** Refresh consents into Room. */
    suspend fun refreshConsents(): ApiResult<ConsentStateDto> =
        safeCall { meApi.consents() }.also { result ->
            if (result is ApiResult.Success) userDao.upsertConsents(result.data.toEntity())
        }

    /** Save consents (low-frequency online write; simple retry UI, no outbox). */
    suspend fun saveConsents(update: ConsentUpdateRequest): ApiResult<ConsentStateDto> =
        safeCall { meApi.saveConsents(update) }.also { result ->
            if (result is ApiResult.Success) userDao.upsertConsents(result.data.toEntity())
        }

    // ----- mapping -----

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
        userId = "me",
        wellnessDataProcessing = wellnessDataProcessing,
        aiPersonalisation = aiPersonalisation,
        anonymisedAnalytics = anonymisedAnalytics,
        reminders = reminders,
        updatedAt = updatedAt,
    )
}
