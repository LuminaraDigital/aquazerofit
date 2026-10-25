package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Transaction
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/** DAO for the keyed progress snapshots and the trend series caches. */
@Dao
interface ProgressDao {

    /** Writes any keyed snapshot; the row's key decides which document it is. */
    @Upsert
    suspend fun upsertSummary(summary: ProgressSummaryEntity)

    /**
     * One snapshot, by its key (see [ProgressSummaryEntity] for the keys).
     * The only read: the old unfiltered `LIMIT 1` was correct while the table
     * held one document, and with the Fight Record snapshot beside it could
     * hand the progress screen a belt ladder to decode.
     */
    @Query("SELECT * FROM progress_summary WHERE userId = :key")
    fun snapshot(key: String): Flow<ProgressSummaryEntity?>

    @Upsert
    suspend fun upsertTrendPoints(points: List<TrendPointEntity>)

    @Query("DELETE FROM trend_points WHERE series = :series")
    suspend fun clearSeries(series: String)

    @Query("SELECT * FROM trend_points WHERE series = :series ORDER BY date")
    fun series(series: String): Flow<List<TrendPointEntity>>

    /** Replace a whole series atomically (server wins on conflict). */
    @Transaction
    suspend fun replaceSeries(series: String, points: List<TrendPointEntity>) {
        clearSeries(series)
        if (points.isNotEmpty()) upsertTrendPoints(points)
    }

    /** Every key at once: sign-out must not leave one user's belts for the next. */
    @Query("DELETE FROM progress_summary")
    suspend fun clearSummary()

    @Query("DELETE FROM trend_points")
    suspend fun clearAllTrendPoints()

    @Transaction
    suspend fun clearAllProgress() {
        clearSummary()
        clearAllTrendPoints()
    }
}
