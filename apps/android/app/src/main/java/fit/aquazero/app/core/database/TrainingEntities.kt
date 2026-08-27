package fit.aquazero.app.core.database

import androidx.room3.Entity
import androidx.room3.Index
import androidx.room3.PrimaryKey

/** Cached `TrainingPlan` — the plan document is stored whole as JSON. */
@Entity(tableName = "training_plans")
data class TrainingPlanEntity(
    @PrimaryKey val id: String,
    val name: String,
    val startDate: String = "",
    val currentIteration: Int = 1,
    /** Full `TrainingPlan` document JSON. */
    val docJson: String,
    val isCurrent: Boolean = false,
    val cachedAt: Long = 0L,
)

/**
 * Cached `WorkoutSession` plus in-session draft state so process death
 * mid-workout loses nothing (plan Phase 4 upgrade — columns exist from v1
 * so no migration is needed when the feature lands).
 */
@Entity(
    tableName = "workout_sessions",
    indices = [Index("localDate")],
)
data class WorkoutSessionEntity(
    @PrimaryKey val id: String,
    val planId: String? = null,
    val focus: String = "",
    val status: String = "pending",
    val localDate: String = "",
    /** Full `WorkoutSession` document JSON. */
    val docJson: String,
    // ----- in-session draft (survives process death) -----
    /** Index of the exercise the user is currently on, or -1 when not started. */
    val draftExerciseIndex: Int = -1,
    /** Per-set actuals recorded so far, as JSON. */
    val draftSetLogsJson: String? = null,
    /** Epoch millis when the session draft was last touched. */
    val draftUpdatedAtMs: Long = 0L,
    val cachedAt: Long = 0L,
)
