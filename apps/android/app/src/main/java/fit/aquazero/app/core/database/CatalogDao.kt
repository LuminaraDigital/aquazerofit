package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Transaction
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/** DAO for the server-owned catalog caches. */
@Dao
interface CatalogDao {

    // ----- foods (recent/frequent cache; corpus search stays server-side) -----

    @Upsert
    suspend fun upsertFoods(foods: List<FoodEntity>)

    @Query("SELECT * FROM foods WHERE name LIKE '%' || :query || '%' ORDER BY useCount DESC LIMIT :limit")
    suspend fun searchCachedFoods(query: String, limit: Int): List<FoodEntity>

    @Query("SELECT * FROM foods WHERE id = :id")
    suspend fun foodById(id: String): FoodEntity?

    @Query("SELECT * FROM foods ORDER BY lastUsedAt DESC LIMIT :limit")
    fun recentFoods(limit: Int): Flow<List<FoodEntity>>

    @Query("UPDATE foods SET lastUsedAt = :nowMs, useCount = useCount + 1 WHERE id = :id")
    suspend fun touchFood(id: String, nowMs: Long)

    // ----- recipes -----

    @Upsert
    suspend fun upsertRecipes(recipes: List<RecipeEntity>)

    @Query("SELECT * FROM recipes ORDER BY name")
    fun recipes(): Flow<List<RecipeEntity>>

    @Query("SELECT * FROM recipes WHERE id = :id")
    suspend fun recipeById(id: String): RecipeEntity?

    // ----- exercises -----

    @Upsert
    suspend fun upsertExercises(exercises: List<ExerciseEntity>)

    @Upsert
    suspend fun upsertExerciseMedia(media: List<ExerciseMediaEntity>)

    @Query("DELETE FROM exercise_media WHERE exerciseId IN (:exerciseIds)")
    suspend fun clearMediaFor(exerciseIds: List<String>)

    @Query(
        "SELECT * FROM exercises WHERE (:category IS NULL OR category = :category) " +
            "AND name LIKE '%' || :query || '%' ORDER BY name LIMIT :limit OFFSET :offset",
    )
    fun exercisesPage(query: String, category: String?, limit: Int, offset: Int): Flow<List<ExerciseEntity>>

    @Query("SELECT * FROM exercises WHERE id = :id")
    suspend fun exerciseById(id: String): ExerciseEntity?

    @Query("SELECT * FROM exercise_media WHERE exerciseId = :exerciseId")
    suspend fun mediaFor(exerciseId: String): List<ExerciseMediaEntity>

    /**
     * One image per exercise for the library list, chosen as the lowest
     * `rowId` so the thumbnail is stable across refreshes rather than
     * whichever row SQLite happened to return.
     *
     * Scoped to the ids actually on screen. The library caches the whole
     * corpus and pages it in memory, so joining media into [exercisesPage]
     * would decode media for up to `CACHE_WINDOW` rows on every keystroke to
     * show twenty-four.
     */
    @Query(
        "SELECT exerciseId, url, source, licence, licenceAuthor, attributionText, " +
            "isAiGenerated, MIN(rowId) AS rowId FROM exercise_media " +
            "WHERE exerciseId IN (:exerciseIds) AND kind = 'image' GROUP BY exerciseId",
    )
    suspend fun thumbnailsFor(exerciseIds: List<String>): List<ExerciseThumbnail>

    @Query("SELECT COUNT(*) FROM exercises")
    suspend fun exerciseCount(): Int

    /** Replace an exercise's media atomically alongside the exercise rows. */
    @Transaction
    suspend fun replaceExercises(
        exercises: List<ExerciseEntity>,
        media: List<ExerciseMediaEntity>,
    ) {
        upsertExercises(exercises)
        clearMediaFor(exercises.map { it.id })
        if (media.isNotEmpty()) upsertExerciseMedia(media)
    }

    // ----- achievements & coaches -----

    @Upsert
    suspend fun upsertAchievementDefinitions(definitions: List<AchievementDefinitionEntity>)

    @Query("SELECT * FROM achievement_definitions")
    fun achievementDefinitions(): Flow<List<AchievementDefinitionEntity>>

    @Upsert
    suspend fun upsertCoaches(coaches: List<CoachEntity>)

    @Query("SELECT * FROM coaches")
    fun coaches(): Flow<List<CoachEntity>>
}
