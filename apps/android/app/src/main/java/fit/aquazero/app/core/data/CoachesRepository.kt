package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.CatalogDao
import fit.aquazero.app.core.database.CoachEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.CoachRosterDto
import fit.aquazero.app.core.model.CoachSelectRequest
import fit.aquazero.app.core.model.ProgressionStatusDto
import fit.aquazero.app.core.model.ReactionAckRequest
import fit.aquazero.app.core.network.api.CoachesApi
import fit.aquazero.app.core.network.safeCall
import fit.aquazero.app.core.ui.CoachRoster
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Coach roster, selection and progression. Entitlement snapshots cache into
 * Room; coaches unlock by level and by nothing else. The app's only product is
 * the premium subscription ([BillingRepository]), which buys model lanes and
 * deliberately does not unlock a coach — so no route reachable from here has a
 * purchase in it.
 */
@Singleton
open class CoachesRepository @Inject constructor(
    private val coachesApi: CoachesApi,
    private val catalogDao: CatalogDao,
) {

    /** Cached per-coach entitlement snapshot. */
    open fun coaches(): Flow<List<CoachEntity>> = catalogDao.coaches()

    /** Active coach ID stream. */
    open fun activeCoachId(): Flow<String?> =
        catalogDao.activeCoach().map { it?.coachId ?: CoachRoster.DEFAULT_ID }

    /** Refresh the roster into Room. */
    open suspend fun refreshRoster(): ApiResult<CoachRosterDto> =
        safeCall { coachesApi.roster() }.also { result ->
            if (result is ApiResult.Success) cacheRoster(result.data)
        }

    /** Select a coach (bond math is server-side; switching never destroys bond). */
    open suspend fun selectCoach(coachId: String): ApiResult<CoachRosterDto> =
        safeCall { coachesApi.select(CoachSelectRequest(coachId)) }.also { result ->
            if (result is ApiResult.Success) cacheRoster(result.data)
        }

    /** Progression + unseen reactions. */
    open suspend fun progression(): ApiResult<ProgressionStatusDto> =
        safeCall { coachesApi.progression() }

    /**
     * Acknowledge DISPLAYED reactions — always after composition so a
     * celebration is never burned unseen (plan §5).
     */
    open suspend fun ackReactions(ack: ReactionAckRequest): ApiResult<Unit> =
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
