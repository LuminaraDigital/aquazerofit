package fit.aquazero.app.core.sync

import fit.aquazero.app.core.data.FakeOutboxDao
import fit.aquazero.app.core.data.OutboxRepository
import fit.aquazero.app.core.data.SyncScheduler
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.database.OutboxState
import fit.aquazero.app.core.telemetry.NoOpCrashReporter
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class OutboxDrainCoordinatorTest {

    private val outboxDao = FakeOutboxDao()
    private val outbox = OutboxRepository(outboxDao)
    private val logsDao = FakeLogsDao()
    private val logsApi = FakeLogsApi()
    private val scheduler = RecordingSyncScheduler()

    private fun coordinator() = OutboxDrainCoordinator(
        outboxRepository = outbox,
        logsDao = logsDao,
        logsApi = logsApi,
        syncScheduler = scheduler,
        crashReporter = NoOpCrashReporter,
    )

    @Test
    fun `drainForLogout returns zero when the outbox is already empty`() = runTest {
        assertEquals(0, coordinator().drainForLogout())
    }

    @Test
    fun `drainForLogout clears a deliverable create`() = runTest {
        outbox.enqueueCreate(
            entityType = OutboxEntityTypes.WATER_LOG,
            localId = "w1",
            payloadJson = """{"amountMl":250,"loggedAt":"2026-01-01T08:00:00Z","localDate":"2026-01-01"}""",
            idempotencyKey = "key-w1",
        )
        assertEquals(0, coordinator().drainForLogout())
        assertEquals(0, outbox.pendingCountOnce())
        assertEquals(OutboxState.SYNCED, outboxDao.byId(1L)!!.state)
    }

    private class RecordingSyncScheduler : SyncScheduler {
        override fun requestSync(initialDelaySeconds: Long, queueBehindCurrent: Boolean) = Unit
        override fun cancelPendingSync() = Unit
    }
}
