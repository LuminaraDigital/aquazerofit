package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Transaction
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * The exercise catalog and its media.
 *
 * Split out of [CatalogDao], which had grown to carry foods, recipes,
 * exercises and coaches at once. `config/detekt/detekt.yml` records the
 * decision: the interface limit was raised to 21 for `thumbnailsFor` on the
 * condition that "the next query it grows should split the exercise catalog
 * into its own DAO rather than move this again". The scaling work added four
 * queries, so this is that split rather than a fourth bump of the threshold.
 *
 * The tables are unchanged and no migration is involved — this moves method
 * declarations between interfaces, which Room generates against the same
 * schema either way.
 */
@Dao
interface ExerciseCatalogDao {

    @Upsert
    suspend fun upsertExercises(exercises: List<ExerciseEntity>)

    @Upsert
    suspend fun upsertExerciseMedia(media: List<ExerciseMediaEntity>)

    @Query("DELETE FROM exercise_media WHERE exerciseId IN (:exerciseIds)")
    suspend fun clearMediaFor(exerciseIds: List<String>)

    /**
     * One page of the library, with every filter applied in SQL.
     *
     * Muscle and equipment used to be filtered in memory, which forced the
     * caller to pull a fixed 2000-row window and post-filter it: above that the
     * corpus was silently unreachable and the match total under-reported. The
     * wger import takes this table past 800 rows, so the window was a cliff
     * waiting to be crossed.
     *
     * The CSV columns are matched by wrapping both sides in commas, so
     * `,lats,` cannot match `,lat,` the way a bare `LIKE '%lat%'` would. LIKE
     * is ASCII-case-insensitive in SQLite, which is what the old
     * `equals(ignoreCase = true)` muscle comparison did; equipment values are
     * enum names on both sides, so the looser comparison cannot widen a match.
     *
     * No index helps a leading-wildcard LIKE, and none is added: the scan is
     * over a corpus in the hundreds and it happens once per page rather than
     * once per row per keystroke.
     */
    @Query(
        "SELECT * FROM exercises WHERE (:category IS NULL OR category = :category) " +
            "AND name LIKE '%' || :query || '%' " +
            "AND (:muscle IS NULL OR ',' || primaryMusclesCsv || ',' LIKE '%,' || :muscle || ',%') " +
            "AND (:equipment IS NULL OR ',' || equipmentCsv || ',' LIKE '%,' || :equipment || ',%') " +
            "ORDER BY name LIMIT :limit OFFSET :offset",
    )
    fun exercisesPage(
        query: String,
        category: String?,
        muscle: String?,
        equipment: String?,
        limit: Int,
        offset: Int,
    ): Flow<List<ExerciseEntity>>

    /**
     * How many rows [exercisesPage] would return unpaged. Predicates are kept
     * character-for-character identical to it — a count that drifts from its
     * page query is a paging bug that only shows up at the last page.
     */
    @Query(
        "SELECT COUNT(*) FROM exercises WHERE (:category IS NULL OR category = :category) " +
            "AND name LIKE '%' || :query || '%' " +
            "AND (:muscle IS NULL OR ',' || primaryMusclesCsv || ',' LIKE '%,' || :muscle || ',%') " +
            "AND (:equipment IS NULL OR ',' || equipmentCsv || ',' LIKE '%,' || :equipment || ',%')",
    )
    fun exercisesMatching(
        query: String,
        category: String?,
        muscle: String?,
        equipment: String?,
    ): Flow<Int>

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

    @Query("DELETE FROM exercise_media WHERE exerciseId IN (SELECT id FROM exercises WHERE cachedAt < :staleBefore)")
    suspend fun clearMediaForExercisesStaleBefore(staleBefore: Long)

    @Query("DELETE FROM exercises WHERE cachedAt < :staleBefore")
    suspend fun deleteExercisesStaleBefore(staleBefore: Long): Int

    /**
     * Drop exercises the server no longer serves, and their media with them.
     *
     * The refresh was upsert-only, so a row retired upstream stayed in the
     * cache forever — searchable, openable, and never coming back to life. The
     * wger import retires the legacy `wger-1xx` seeds on its first run, so this
     * stops being theoretical the day that import lands.
     *
     * Staleness is a generation stamp rather than an id list: every row written
     * by one refresh pass carries that pass's timestamp, so anything older did
     * not appear in it. An `id NOT IN (:ids)` would say the same thing but bind
     * one variable per exercise, and SQLite's default ceiling is 999 — it would
     * start throwing at exactly the corpus size this work exists to support.
     *
     * Media goes first: once the exercise rows are gone there is no way left to
     * find the media that belonged to them.
     */
    @Transaction
    suspend fun pruneExercisesStaleBefore(staleBefore: Long): Int {
        clearMediaForExercisesStaleBefore(staleBefore)
        return deleteExercisesStaleBefore(staleBefore)
    }
}
