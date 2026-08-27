package fit.aquazero.app.core.database

import androidx.room3.Entity
import androidx.room3.Index
import androidx.room3.PrimaryKey

/** Snapshot of `GET /progress/summary` (whole document as JSON). */
@Entity(tableName = "progress_summary")
data class ProgressSummaryEntity(
    @PrimaryKey val userId: String,
    val docJson: String,
    val cachedAt: Long = 0L,
)

/** One cached trend point for a named series (weight, kcal, …). */
@Entity(
    tableName = "trend_points",
    indices = [Index(value = ["series", "date"], unique = true)],
)
data class TrendPointEntity(
    @PrimaryKey(autoGenerate = true) val rowId: Long = 0L,
    /** Series key, e.g. `weight`, `kcal`, `proteinG`. */
    val series: String,
    val date: String,
    val value: Double,
)
