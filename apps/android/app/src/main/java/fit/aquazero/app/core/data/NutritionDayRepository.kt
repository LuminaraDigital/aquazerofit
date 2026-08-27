package fit.aquazero.app.core.data

import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.common.DailyNutritionCalculator
import fit.aquazero.app.core.database.LogsDao
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.network.api.LogsApi
import fit.aquazero.app.core.network.api.RecommendationsApi
import fit.aquazero.app.core.model.DailyNutritionDto
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealRecommendationRequest
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.UpdateMealLogRequest
import fit.aquazero.app.core.model.map
import fit.aquazero.app.core.network.safeCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The read/refresh half of the nutrition day, plus the two log mutations the
 * Wave 1 [LogsRepository] did not expose (meal edit) and the online-only
 * recommendation lane.
 *
 * Split into its own repository deliberately: [LogsRepository] owns the three
 * optimistic offline *creates*, this one owns refresh-on-observe reconciliation
 * (plan §4.2 "reads: Room Flow as UI source + refresh-on-observe network fetch
 * that upserts Room") and the follow-up `PUT` op that the outbox and
 * `SyncWorker` already implement but nothing could enqueue.
 *
 * Reconciliation rules:
 *  - Server meal logs are keyed into Room by `serverId`; a row that still has
 *    local work pending (PENDING/FAILED) is never overwritten by a refresh.
 *  - A locally SYNCED row that has vanished server-side is removed.
 *  - Water is **not** written back into Room: `GET /water-logs` and the daily
 *    analytics both expose day *totals* only, so individual entries cannot be
 *    matched (plan §4.2). The server total is returned to the caller instead
 *    and merged for display, which can never double-count local entries.
 */
@Singleton
class NutritionDayRepository @Inject constructor(
    private val logsApi: LogsApi,
    private val recommendationsApi: RecommendationsApi,
    private val logsDao: LogsDao,
    private val outboxRepository: OutboxRepository,
    private val syncScheduler: SyncScheduler,
) {

    /**
     * Pull one day from `GET /analytics/nutrition/daily` and fold its meal
     * logs into Room. Failure is non-fatal: Room keeps serving the UI.
     */
    suspend fun refreshDay(localDate: String): ApiResult<DailyNutritionDto> {
        val result = safeCall { logsApi.dailyNutrition(localDate) }
        if (result is ApiResult.Success) {
            reconcileMeals(localDate, result.data.meals.values.flatten())
        }
        return result
    }

    /**
     * Replace a logged meal's items. Always travels as a follow-up `UPDATE`
     * op — never by mutating the create's payload — so an idempotency key is
     * never reused with a different body (plan §4.2).
     */
    suspend fun updateMealItems(localId: String, items: List<MealLogItemDto>) {
        val row = logsDao.mealLogByLocalId(localId) ?: return
        logsDao.upsertMealLog(
            row.copy(
                items = items,
                totalKcal = DailyNutritionCalculator.round1(items.sumOf { it.kcal }),
                totalProteinG = DailyNutritionCalculator.round1(items.sumOf { it.proteinG }),
                totalCarbsG = DailyNutritionCalculator.round1(items.sumOf { it.carbsG }),
                totalFatG = DailyNutritionCalculator.round1(items.sumOf { it.fatG }),
                syncState = SyncState.PENDING,
            ),
        )
        outboxRepository.enqueueUpdate(
            entityType = OutboxEntityTypes.MEAL_LOG,
            localId = localId,
            payloadJson = AzfJson.encodeToString(
                UpdateMealLogRequest.serializer(),
                UpdateMealLogRequest(
                    mealType = mealTypeOrNull(row.mealType),
                    items = items,
                    localDate = row.localDate,
                ),
            ),
        )
        syncScheduler.requestSync()
    }

    /** The day's meal logs as a one-shot read (used by copy-previous-day). */
    suspend fun mealLogsOnce(localDate: String): List<MealLogEntity> =
        logsDao.mealLogsForDateOnce(localDate)

    /**
     * On-demand meal suggestion — online-only, calmly degraded on failure.
     *
     * [localDate] is not optional to the route: it rejects the call without
     * both fields, and it needs the client's day to know what has already been
     * eaten.
     */
    suspend fun suggestMeal(
        mealType: MealType,
        localDate: String = LocalDates.today(),
    ): ApiResult<MealRecommendationDto> =
        safeCall { recommendationsApi.suggestMeal(MealRecommendationRequest(mealType, localDate)) }
            .map { it.recommendation }

    /**
     * Log a suggestion the user explicitly accepted. Online-only by design:
     * the server owns the recommendation → meal-log conversion, so there is
     * nothing to queue offline.
     */
    suspend fun logRecommendation(recommendationId: String): ApiResult<MealLogDto> =
        safeCall { recommendationsApi.logRecommendation(recommendationId) }.map { it.mealLog }

    // ----- reconciliation -----

    private suspend fun reconcileMeals(localDate: String, serverLogs: List<MealLogDto>) {
        val local = logsDao.mealLogsForDateOnce(localDate)
        val byServerId = local.filter { it.serverId != null }.associateBy { it.serverId }
        for (dto in serverLogs) {
            val existing = byServerId[dto.id]
            // Never clobber a row that still has unsynced local work on it.
            if (existing != null && existing.syncState != SyncState.SYNCED) continue
            logsDao.upsertMealLog(
                MealLogEntity(
                    localId = existing?.localId ?: "$SERVER_ROW_PREFIX${dto.id}",
                    serverId = dto.id,
                    mealType = mealTypeName(dto.mealType),
                    items = dto.items,
                    totalKcal = dto.totalKcal,
                    totalProteinG = dto.totalProteinG,
                    totalCarbsG = dto.totalCarbsG,
                    totalFatG = dto.totalFatG,
                    source = dto.source.name.lowercase(),
                    visionJobId = dto.visionJobId,
                    loggedAt = dto.loggedAt,
                    localDate = dto.localDate,
                    syncState = SyncState.SYNCED,
                    idempotencyKey = existing?.idempotencyKey.orEmpty(),
                ),
            )
        }
        val serverIds = serverLogs.mapTo(mutableSetOf()) { it.id }
        local.asSequence()
            .filter { it.syncState == SyncState.SYNCED }
            .filter { it.serverId != null && it.serverId !in serverIds }
            .forEach { logsDao.deleteMealLogRow(it.localId) }
    }

    private fun mealTypeName(mealType: MealType): String = when (mealType) {
        MealType.BREAKFAST -> "breakfast"
        MealType.LUNCH -> "lunch"
        MealType.DINNER -> "dinner"
        MealType.SNACK -> "snack"
    }

    private fun mealTypeOrNull(name: String): MealType? = when (name.lowercase()) {
        "breakfast" -> MealType.BREAKFAST
        "lunch" -> MealType.LUNCH
        "dinner" -> MealType.DINNER
        "snack" -> MealType.SNACK
        else -> null
    }

    private companion object {
        /** Local id prefix for rows that originated on the server. */
        const val SERVER_ROW_PREFIX = "srv-"
    }
}
