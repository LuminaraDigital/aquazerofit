package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.CoachEntity
import fit.aquazero.app.core.database.FoodEntity
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.OutboxEntity
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.database.OutboxOpTypes
import fit.aquazero.app.core.database.OutboxState
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.database.createInMemoryDatabase
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private class NoOpSyncScheduler : SyncScheduler {
    override fun requestSync(initialDelaySeconds: Long, queueBehindCurrent: Boolean) = Unit
    override fun cancelPendingSync() = Unit
}

class LocalCachePurgerTest {

    @Test
    fun purgeDropsUserScopedRowsAndOutboxButKeepsCatalogCorpus() = runTest {
        val db = createInMemoryDatabase()
        val purger = LocalCachePurger(
            logsDao = db.logsDao(),
            outboxDao = db.outboxDao(),
            userDao = db.userDao(),
            trainingDao = db.trainingDao(),
            progressDao = db.progressDao(),
            chatDao = db.chatDao(),
            userOverlayDao = db.userOverlayDao(),
            syncScheduler = NoOpSyncScheduler(),
        )

        db.logsDao().upsertMealLog(
            MealLogEntity(
                localId = "m1",
                mealType = "breakfast",
                loggedAt = "2026-01-01T08:00:00Z",
                localDate = "2026-01-01",
                syncState = SyncState.PENDING,
                idempotencyKey = "k-meal",
            ),
        )
        db.userDao().upsertUser(UserEntity(id = "u1", email = "a@test.com", displayName = "A"))
        db.outboxDao().insert(
            OutboxEntity(
                opType = OutboxOpTypes.CREATE,
                entityType = OutboxEntityTypes.MEAL_LOG,
                localId = "m1",
                payloadJson = "{}",
                idempotencyKey = "k-meal",
                state = OutboxState.QUEUED,
                createdAt = 1L,
            ),
        )
        db.catalogDao().upsertFoods(
            listOf(
                FoodEntity(
                    id = "f1",
                    name = "Oats",
                    docJson = "{}",
                    lastUsedAt = 99L,
                    useCount = 3,
                ),
            ),
        )
        db.catalogDao().upsertCoaches(listOf(CoachEntity(coachId = "akin", unlocked = true)))

        purger.purgeOnUserLogout()

        assertEquals(0, db.logsDao().mealLogsForDateOnce("2026-01-01").size)
        assertNull(db.userDao().userOnce())
        assertEquals(0, db.outboxDao().inStates(listOf(OutboxState.QUEUED)).size)
        assertEquals("Oats", db.catalogDao().foodById("f1")!!.name)
        assertEquals(0L, db.catalogDao().foodById("f1")!!.lastUsedAt)
        assertEquals(0, db.catalogDao().foodById("f1")!!.useCount)
        assertTrue(db.catalogDao().coaches().first().isEmpty())
    }

    @Test
    fun cachedUserIdReadsSingletonUserRow() = runTest {
        val db = createInMemoryDatabase()
        val purger = LocalCachePurger(
            logsDao = db.logsDao(),
            outboxDao = db.outboxDao(),
            userDao = db.userDao(),
            trainingDao = db.trainingDao(),
            progressDao = db.progressDao(),
            chatDao = db.chatDao(),
            userOverlayDao = db.userOverlayDao(),
            syncScheduler = NoOpSyncScheduler(),
        )
        assertNull(purger.cachedUserId())
        db.userDao().upsertUser(UserEntity(id = "u1", email = "a@test.com", displayName = "A"))
        assertEquals("u1", purger.cachedUserId())
    }
}
