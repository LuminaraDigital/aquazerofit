package fit.aquazero.app.feature.coach

import fit.aquazero.app.core.data.CoachesRepository
import fit.aquazero.app.core.database.CatalogDao
import fit.aquazero.app.core.database.CoachEntity
import fit.aquazero.app.core.database.FoodEntity
import fit.aquazero.app.core.database.RecipeEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.CoachRosterDto
import fit.aquazero.app.core.model.CoachSelectRequest
import fit.aquazero.app.core.model.ProgressionStatusDto
import fit.aquazero.app.core.model.ReactionAckRequest
import fit.aquazero.app.core.network.api.CoachesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import java.io.IOException

/**
 * Doubles for the coach lane.
 *
 * [CoachesRepository] is `open` precisely so this can exist: the roster
 * screen's whole job is joining a client-side persona list to server
 * entitlements, and that join is worth testing without Room or Retrofit
 * anywhere near it.
 */

/**
 * A [CoachesRepository] whose four reachable members are settable.
 *
 * The constructor arguments are unreachable stubs, not fixtures — every method
 * that would touch them is overridden below. They exist because Kotlin needs
 * the superclass constructor satisfied, and they throw rather than return
 * empty so a future override gone missing fails loudly instead of silently
 * reading nothing.
 */
class FakeCoachesRepository : CoachesRepository(
    coachesApi = UnreachableCoachesApi,
    catalogDao = UnreachableCatalogDao,
) {

    /** The cached roster the screen renders from. Mutable mid-test. */
    val cached = MutableStateFlow<List<CoachEntity>>(emptyList())

    /** What the next [refreshRoster] returns. Defaults to offline. */
    var rosterResult: ApiResult<CoachRosterDto> = offline()

    /** What the next [selectCoach] returns. */
    var selectResult: ApiResult<CoachRosterDto> = offline()

    /** Every coach id passed to [selectCoach], in order. */
    val selectCalls = mutableListOf<String>()

    var refreshCalls = 0
        private set

    override fun coaches(): Flow<List<CoachEntity>> = cached

    override fun activeCoachId(): Flow<String?> =
        flowOf(cached.value.firstOrNull { it.isActive }?.coachId)

    override suspend fun refreshRoster(): ApiResult<CoachRosterDto> {
        refreshCalls++
        return rosterResult
    }

    override suspend fun selectCoach(coachId: String): ApiResult<CoachRosterDto> {
        selectCalls += coachId
        return selectResult
    }

    override suspend fun progression(): ApiResult<ProgressionStatusDto> =
        ApiResult.Success(ProgressionStatusDto())

    override suspend fun ackReactions(ack: ReactionAckRequest): ApiResult<Unit> =
        ApiResult.Success(Unit)
}

/** A cached entitlement row, as [CoachesRepository.refreshRoster] would file it. */
fun coachEntity(
    id: String,
    unlocked: Boolean = true,
    active: Boolean = false,
    requiredLevel: Int = 0,
    bondXp: Int = 0,
    bondLevel: Int = 1,
) = CoachEntity(
    coachId = id,
    unlocked = unlocked,
    reason = if (unlocked) "unlocked" else "locked",
    requiredLevel = requiredLevel,
    bondXp = bondXp,
    bondLevel = bondLevel,
    isActive = active,
)

private object UnreachableCoachesApi : CoachesApi {
    override suspend fun roster(): CoachRosterDto = unreachable()
    override suspend fun select(body: CoachSelectRequest): CoachRosterDto = unreachable()
    override suspend fun progression(): ProgressionStatusDto = unreachable()
    override suspend fun ackReactions(body: ReactionAckRequest) = unreachable()
}

private object UnreachableCatalogDao : CatalogDao {
    override suspend fun upsertFoods(foods: List<FoodEntity>) = unreachable()
    override suspend fun searchCachedFoods(query: String, limit: Int): List<FoodEntity> =
        unreachable()

    override suspend fun foodById(id: String): FoodEntity? = unreachable()
    override fun recentFoods(limit: Int): Flow<List<FoodEntity>> = unreachable()
    override suspend fun touchFood(id: String, nowMs: Long) = unreachable()
    override suspend fun upsertRecipes(recipes: List<RecipeEntity>) = unreachable()
    override fun recipes(): Flow<List<RecipeEntity>> = unreachable()
    override suspend fun recipeById(id: String): RecipeEntity? = unreachable()
    override suspend fun upsertCoaches(coaches: List<CoachEntity>) = unreachable()
    override fun coaches(): Flow<List<CoachEntity>> = unreachable()
    override fun activeCoach(): Flow<CoachEntity?> = unreachable()
}

/** The transport failure a cold, offline launch produces. */
fun offline(): ApiResult.Failure.Network =
    ApiResult.Failure.Network(IOException("offline"))

private fun unreachable(): Nothing =
    error("FakeCoachesRepository overrides every member that reaches this")
