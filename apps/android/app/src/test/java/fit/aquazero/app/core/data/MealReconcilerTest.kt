package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.MealType
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Reconciling a refreshed day against Room.
 *
 * The rule under the most pressure is the soft-delete one. The server keeps
 * returning a meal until its DELETE op drains, so every refresh inside that
 * window is a chance to hand the user back the meal they just deleted — and
 * offline the window never closes.
 */
class MealReconcilerTest {

    private val date = "2026-08-27"

    private fun serverMeal(id: String, kcal: Double) = MealLogDto(
        id = id,
        userId = "u-1",
        mealType = MealType.LUNCH,
        items = listOf(
            MealLogItemDto(name = "rice", grams = 200.0, kcal = kcal, proteinG = 8.0, carbsG = 80.0, fatG = 1.0),
        ),
        totalKcal = kcal,
        totalProteinG = 8.0,
        totalCarbsG = 80.0,
        totalFatG = 1.0,
        loggedAt = "2026-08-27T12:00:00.000Z",
        localDate = date,
    )

    private fun localRow(
        localId: String,
        serverId: String?,
        kcal: Double,
        syncState: SyncState = SyncState.SYNCED,
        deleted: Boolean = false,
    ) = MealLogEntity(
        localId = localId,
        serverId = serverId,
        mealType = "lunch",
        totalKcal = kcal,
        loggedAt = "2026-08-27T12:00:00.000Z",
        localDate = date,
        syncState = syncState,
        idempotencyKey = "key-$localId",
        deleted = deleted,
    )

    /** What the day ring would show: the visible rows only. */
    private suspend fun visibleKcal(dao: FakeLogsDao): Double =
        dao.mealLogsForDateOnce(date).sumOf { it.totalKcal }

    @Test
    fun `a locally deleted meal is not resurrected by a refresh that still returns it`() = runTest {
        val dao = FakeLogsDao()
        dao.upsertMealLog(localRow("l-keep", serverId = "s-keep", kcal = 400.0))
        // Deleted a moment ago; the DELETE op has not drained (offline).
        dao.upsertMealLog(
            localRow("l-gone", serverId = "s-gone", kcal = 500.0, syncState = SyncState.PENDING, deleted = true),
        )
        val before = visibleKcal(dao)

        // The server has not applied the delete yet, so it still sends both.
        MealReconciler(dao).reconcile(date, listOf(serverMeal("s-keep", 400.0), serverMeal("s-gone", 500.0)))

        val srvRows = dao.meals.value.filter { it.localId.startsWith(MealReconciler.SERVER_ROW_PREFIX) }
        assertEquals(emptyList<MealLogEntity>(), srvRows)
        val deletedRow = dao.mealLogByLocalId("l-gone")
        assertNotNull(deletedRow)
        assertTrue(deletedRow!!.deleted)
        assertEquals(SyncState.PENDING, deletedRow.syncState)
        assertEquals(before, visibleKcal(dao), TOLERANCE)
        assertEquals(400.0, visibleKcal(dao), TOLERANCE)
    }

    @Test
    fun `a meal deleted on another device is still removed locally`() = runTest {
        val dao = FakeLogsDao()
        dao.upsertMealLog(localRow("srv-s-9", serverId = "s-9", kcal = 300.0))
        // Never reached the server, so its absence from the payload means nothing.
        dao.upsertMealLog(localRow("l-new", serverId = null, kcal = 250.0, syncState = SyncState.PENDING))

        MealReconciler(dao).reconcile(date, emptyList())

        assertNull(dao.mealLogByLocalId("srv-s-9"))
        assertNotNull(dao.mealLogByLocalId("l-new"))
        assertEquals(250.0, visibleKcal(dao), TOLERANCE)
    }

    @Test
    fun `an unseen server meal is inserted under a server row id`() = runTest {
        val dao = FakeLogsDao()

        MealReconciler(dao).reconcile(date, listOf(serverMeal("s-2", 620.0)))

        val row = dao.mealLogByLocalId("${MealReconciler.SERVER_ROW_PREFIX}s-2")
        assertNotNull(row)
        assertEquals("s-2", row!!.serverId)
        assertEquals(SyncState.SYNCED, row.syncState)
        assertEquals(620.0, row.totalKcal, TOLERANCE)
        assertEquals(620.0, visibleKcal(dao), TOLERANCE)
    }

    @Test
    fun `an unsynced local edit is not clobbered by the server copy`() = runTest {
        val dao = FakeLogsDao()
        dao.upsertMealLog(localRow("l-1", serverId = "s-1", kcal = 700.0, syncState = SyncState.PENDING))

        MealReconciler(dao).reconcile(date, listOf(serverMeal("s-1", 500.0)))

        assertEquals(1, dao.meals.value.size)
        assertEquals(700.0, dao.mealLogByLocalId("l-1")!!.totalKcal, TOLERANCE)
    }

    private companion object {
        const val TOLERANCE = 0.001
    }
}
