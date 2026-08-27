package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/** DAO for the three offline-writable log streams. */
@Dao
interface LogsDao {

    // ----- meal logs -----

    @Upsert
    suspend fun upsertMealLog(log: MealLogEntity)

    @Query("SELECT * FROM meal_logs WHERE localDate = :localDate AND deleted = 0 ORDER BY loggedAt")
    fun mealLogsForDate(localDate: String): Flow<List<MealLogEntity>>

    @Query("SELECT * FROM meal_logs WHERE localDate = :localDate AND deleted = 0 ORDER BY loggedAt")
    suspend fun mealLogsForDateOnce(localDate: String): List<MealLogEntity>

    @Query("SELECT * FROM meal_logs WHERE localId = :localId")
    suspend fun mealLogByLocalId(localId: String): MealLogEntity?

    @Query("UPDATE meal_logs SET serverId = :serverId, syncState = :state WHERE localId = :localId")
    suspend fun markMealLogSynced(localId: String, serverId: String?, state: SyncState)

    @Query("UPDATE meal_logs SET syncState = :state WHERE localId = :localId")
    suspend fun setMealLogState(localId: String, state: SyncState)

    @Query("DELETE FROM meal_logs WHERE localId = :localId")
    suspend fun deleteMealLogRow(localId: String)

    // ----- water logs -----

    @Upsert
    suspend fun upsertWaterLog(log: WaterLogEntity)

    @Query("SELECT COALESCE(SUM(amountMl), 0) FROM water_logs WHERE localDate = :localDate")
    fun waterTotalForDate(localDate: String): Flow<Int>

    @Query("SELECT COALESCE(SUM(amountMl), 0) FROM water_logs WHERE localDate = :localDate")
    suspend fun waterTotalForDateOnce(localDate: String): Int

    @Query("UPDATE water_logs SET serverId = :serverId, syncState = :state WHERE localId = :localId")
    suspend fun markWaterLogSynced(localId: String, serverId: String?, state: SyncState)

    // ----- weight logs -----

    @Upsert
    suspend fun upsertWeightLog(log: WeightLogEntity)

    @Query("SELECT * FROM weight_logs WHERE localDate = :localDate")
    suspend fun weightLogForDate(localDate: String): WeightLogEntity?

    @Query("SELECT * FROM weight_logs ORDER BY localDate DESC LIMIT :limit")
    fun recentWeightLogs(limit: Int): Flow<List<WeightLogEntity>>

    @Query("UPDATE weight_logs SET serverId = :serverId, syncState = :state WHERE localId = :localId")
    suspend fun markWeightLogSynced(localId: String, serverId: String?, state: SyncState)
}
