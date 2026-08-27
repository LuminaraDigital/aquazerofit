package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.CatalogDao
import fit.aquazero.app.core.database.CoachEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.network.api.CoachesApi
import fit.aquazero.app.core.model.CoachRosterDto
import fit.aquazero.app.core.model.CoachSelectRequest
import fit.aquazero.app.core.model.ProgressionStatusDto
import fit.aquazero.app.core.model.ReactionAckRequest
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import fit.aquazero.app.core.network.safeCall

/**
 * Coach roster, selection and progression. Entitlement snapshots cache into
 * Room; NO purchase path exists on Android (level unlock only).
 */
@Singleton
class CoachesRepository @Inject constructor(
    private val coachesApi: CoachesApi,
    private val catalogDao: CatalogDao,
) {

    /** Cached per-coach entitlement snapshot. */
    fun coaches(): Flow<List<CoachEntity>> = catalogDao.coaches()

    /** Refresh the roster into Room. */
    suspend fun refreshRoster(): ApiResult<CoachRosterDto> =
        safeCall { coachesApi.roster() }.also { result ->
            if (result is ApiResult.Success) cacheRoster(result.data)
        }

    /** Select a coach (bond math is server-side; switching never destroys bond). */
    suspend fun selectCoach(coachId: String): ApiResult<CoachRosterDto> =
        safeCall { coachesApi.select(CoachSelectRequest(coachId)) }.also { result ->
            if (result is ApiResult.Success) cacheRoster(result.data)
        }

    /** Progression + unseen reactions. */
    suspend fun progression(): ApiResult<ProgressionStatusDto> =
        safeCall { coachesApi.progression() }

    /**
     * Acknowledge DISPLAYED reactions — always after composition so a
     * celebration is never burned unseen (plan §5).
     */
    suspend fun ackReactions(ack: ReactionAckRequest): ApiResult<Unit> =
        safeCall { coachesApi.ackReactions(ack) }

    private suspend fun cacheRoster(roster: CoachRosterDto) {
        catalogDao.upsertCoaches(
            roster.entitlements.map {
                CoachEntity(
                    coachId = it.coachId,
                    unlocked = it.unlocked,
                    reason = it.reason.name.lowercase(),
                    requiredLevel = it.requiredLevel,
                    bondXp = it.bondXp,
                    bondLevel = it.bondLevel,
                    isActive = it.coachId == roster.activeCoachId,
                    updatedAt = System.currentTimeMillis(),
                )
            },
        )
    }
}
