package fit.aquazero.app.core.database

import androidx.room3.Entity
import androidx.room3.Index
import androidx.room3.PrimaryKey

/**
 * Keyed progress snapshots: one whole server document per row, as JSON.
 *
 * The table began as the single `GET /progress/summary` snapshot, which is
 * why the key column is called `userId`; it is a document key, and the
 * column keeps its name because renaming it is a schema change and v1 forbids
 * destructive migration. Every read goes through a key-filtered query in
 * [ProgressDao], so two documents can never be read for each other, and the
 * sign-out purge clears every key at once.
 */
@Entity(tableName = "progress_summary")
data class ProgressSummaryEntity(
    /** Document key: [PROGRESS_SUMMARY_KEY] or [FIGHT_RECORD_KEY]. */
    @PrimaryKey val userId: String,
    val docJson: String,
    val cachedAt: Long = 0L,
) {
    companion object {
        /** `GET /progress/summary`, written by `ProgressRepository`. */
        const val PROGRESS_SUMMARY_KEY = "me"

        /** The `GET /fight-record` envelope, written by `FightRecordRepository`. */
        const val FIGHT_RECORD_KEY = "fight-record"
    }
}

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
