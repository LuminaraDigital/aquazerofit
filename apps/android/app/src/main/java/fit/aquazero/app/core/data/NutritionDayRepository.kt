package fit.aquazero.app.core.data

import fit.aquazero.app.core.common.DailyNutritionCalculator
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.database.LogsDao
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.DailyNutritionDto
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealRecommendationRequest
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.UpdateMealLogRequest
import fit.aquazero.app.core.model.map
import fit.aquazero.app.core.network.api.LogsApi
import fit.aquazero.app.core.network.api.RecommendationsApi
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
 * The meal reconciliation rules live in [MealReconciler]. The one rule that
 * stays here, because it is about what cannot be reconciled at all:
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

    private val reconciler = MealReconciler(logsDao)

    /**
     * Pull one day from `GET /analytics/nutrition/daily` and fold its meal
     * logs into Room. Failure is non-fatal: Room keeps serving the UI.
     */
    suspend fun refreshDay(localDate: String): ApiResult<DailyNutritionDto> {
        val result = safeCall { logsApi.dailyNutrition(localDate) }
        if (result is ApiResult.Success) {
            reconciler.reconcile(localDate, result.data.meals.values.flatten())
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

    private fun mealTypeOrNull(name: String): MealType? = when (name.lowercase()) {
        "breakfast" -> MealType.BREAKFAST
        "lunch" -> MealType.LUNCH
        "dinner" -> MealType.DINNER
        "snack" -> MealType.SNACK
        else -> null
    }
}

/**
 * Folds a server day's meal logs into Room.
 *
 * Split out of [NutritionDayRepository] because it is pure Room work: every
 * decision it makes can be exercised against a `LogsDao` double, with no
 * network, no outbox and no WorkManager standing in the way.
 *
 * Rules:
 *  - Server meal logs are keyed into Room by `serverId`; a row that still has
 *    local work pending (PENDING/FAILED) is never overwritten by a refresh.
 *  - A row the user has soft-deleted is never written back, however healthy
 *    the server still believes it to be.
 *  - A locally SYNCED row that has vanished server-side is removed.
 */
internal class MealReconciler(private val logsDao: LogsDao) {

    suspend fun reconcile(localDate: String, serverLogs: List<MealLogDto>) {
        // Deliberately the *unfiltered* read. `mealLogsForDateOnce` hides
        // soft-deleted rows, and a hidden row is a row this index cannot map
        // back to its `serverId`: a meal the user deleted a second ago, whose
        // DELETE op has not drained yet, is still returned by the server and
        // then looks brand new here. It gets inserted a second time under a
        // `srv-` id — the deleted meal is back on the day and back in the
        // calorie total, and offline (where the op can never drain) it stays
        // there. If you are tempted to reuse the filtered query here: that is
        // exactly the bug.
        val local = logsDao.mealLogsForDateOnceIncludingDeleted(localDate)
        val byServerId = local.filter { it.serverId != null }.associateBy { it.serverId }
        for (dto in serverLogs) {
            val existing = byServerId[dto.id]
            if (existing != null && !acceptsServerCopy(existing)) continue
            logsDao.upsertMealLog(rowFor(dto, existing))
        }
        val serverIds = serverLogs.mapTo(mutableSetOf()) { it.id }
        local.asSequence()
            .filter { it.syncState == SyncState.SYNCED }
            .filter { it.serverId != null && it.serverId !in serverIds }
            .forEach { logsDao.deleteMealLogRow(it.localId) }
    }

    /**
     * Whether a refresh may overwrite [row] with the server's copy.
     *
     * Unsynced local work always wins over the network, and a soft-delete is
     * local work: it is a deletion the server has not applied yet. Writing the
     * server's copy over it would clear `deleted` and undo the user's tap.
     */
    private fun acceptsServerCopy(row: MealLogEntity): Boolean =
        !row.deleted && row.syncState == SyncState.SYNCED

    private fun rowFor(dto: MealLogDto, existing: MealLogEntity?): MealLogEntity = MealLogEntity(
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
    )

    private fun mealTypeName(mealType: MealType): String = when (mealType) {
        MealType.BREAKFAST -> "breakfast"
        MealType.LUNCH -> "lunch"
        MealType.DINNER -> "dinner"
        MealType.SNACK -> "snack"
    }

    internal companion object {
        /** Local id prefix for rows that originated on the server. */
        const val SERVER_ROW_PREFIX = "srv-"
    }
}
