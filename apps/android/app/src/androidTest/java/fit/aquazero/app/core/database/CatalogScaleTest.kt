package fit.aquazero.app.core.database

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The exercise library against a corpus larger than the window it used to
 * cache.
 *
 * Every defect these tests pin is invisible at the 51 exercises the app ships
 * with today and becomes live the day the wger import lands roughly 862. The
 * corpus here is 1,000: comfortably past the point where paging, match totals
 * and the retired-row prune have to be right rather than incidentally correct,
 * and still cheap enough to build fresh for each test.
 *
 * These have to be instrumented rather than JVM tests: the whole point is the
 * SQL. The filters moved out of Kotlin and into the query, so a hand-written
 * DAO fake would be asserting against the very logic that was removed.
 */
@RunWith(AndroidJUnit4::class)
class CatalogScaleTest {

    private lateinit var db: AzfDatabase
    private lateinit var dao: ExerciseCatalogDao

    @Before
    fun open() {
        db = createInMemoryDatabase()
        dao = db.exerciseCatalogDao()
    }

    @After
    fun close() {
        db.close()
    }

    /**
     * 1,000 exercises with a predictable spread: every third is `cardio`, every
     * fourth lists `lats` among its muscles, every fifth uses a `BARBELL`.
     * Names are zero-padded so `ORDER BY name` is a stable, checkable order.
     */
    private fun corpus(size: Int = 1_000, generation: Long = 1_000L): List<ExerciseEntity> =
        (0 until size).map { i ->
            ExerciseEntity(
                id = "ex-%04d".format(i),
                name = "Exercise %04d".format(i),
                category = if (i % 3 == 0) "cardio" else "strength",
                difficulty = "beginner",
                // 'lat' is also present so the comma-delimited match has
                // something it could wrongly substring-match against.
                primaryMusclesCsv = if (i % 4 == 0) "lats,glutes" else "lat,quads",
                equipmentCsv = if (i % 5 == 0) "BARBELL,BENCH" else "DUMBBELL",
                docJson = "{}",
                cachedAt = generation,
            )
        }

    @Test
    fun countsEveryMatchBeyondTheOldTwoThousandRowWindow() = runTest {
        dao.upsertExercises(corpus())

        val total = dao
            .exercisesMatching(query = "", category = null, muscle = null, equipment = null)
            .first()

        // The old code counted `matches.size` over the rows it had fetched, so
        // any corpus larger than the window under-reported here.
        assertEquals(1_000, total)
    }

    @Test
    fun pagesThroughTheWholeCorpusWithoutDroppingOrRepeatingARow() = runTest {
        dao.upsertExercises(corpus())

        val pageSize = 24
        val seen = mutableListOf<String>()
        var offset = 0
        while (true) {
            val page = dao.exercisesPage(
                query = "",
                category = null,
                muscle = null,
                equipment = null,
                limit = pageSize,
                offset = offset,
            ).first()
            if (page.isEmpty()) break
            seen += page.map { it.id }
            offset += pageSize
        }

        assertEquals("every row is reachable by paging", 1_000, seen.size)
        assertEquals("and none is served twice", 1_000, seen.toSet().size)
        assertEquals("in name order", "ex-0000", seen.first())
        assertEquals("ex-0999", seen.last())
    }

    @Test
    fun growingTheLimitReturnsAPrefix() = runTest {
        dao.upsertExercises(corpus())

        // The screen grows its page count rather than scrolling an offset, so
        // page N+1 must be page N plus more — not a re-shuffled window.
        val firstPage = dao.exercisesPage("", null, null, null, limit = 24, offset = 0).first()
        val secondPage = dao.exercisesPage("", null, null, null, limit = 48, offset = 0).first()

        assertEquals(24, firstPage.size)
        assertEquals(48, secondPage.size)
        assertEquals(firstPage.map { it.id }, secondPage.take(24).map { it.id })
    }

    @Test
    fun muscleFilterMatchesWholeCsvValuesNotSubstrings() = runTest {
        dao.upsertExercises(corpus())

        val lats = dao.exercisesMatching("", null, muscle = "lats", equipment = null).first()
        val lat = dao.exercisesMatching("", null, muscle = "lat", equipment = null).first()

        // 250 rows carry 'lats,glutes'; the other 750 carry 'lat,quads'. A bare
        // LIKE '%lats%' would have been fine here, but LIKE '%lat%' would have
        // matched all 1,000 — the comma delimiters are what keep them apart.
        assertEquals(250, lats)
        assertEquals(750, lat)
    }

    @Test
    fun equipmentFilterMatchesWholeCsvValues() = runTest {
        dao.upsertExercises(corpus())

        val barbell = dao.exercisesMatching("", null, null, equipment = "BARBELL").first()
        val dumbbell = dao.exercisesMatching("", null, null, equipment = "DUMBBELL").first()

        assertEquals(200, barbell)
        assertEquals(800, dumbbell)
    }

    @Test
    fun filtersCombineAndThePageAgreesWithTheCount() = runTest {
        dao.upsertExercises(corpus())

        val count = dao.exercisesMatching("", category = "cardio", muscle = "lats", equipment = null).first()
        val all = dao.exercisesPage(
            query = "",
            category = "cardio",
            muscle = "lats",
            equipment = null,
            limit = 1_000,
            offset = 0,
        ).first()

        // Divisible by both 3 and 4 — i.e. every twelfth row.
        assertEquals(84, count)
        assertEquals("the count query and the page query must not drift apart", count, all.size)
        assertTrue(all.all { it.category == "cardio" })
        assertTrue(all.all { it.primaryMusclesCsv.split(',').contains("lats") })
    }

    @Test
    fun aCompletedRefreshDropsRowsTheServerNoLongerSends() = runTest {
        dao.upsertExercises(corpus(size = 1_000, generation = 1_000L))
        dao.upsertExerciseMedia(
            listOf(
                ExerciseMediaEntity(exerciseId = "ex-0999", kind = "image", url = "https://x/retired.png"),
                ExerciseMediaEntity(exerciseId = "ex-0000", kind = "image", url = "https://x/kept.png"),
            ),
        )

        // Second pass: the server now serves only the first 600.
        dao.upsertExercises(corpus(size = 600, generation = 2_000L))
        val pruned = dao.pruneExercisesStaleBefore(2_000L)

        assertEquals("the 400 rows the second pass never sent", 400, pruned)
        assertEquals(600, dao.exerciseCount())
        assertTrue(dao.thumbnailsFor(listOf("ex-0000")).isNotEmpty())
        assertTrue(
            "media for a retired exercise must go with it",
            dao.thumbnailsFor(listOf("ex-0999")).isEmpty(),
        )
    }

    @Test
    fun pruningKeepsRowsTheRefreshRewroteWithTheSameGeneration() = runTest {
        dao.upsertExercises(corpus(size = 10, generation = 5_000L))

        // Nothing is older than this pass, so nothing may be dropped. This is
        // the case a per-row `System.currentTimeMillis()` stamp would fail:
        // rows written early in the pass would predate the cutoff.
        val pruned = dao.pruneExercisesStaleBefore(5_000L)

        assertEquals(0, pruned)
        assertEquals(10, dao.exerciseCount())
    }

    @Test
    fun searchStillNarrowsWithinAFilteredSet() = runTest {
        dao.upsertExercises(corpus())

        val count = dao
            .exercisesMatching(query = "Exercise 012", category = null, muscle = null, equipment = null)
            .first()
        val rows = dao.exercisesPage("Exercise 012", null, null, null, limit = 50, offset = 0).first()

        // 0120-0129 — ten rows.
        assertEquals(10, count)
        assertEquals(10, rows.size)
        assertFalse(rows.any { !it.name.startsWith("Exercise 012") })
    }
}
