package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Transaction
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/** DAO for the progress summary snapshot and trend series caches. */
@Dao
interface ProgressDao {

    @Upsert
    suspend fun upsertSummary(summary: ProgressSummaryEntity)

    @Query("SELECT * FROM progress_summary LIMIT 1")
    fun summary(): Flow<ProgressSummaryEntity?>

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
}
