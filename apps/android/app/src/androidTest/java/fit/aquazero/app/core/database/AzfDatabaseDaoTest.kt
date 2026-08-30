package fit.aquazero.app.core.database

import androidx.test.ext.junit.runners.AndroidJUnit4
import fit.aquazero.app.core.model.MealLogItemDto
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Every DAO against real SQLite: the database opens, each table takes a write,
 * and each read gives the row back.
 *
 * This is the test that would have caught a database that does not open at
 * all. Room generates its implementation at build time, so a bad converter, a
 * column type it cannot map, or an index on a column that no longer exists is
 * a *runtime* failure on first access — and until now nothing on the JVM side
 * touched a real Room implementation, so the first person to find out would
 * have been a user.
 */
@RunWith(AndroidJUnit4::class)
class AzfDatabaseDaoTest {

    private lateinit var db: AzfDatabase

    @Before
    fun open() {
        db = createInMemoryDatabase()
    }

    @After
    fun close() {
        db.close()
    }

    @Test
    fun mealLogRoundTripsThroughTheJsonItemConverter() = runTest {
        val items = listOf(
            MealLogItemDto(
                foodId = "food_oats",
                name = "Oats",
                grams = 80.0,
                kcal = 300.0,
                proteinG = 10.5,
                carbsG = 54.0,
                fatG = 6.0,
            ),
        )
        db.logsDao().upsertMealLog(mealLog(localId = "m1", items = items))

        val stored = db.logsDao().mealLogByLocalId("m1")
        assertNotNull(stored)
        // The converter goes through the same tolerant AzfJson the wire uses;
        // a field silently dropped here is a meal the user re-enters.
        assertEquals(items, stored!!.items)
        assertEquals(SyncState.PENDING, stored.syncState)
    }

    @Test
    fun softDeletedMealLogsLeaveTheDayViewButStayVisibleToReconciliation() = runTest {
        val dao = db.logsDao()
        dao.upsertMealLog(mealLog(localId = "keep", localDate = TODAY))
        dao.upsertMealLog(mealLog(localId = "gone", localDate = TODAY).copy(deleted = true))

        // The `deleted = 0` predicate is the whole soft-delete contract: a row
        // whose DELETE op is still draining must not reappear in the timeline,
        // and must not be resurrected by the reconciler either.
        assertEquals(listOf("keep"), dao.mealLogsForDateOnce(TODAY).map { it.localId })
        assertEquals(
            listOf("gone", "keep"),
            dao.mealLogsForDateOnceIncludingDeleted(TODAY).map { it.localId }.sorted(),
        )
        assertEquals(listOf("keep"), dao.mealLogsForDate(TODAY).first().map { it.localId })
    }

    @Test
    fun waterTotalSumsTheDayAndIsZeroWhenEmpty() = runTest {
        val dao = db.logsDao()
        // COALESCE, not null: an empty day is 0 ml, and a null here would
        // crash the non-null Int the dashboard collects.
        assertEquals(0, dao.waterTotalForDateOnce(TODAY))

        dao.upsertWaterLog(waterLog("w1", 250))
        dao.upsertWaterLog(waterLog("w2", 500))
        assertEquals(750, dao.waterTotalForDateOnce(TODAY))
        assertEquals(750, dao.waterTotalForDate(TODAY).first())
    }

    @Test
    fun sameDayWeightRelogReplacesTheRow() = runTest {
        val dao = db.logsDao()
        dao.upsertWeightLog(weightLog("wt1", 82.4))
        // `localDate` is a UNIQUE index mirroring the server's upsert-per-date
        // semantics. Without the replace, a second weigh-in on one day either
        // throws a constraint violation or leaves two rows for one date and the
        // chart picks whichever SQLite returns first.
        dao.upsertWeightLog(weightLog("wt1", 81.9))

        assertEquals(81.9, dao.weightLogForDate(TODAY)!!.weightKg, 0.0001)
        assertEquals(1, dao.recentWeightLogs(limit = 10).first().size)
    }

    @Test
    fun catalogSearchMatchesOnSubstringAndFiltersByCategory() = runTest {
        val dao = db.catalogDao()
        dao.upsertExercises(
            listOf(
                exercise(id = "ex_bench", name = "Barbell bench press", category = "strength"),
                exercise(id = "ex_row", name = "Cable row", category = "strength"),
                exercise(id = "ex_run", name = "Treadmill run", category = "cardio"),
            ),
        )

        val all = dao.exercisesPage(query = "", category = null, limit = 50, offset = 0).first()
        assertEquals(3, all.size)
        assertEquals(3, dao.exerciseCount())

        val cardio = dao.exercisesPage(query = "", category = "cardio", limit = 50, offset = 0).first()
        assertEquals(listOf("ex_run"), cardio.map { it.id })

        val searched = dao.exercisesPage(query = "bench", category = null, limit = 50, offset = 0).first()
        assertEquals(listOf("ex_bench"), searched.map { it.id })
    }

    @Test
    fun thumbnailPickIsStableAndImageOnly() = runTest {
        val dao = db.catalogDao()
        dao.upsertExercises(listOf(exercise(id = "ex_bench", name = "Bench press")))
        dao.upsertExerciseMedia(
            listOf(
                media("ex_bench", kind = "video", url = "/media/bench.mp4"),
                media("ex_bench", kind = "image", url = "/media/bench-1.png", author = "Everkinetic"),
                media("ex_bench", kind = "image", url = "/media/bench-2.png"),
            ),
        )

        val thumbnails = dao.thumbnailsFor(listOf("ex_bench"))
        assertEquals(1, thumbnails.size)
        // Lowest rowId wins, so the library row does not shuffle its picture
        // between refreshes — and a video is never offered as a thumbnail.
        assertEquals("/media/bench-1.png", thumbnails.single().url)
        // CC-BY-SA: the credit travels with the picture, not with the exercise.
        assertEquals("Everkinetic", thumbnails.single().licenceAuthor)
    }

    @Test
    fun replaceExercisesSwapsMediaWithoutOrphaningTheOldRows() = runTest {
        val dao = db.catalogDao()
        dao.replaceExercises(
            exercises = listOf(exercise(id = "ex_bench", name = "Bench press")),
            media = listOf(media("ex_bench", kind = "image", url = "/media/old.png")),
        )
        dao.replaceExercises(
            exercises = listOf(exercise(id = "ex_bench", name = "Bench press")),
            media = listOf(media("ex_bench", kind = "image", url = "/media/new.png")),
        )

        // A catalog refresh that appended instead of replacing would grow the
        // media table without bound and reintroduce withdrawn imagery.
        assertEquals(listOf("/media/new.png"), dao.mediaFor("ex_bench").map { it.url })
    }

    @Test
    fun foodRecencyBookkeepingSurvivesTheUpsert() = runTest {
        val dao = db.catalogDao()
        dao.upsertFoods(listOf(food("food_oats", "Oats"), food("food_rice", "Rice")))
        dao.touchFood("food_rice", nowMs = 5_000L)
        dao.touchFood("food_rice", nowMs = 9_000L)

        assertEquals(2, dao.searchCachedFoods("", limit = 10).size)
        assertEquals(listOf("food_rice", "food_oats"), dao.recentFoods(limit = 10).first().map { it.id })
        assertEquals(2, dao.foodById("food_rice")!!.useCount)
    }

    @Test
    fun recipesAndAchievementsAndCoachesRoundTrip() = runTest {
        val dao = db.catalogDao()
        dao.upsertRecipes(listOf(RecipeEntity(id = "r1", name = "Oat bowl", docJson = "{}")))
        dao.upsertAchievementDefinitions(
            listOf(AchievementDefinitionEntity(id = "a1", name = "First log")),
        )
        dao.upsertCoaches(listOf(CoachEntity(coachId = "akin", unlocked = true)))

        assertEquals("Oat bowl", dao.recipeById("r1")!!.name)
        assertEquals(1, dao.recipes().first().size)
        assertEquals(1, dao.achievementDefinitions().first().size)
        assertTrue(dao.coaches().first().single().unlocked)
    }

    @Test
    fun userTablesAreSingletonRowsAndClearOnDifferentUserSignIn() = runTest {
        val dao = db.userDao()
        dao.upsertUser(UserEntity(id = "u1", email = "a@example.com", displayName = "A"))
        dao.upsertProfile(ProfileEntity(userId = "u1", weightKg = 80.0, goal = "lose", docJson = "{}"))
        dao.upsertTargets(TargetsEntity(userId = "u1", kcalTarget = 2100.0, docJson = "{}"))
        dao.upsertConsents(ConsentEntity(userId = "u1", reminders = true))
        dao.upsertEntitlements(EntitlementsEntity(userId = "u1", docJson = "{}"))

        assertEquals("u1", dao.user().first()!!.id)
        assertEquals(80.0, dao.profileOnce()!!.weightKg, 0.0001)
        assertEquals(2100.0, dao.targetsOnce()!!.kcalTarget, 0.0001)
        assertTrue(dao.consents().first()!!.reminders)
        assertNotNull(dao.entitlements().first())

        dao.clearAllAccountRows()
        assertNull(dao.user().first())
        assertNull(dao.profileOnce())
        assertNull(dao.targetsOnce())
        assertNull(dao.consents().first())
        assertNull(dao.entitlements().first())
    }

    @Test
    fun sessionDraftSurvivesAWriteAndClearsBackToNotStarted() = runTest {
        val dao = db.trainingDao()
        dao.upsertSession(session(id = "s1"))
        dao.saveDraft(id = "s1", exerciseIndex = 2, setLogsJson = "[{\"reps\":8}]", nowMs = 1_700L)

        // The draft columns are what a workout survives process death on.
        val saved = dao.sessionById("s1")!!
        assertEquals(2, saved.draftExerciseIndex)
        assertEquals("[{\"reps\":8}]", saved.draftSetLogsJson)
        assertEquals(1_700L, saved.draftUpdatedAtMs)

        dao.clearDraft("s1")
        val cleared = dao.sessionById("s1")!!
        assertEquals(-1, cleared.draftExerciseIndex)
        assertNull(cleared.draftSetLogsJson)
    }

    @Test
    fun onlyOnePlanIsCurrentAtATime() = runTest {
        val dao = db.trainingDao()
        dao.upsertPlan(TrainingPlanEntity(id = "p1", name = "Old", docJson = "{}", isCurrent = true))
        dao.clearCurrentPlan()
        dao.upsertPlan(TrainingPlanEntity(id = "p2", name = "New", docJson = "{}", isCurrent = true))

        assertEquals("p2", dao.currentPlan().first()!!.id)
    }

    @Test
    fun replaceSeriesIsAtomicPerSeries() = runTest {
        val dao = db.progressDao()
        dao.upsertSummary(ProgressSummaryEntity(userId = "u1", docJson = "{}"))
        dao.replaceSeries("weight", listOf(trend("weight", "2026-01-01", 82.0)))
        dao.replaceSeries("kcal", listOf(trend("kcal", "2026-01-01", 2100.0)))
        dao.replaceSeries("weight", listOf(trend("weight", "2026-01-02", 81.5)))

        assertNotNull(dao.summary().first())
        // Replacing one series must not touch a neighbouring one; the unique
        // (series, date) index is what makes the clear-then-insert safe.
        assertEquals(listOf("2026-01-02"), dao.series("weight").first().map { it.date })
        assertEquals(listOf("2026-01-01"), dao.series("kcal").first().map { it.date })
    }

    @Test
    fun chatMemoryAndChallengeCachesRoundTrip() = runTest {
        val dao = db.chatDao()
        dao.upsertSessions(listOf(ChatSessionEntity(id = "c1", title = "Monday", updatedAt = "2026-01-02")))
        dao.upsertMessages(
            listOf(
                ChatMessageEntity(id = "m1", sessionId = "c1", role = "user", content = "hi"),
                ChatMessageEntity(id = "m2", sessionId = "other", role = "user", content = "nope"),
            ),
        )
        dao.upsertMemoryFacts(listOf(MemoryFactEntity(id = "f1", text = "Vegetarian")))
        dao.upsertChallenges(listOf(ChallengeEntity(id = "ch1", code = "ABC123", docJson = "{}")))

        assertEquals(1, dao.sessions().first().size)
        assertEquals(listOf("m1"), dao.messages("c1").first().map { it.id })
        assertEquals(1, dao.memoryFacts().first().size)
        assertEquals("ABC123", dao.challenges().first().single().code)

        dao.clearMemoryFacts()
        assertEquals(0, dao.memoryFacts().first().size)
    }

    // -----------------------------------------------------------------------
    // Fixtures
    // -----------------------------------------------------------------------

    private fun mealLog(
        localId: String,
        localDate: String = TODAY,
        items: List<MealLogItemDto> = emptyList(),
    ) = MealLogEntity(
        localId = localId,
        mealType = "breakfast",
        items = items,
        loggedAt = "${localDate}T08:00:00.000Z",
        localDate = localDate,
        idempotencyKey = "key-$localId",
    )

    private fun waterLog(localId: String, amountMl: Int) = WaterLogEntity(
        localId = localId,
        amountMl = amountMl,
        loggedAt = "${TODAY}T08:00:00.000Z",
        localDate = TODAY,
        idempotencyKey = "key-$localId",
    )

    private fun weightLog(localId: String, weightKg: Double) = WeightLogEntity(
        localId = localId,
        weightKg = weightKg,
        loggedAt = "${TODAY}T08:00:00.000Z",
        localDate = TODAY,
        idempotencyKey = "key-$localId",
    )

    private fun exercise(id: String, name: String, category: String = "strength") = ExerciseEntity(
        id = id,
        name = name,
        category = category,
        docJson = "{}",
    )

    private fun media(
        exerciseId: String,
        kind: String,
        url: String,
        author: String? = null,
    ) = ExerciseMediaEntity(
        exerciseId = exerciseId,
        kind = kind,
        url = url,
        licence = "CC-BY-SA 4.0",
        licenceAuthor = author,
    )

    private fun food(id: String, name: String) = FoodEntity(id = id, name = name, docJson = "{}")

    private fun session(id: String) = WorkoutSessionEntity(
        id = id,
        focus = "push",
        localDate = TODAY,
        docJson = "{}",
    )

    private fun trend(series: String, date: String, value: Double) =
        TrendPointEntity(series = series, date = date, value = value)

    private companion object {
        const val TODAY = "2026-01-02"
    }
}
