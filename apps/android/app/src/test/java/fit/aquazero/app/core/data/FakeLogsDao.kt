package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.LogsDao
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.database.WaterLogEntity
import fit.aquazero.app.core.database.WeightLogEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/**
 * In-memory [LogsDao] honoring the same WHERE-clause semantics as Room — in
 * particular the `deleted = 0` filter, which is the whole point of the
 * reconciliation tests: a fake that quietly returns soft-deleted rows from
 * [mealLogsForDateOnce] would pass a broken implementation.
 *
 * Water and weight are stubs; nothing under test writes them.
 */
internal class FakeLogsDao : LogsDao {

    val meals = MutableStateFlow<List<MealLogEntity>>(emptyList())

    override suspend fun upsertMealLog(log: MealLogEntity) {
        meals.value = meals.value.filterNot { it.localId == log.localId } + log
    }

    override fun mealLogsForDate(localDate: String): Flow<List<MealLogEntity>> =
        meals.map { rows -> rows.filter { it.localDate == localDate && !it.deleted }.sortedBy { it.loggedAt } }

    override suspend fun mealLogsForDateOnce(localDate: String): List<MealLogEntity> =
        meals.value.filter { it.localDate == localDate && !it.deleted }.sortedBy { it.loggedAt }

    override suspend fun mealLogsForDateOnceIncludingDeleted(localDate: String): List<MealLogEntity> =
        meals.value.filter { it.localDate == localDate }.sortedBy { it.loggedAt }

    override suspend fun mealLogByLocalId(localId: String): MealLogEntity? =
        meals.value.firstOrNull { it.localId == localId }

    override suspend fun markMealLogSynced(localId: String, serverId: String?, state: SyncState) {
        meals.value = meals.value.map {
            if (it.localId == localId) it.copy(serverId = serverId, syncState = state) else it
        }
    }

    override suspend fun setMealLogState(localId: String, state: SyncState) {
        meals.value = meals.value.map { if (it.localId == localId) it.copy(syncState = state) else it }
    }

    override suspend fun deleteMealLogRow(localId: String) {
        meals.value = meals.value.filterNot { it.localId == localId }
    }

    // ----- water / weight: never touched by reconciliation -----

    override suspend fun upsertWaterLog(log: WaterLogEntity) = Unit

    override fun waterTotalForDate(localDate: String): Flow<Int> = MutableStateFlow(0)

    override suspend fun waterTotalForDateOnce(localDate: String): Int = 0

    override suspend fun markWaterLogSynced(localId: String, serverId: String?, state: SyncState) = Unit

    override suspend fun upsertWeightLog(log: WeightLogEntity) = Unit

    override suspend fun weightLogForDate(localDate: String): WeightLogEntity? = null

    override fun recentWeightLogs(limit: Int): Flow<List<WeightLogEntity>> =
        MutableStateFlow<List<WeightLogEntity>>(emptyList())

    override suspend fun markWeightLogSynced(localId: String, serverId: String?, state: SyncState) = Unit

    override suspend fun clearAllMealLogs() {
        meals.value = emptyList()
    }

    override suspend fun clearAllWaterLogs() = Unit

    override suspend fun clearAllWeightLogs() = Unit

    override suspend fun clearAllLogs() {
        clearAllMealLogs()
    }
}
