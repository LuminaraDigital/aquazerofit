package fit.aquazero.app.core.database

import androidx.room3.ColumnTypeConverters
import androidx.room3.Database
import androidx.room3.RoomDatabase

/**
 * The offline-first store (plan §4). Room is the source of truth for unsynced
 * user data, so:
 *  - `exportSchema = true` with schema JSON checked into VCS (`app/schemas`),
 *  - destructive migration is FORBIDDEN — every schema change from v1 onward
 *    ships a `Migration` with tests, and migrations must preserve pending
 *    outbox ops (their `schemaVersion` column exists for exactly that).
 */
@Database(
    version = 1,
    exportSchema = true,
    entities = [
        // Catalog
        FoodEntity::class,
        RecipeEntity::class,
        ExerciseEntity::class,
        ExerciseMediaEntity::class,
        AchievementDefinitionEntity::class,
        CoachEntity::class,
        // Offline-writable logs
        MealLogEntity::class,
        WaterLogEntity::class,
        WeightLogEntity::class,
        // Account
        UserEntity::class,
        ProfileEntity::class,
        TargetsEntity::class,
        ConsentEntity::class,
        EntitlementsEntity::class,
        // Training
        TrainingPlanEntity::class,
        WorkoutSessionEntity::class,
        // Progress
        ProgressSummaryEntity::class,
        TrendPointEntity::class,
        // Chat / memory / challenges
        ChatSessionEntity::class,
        ChatMessageEntity::class,
        MemoryFactEntity::class,
        ChallengeEntity::class,
        // Infra
        OutboxEntity::class,
    ],
)
@ColumnTypeConverters(Converters::class)
abstract class AzfDatabase : RoomDatabase() {
    abstract fun logsDao(): LogsDao
    abstract fun outboxDao(): OutboxDao
    abstract fun catalogDao(): CatalogDao
    abstract fun userDao(): UserDao
    abstract fun trainingDao(): TrainingDao
    abstract fun progressDao(): ProgressDao
    abstract fun chatDao(): ChatDao
    abstract fun userOverlayDao(): UserOverlayDao
}
