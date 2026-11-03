package fit.aquazero.app.core.sync

import fit.aquazero.app.core.data.FakeOutboxDao
import fit.aquazero.app.core.data.OutboxRepository
import fit.aquazero.app.core.data.SyncScheduler
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.database.OutboxState
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.CreateMealLogRequest
import fit.aquazero.app.core.model.CreateWaterLogRequest
import fit.aquazero.app.core.model.MealDayDto
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.UpdateMealLogRequest
import fit.aquazero.app.core.telemetry.NoOpCrashReporter
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/**
 * Drain-loop regressions.
 *
 * Every case here is a bug that shipped: each one produced silently wrong
 * data rather than a crash, which is why a green 348-test suite never noticed.
 */
class OutboxDrainerTest {

    private val outboxDao = FakeOutboxDao()
    private val outbox = OutboxRepository(outboxDao)
    private val logsDao = FakeLogsDao()
    private val logsApi = FakeLogsApi()
    private val scheduler = RecordingSyncScheduler()

    private fun drainer() = OutboxDrainer(
        outboxRepository = outbox,
        logsDao = logsDao,
        logsApi = logsApi,
        syncScheduler = scheduler,
        crashReporter = NoOpCrashReporter,
    )

    // ----- P1-3: the orphaned UPDATE that stopped every stream -----

    @Test
    fun `an orphaned meal update is failed instead of stalling the drain forever`() = runTest {
        val op = givenRejectedCreateThenEdit()

        // Two runs: the bug re-claimed the same IN_FLIGHT op on every pass.
        assertEquals(OutboxDrainer.DrainResult.SETTLED, drainer().drain())
        assertEquals(OutboxDrainer.DrainResult.SETTLED, drainer().drain())

        val update = outboxDao.byId(op)
        assertEquals(OutboxState.FAILED, update?.state)
        assertEquals(OutboxDrainer.ORPHANED_UPDATE_CODE, update?.lastErrorCode)
    }

    @Test
    fun `a meal update still waits while its create is genuinely in flight`() = runTest {
        logsDao.meals[LOCAL_ID] = mealRow(serverId = null)
        outbox.enqueueCreate(
            entityType = OutboxEntityTypes.MEAL_LOG,
            localId = LOCAL_ID,
            payloadJson = createMealJson(),
            idempotencyKey = "idem-create",
        )
        logsApi.createMealThrows = { java.io.IOException("offline") }
        val updateId = outbox.enqueueUpdate(
            entityType = OutboxEntityTypes.MEAL_LOG,
            localId = LOCAL_ID,
            payloadJson = updateMealJson(),
        )

        assertEquals(OutboxDrainer.DrainResult.RETRY, drainer().drain())

        // Still QUEUED, not IN_FLIGHT: the stream is FIFO, so the offline
        // CREATE stalls it before the UPDATE is ever claimed. That is the
        // point — the UPDATE waits behind the CREATE it depends on, and the
        // orphan rule must not fire just because a `serverId` is missing.
        assertEquals(OutboxState.QUEUED, outboxDao.byId(updateId)?.state)
        assertNull(
            "a create that is merely offline must not orphan its update",
            outboxDao.byId(updateId)?.lastErrorCode,
        )
    }

    @Test
    fun `a stalled meal stream does not stop water logs uploading`() = runTest {
        givenRejectedCreateThenEdit()
        logsApi.createMealThrows = { java.io.IOException("offline") }
        val waterId = outbox.enqueueCreate(
            entityType = OutboxEntityTypes.WATER_LOG,
            localId = "water-1",
            payloadJson = AzfJson.encodeToString(
                CreateWaterLogRequest.serializer(),
                CreateWaterLogRequest(amountMl = 250, localDate = LOCAL_DATE),
            ),
            idempotencyKey = "idem-water",
        )

        drainer().drain()

        // The whole point: meals being wedged must not hold water hostage.
        assertEquals(OutboxState.SYNCED, outboxDao.byId(waterId)?.state)
        assertEquals(1, logsApi.createWaterCalls)
    }

    // ----- P1-3: the attempts ceiling that was written and never read -----

    @Test
    fun `an op that exhausts its attempts is failed rather than retried forever`() = runTest {
        logsDao.meals[LOCAL_ID] = mealRow(serverId = null)
        val opId = outbox.enqueueCreate(
            entityType = OutboxEntityTypes.MEAL_LOG,
            localId = LOCAL_ID,
            payloadJson = createMealJson(),
            idempotencyKey = "idem-create",
        )
        logsApi.createMealThrows = { java.io.IOException("offline") }

        repeat(OutboxDrainer.MAX_DELIVERY_ATTEMPTS + 2) { drainer().drain() }

        val op = outboxDao.byId(opId)
        assertEquals(OutboxState.FAILED, op?.state)
        assertEquals(OutboxDrainer.ATTEMPTS_EXHAUSTED_CODE, op?.lastErrorCode)
        assertTrue(
            "delivery must stop at the ceiling, not keep hitting the wire",
            logsApi.createMealCalls <= OutboxDrainer.MAX_DELIVERY_ATTEMPTS + 1,
        )
    }

    // ----- P1-5: a 2xx we could not decode is not a failed write -----

    @Test
    fun `a malformed create is reconciled against the server, not marked failed`() = runTest {
        logsDao.meals[LOCAL_ID] = mealRow(serverId = null)
        outbox.enqueueCreate(
            entityType = OutboxEntityTypes.MEAL_LOG,
            localId = LOCAL_ID,
            payloadJson = createMealJson(),
            idempotencyKey = IDEMPOTENCY_KEY,
        )
        // What an unknown enum member from a newer server looks like here.
        logsApi.createMealThrows = { SerializationException("unknown MealType") }
        logsApi.mealDays[LOCAL_DATE] = mealDayContaining("srv-reconciled-1")

        drainer().drain()

        val row = logsDao.meals[LOCAL_ID]
        assertEquals(
            "the server accepted the write; the row must not read as failed",
            SyncState.SYNCED,
            row?.syncState,
        )
        assertNotNull("the reconciled serverId must be adopted", row?.serverId)
        assertTrue("reconciliation must actually ask the server", logsApi.mealDayCalls > 0)
    }

    // ----- helpers -----

    /**
     * The exact shape that wedged the outbox: a CREATE permanently rejected
     * with a 4xx, then a user edit queued against the row it left behind.
     */
    private suspend fun givenRejectedCreateThenEdit(): Long {
        logsDao.meals[LOCAL_ID] = mealRow(serverId = null)
        outbox.enqueueCreate(
            entityType = OutboxEntityTypes.MEAL_LOG,
            localId = LOCAL_ID,
            payloadJson = createMealJson(),
            idempotencyKey = "idem-create",
        )
        logsApi.createMealThrows = { httpError(422) }
        drainer().drain()
        logsApi.createMealThrows = null

        return outbox.enqueueUpdate(
            entityType = OutboxEntityTypes.MEAL_LOG,
            localId = LOCAL_ID,
            payloadJson = updateMealJson(),
        )
    }

    private fun httpError(code: Int): HttpException = HttpException(
        Response.error<Unit>(
            code,
            """{"code":"VALIDATION_FAILED","message":"nope"}"""
                .toResponseBody("application/json".toMediaType()),
        ),
    )

    private fun mealRow(serverId: String?) = MealLogEntity(
        localId = LOCAL_ID,
        serverId = serverId,
        mealType = MealType.LUNCH.name,
        items = listOf(item()),
        totalKcal = 500.0,
        loggedAt = LOCAL_DATE + "T12:00:00Z",
        localDate = LOCAL_DATE,
        syncState = SyncState.PENDING,
        idempotencyKey = IDEMPOTENCY_KEY,
    )

    private fun item() = MealLogItemDto(
        name = "Rice",
        grams = 100.0,
        kcal = 500.0,
        proteinG = 10.0,
        carbsG = 100.0,
        fatG = 2.0,
    )

    /**
     * The server's view of a write that landed. Reconciliation matches on
     * localDate + mealType + kcal (not the idempotency key), so those three
     * must agree with the local row for the match to be found.
     */
    private fun mealDayContaining(serverId: String) = MealDayDto(
        date = LOCAL_DATE,
        meals = mapOf(
            MealType.LUNCH to listOf(
                MealLogDto(
                    id = serverId,
                    userId = "u-1",
                    mealType = MealType.LUNCH,
                    items = listOf(item()),
                    totalKcal = 500.0,
                    loggedAt = LOCAL_DATE + "T12:00:00Z",
                    localDate = LOCAL_DATE,
                ),
            ),
        ),
    )

    private fun createMealJson(): String = AzfJson.encodeToString(
        CreateMealLogRequest.serializer(),
        CreateMealLogRequest(
            mealType = MealType.LUNCH,
            items = listOf(item()),
            localDate = LOCAL_DATE,
        ),
    )

    private fun updateMealJson(): String = AzfJson.encodeToString(
        UpdateMealLogRequest.serializer(),
        UpdateMealLogRequest(items = listOf(item())),
    )

    private class RecordingSyncScheduler : SyncScheduler {
        var requests = 0
            private set

        override fun requestSync(initialDelaySeconds: Long, queueBehindCurrent: Boolean) {
            requests++
        }

        override fun cancelPendingSync() = Unit
    }

    private companion object {
        const val LOCAL_ID = "meal-local-1"
        const val LOCAL_DATE = "2026-08-29"
        const val IDEMPOTENCY_KEY = "idem-create"
    }
}
