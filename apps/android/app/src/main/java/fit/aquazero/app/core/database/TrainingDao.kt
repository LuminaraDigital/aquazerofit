package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/** DAO for training plans and workout sessions (incl. in-session drafts). */
@Dao
interface TrainingDao {

    @Upsert
    suspend fun upsertPlan(plan: TrainingPlanEntity)

    @Query("UPDATE training_plans SET isCurrent = 0")
    suspend fun clearCurrentPlan()

    @Query("SELECT * FROM training_plans WHERE isCurrent = 1 LIMIT 1")
    fun currentPlan(): Flow<TrainingPlanEntity?>

    @Upsert
    suspend fun upsertSession(session: WorkoutSessionEntity)

    @Query("SELECT * FROM workout_sessions WHERE id = :id")
    suspend fun sessionById(id: String): WorkoutSessionEntity?

    @Query("SELECT * FROM workout_sessions WHERE localDate = :localDate LIMIT 1")
    fun sessionForDate(localDate: String): Flow<WorkoutSessionEntity?>

    @Query(
        "UPDATE workout_sessions SET draftExerciseIndex = :exerciseIndex, " +
            "draftSetLogsJson = :setLogsJson, draftUpdatedAtMs = :nowMs WHERE id = :id",
    )
    suspend fun saveDraft(id: String, exerciseIndex: Int, setLogsJson: String?, nowMs: Long)

    @Query(
        "UPDATE workout_sessions SET draftExerciseIndex = -1, draftSetLogsJson = NULL, " +
            "draftUpdatedAtMs = 0 WHERE id = :id",
    )
    suspend fun clearDraft(id: String)
}
