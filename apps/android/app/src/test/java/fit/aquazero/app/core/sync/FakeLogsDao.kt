package fit.aquazero.app.core.sync

import fit.aquazero.app.core.database.LogsDao
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.database.WaterLogEntity
import fit.aquazero.app.core.database.WeightLogEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

/**
 * In-memory [LogsDao] for the drain tests, honouring the same WHERE clauses as
 * the Room queries it stands in for.
 *
 * The three maps are public so a test can seed a row and then read back exactly
 * what the drain did to it — `syncState` and `serverId` are the whole point of
 * most of these assertions. The Flow reads exist to satisfy the interface; the
 * outbox never observes them.
 */
internal class FakeLogsDao : LogsDao {

    val meals = mutableMapOf<String, MealLogEntity>()
    val waters = mutableMapOf<String, WaterLogEntity>()
    val weights = mutableMapOf<String, WeightLogEntity>()

    // ----- meal logs -----

    override suspend fun upsertMealLog(log: MealLogEntity) {
        meals[log.localId] = log
    }

    override fun mealLogsForDate(localDate: String): Flow<List<MealLogEntity>> = flowOf(mealsOn(localDate))

    override suspend fun mealLogsForDateOnce(localDate: String): List<MealLogEntity> = mealsOn(localDate)

    // Mirrors the real query: same day filter, but soft-deleted rows included.
    // Reconciliation needs them, or a meal deleted offline is resurrected by
    // the next refresh.
    override suspend fun mealLogsForDateOnceIncludingDeleted(
        localDate: String,
    ): List<MealLogEntity> =
        meals.values.filter { it.localDate == localDate }.sortedBy { it.loggedAt }

    override suspend fun mealLogByLocalId(localId: String): MealLogEntity? = meals[localId]

    override suspend fun markMealLogSynced(localId: String, serverId: String?, state: SyncState) {
        meals[localId]?.let { meals[localId] = it.copy(serverId = serverId, syncState = state) }
    }

    override suspend fun setMealLogState(localId: String, state: SyncState) {
        meals[localId]?.let { meals[localId] = it.copy(syncState = state) }
    }

    override suspend fun deleteMealLogRow(localId: String) {
        meals.remove(localId)
    }

    // ----- water logs -----

    override suspend fun upsertWaterLog(log: WaterLogEntity) {
        waters[log.localId] = log
    }

    override fun waterTotalForDate(localDate: String): Flow<Int> = flowOf(waterTotal(localDate))

    override suspend fun waterTotalForDateOnce(localDate: String): Int = waterTotal(localDate)

    override suspend fun markWaterLogSynced(localId: String, serverId: String?, state: SyncState) {
        waters[localId]?.let { waters[localId] = it.copy(serverId = serverId, syncState = state) }
    }

    // ----- weight logs -----

    override suspend fun upsertWeightLog(log: WeightLogEntity) {
        weights[log.localId] = log
    }

    override suspend fun weightLogForDate(localDate: String): WeightLogEntity? =
        weights.values.firstOrNull { it.localDate == localDate }

    override fun recentWeightLogs(limit: Int): Flow<List<WeightLogEntity>> =
        flowOf(weights.values.sortedByDescending { it.localDate }.take(limit))

    override suspend fun markWeightLogSynced(localId: String, serverId: String?, state: SyncState) {
        weights[localId]?.let { weights[localId] = it.copy(serverId = serverId, syncState = state) }
    }

    private fun mealsOn(localDate: String): List<MealLogEntity> =
        meals.values.filter { it.localDate == localDate && !it.deleted }.sortedBy { it.loggedAt }

    private fun waterTotal(localDate: String): Int =
        waters.values.filter { it.localDate == localDate }.sumOf { it.amountMl }

    override suspend fun clearAllMealLogs() {
        meals.clear()
    }

    override suspend fun clearAllWaterLogs() {
        waters.clear()
    }

    override suspend fun clearAllWeightLogs() {
        weights.clear()
    }

    override suspend fun clearAllLogs() {
        clearAllMealLogs()
        clearAllWaterLogs()
        clearAllWeightLogs()
    }
}
