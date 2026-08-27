package fit.aquazero.app.core.sync

import fit.aquazero.app.core.database.OutboxDao
import fit.aquazero.app.core.database.OutboxEntity
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.database.OutboxState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** In-memory OutboxDao honoring the same WHERE-clause semantics as Room. */
private class FakeOutboxDao : OutboxDao {
    private val rows = MutableStateFlow<List<OutboxEntity>>(emptyList())
    private var nextId = 1L

    override suspend fun insert(op: OutboxEntity): Long {
        val id = nextId++
        rows.value = rows.value + op.copy(id = id)
        return id
    }

    override suspend fun byId(id: Long): OutboxEntity? = rows.value.firstOrNull { it.id == id }

    override suspend fun head(entityType: String, states: List<OutboxState>): OutboxEntity? =
        rows.value.filter { it.entityType == entityType && it.state in states }.minByOrNull { it.id }

    override suspend fun inStates(states: List<OutboxState>): List<OutboxEntity> =
        rows.value.filter { it.state in states }.sortedBy { it.id }

    override fun pendingCount(): Flow<Int> = rows.map { list ->
        list.count { it.state != OutboxState.SYNCED }
    }

    override suspend fun transition(id: Long, from: OutboxState, to: OutboxState, nowMs: Long): Int {
        var moved = 0
        rows.value = rows.value.map {
            if (it.id == id && it.state == from) {
                moved = 1
                it.copy(
                    state = to,
                    attempts = it.attempts + 1,
                    firstInFlightAt = if (it.firstInFlightAt == 0L) nowMs else it.firstInFlightAt,
                )
            } else {
                it
            }
        }
        return moved
    }

    override suspend fun finish(id: Long, to: OutboxState, errorCode: String?) {
        rows.value = rows.value.map {
            if (it.id == id) it.copy(state = to, lastErrorCode = errorCode) else it
        }
    }

    override suspend fun updateQueuedPayload(id: Long, payloadJson: String): Int {
        var updated = 0
        rows.value = rows.value.map {
            if (it.id == id && it.state == OutboxState.QUEUED) {
                updated = 1
                it.copy(payloadJson = payloadJson)
            } else {
                it
            }
        }
        return updated
    }

    override suspend fun pruneSynced(beforeMs: Long) {
        rows.value = rows.value.filterNot { it.state == OutboxState.SYNCED && it.createdAt < beforeMs }
    }
}

class OutboxRepositoryTest {

    private fun repo() = OutboxRepository(FakeOutboxDao())

    @Test
    fun `claim moves the FIFO head from QUEUED to IN_FLIGHT`() = runTest {
        val repo = repo()
        val first = repo.enqueueCreate(OutboxEntityTypes.MEAL_LOG, "l1", "{}", "key-1")
        repo.enqueueCreate(OutboxEntityTypes.MEAL_LOG, "l2", "{}", "key-2")

        val claimed = repo.claimHead(OutboxEntityTypes.MEAL_LOG)
        assertNotNull(claimed)
        assertEquals(first, claimed!!.id)
        assertEquals(OutboxState.IN_FLIGHT, claimed.state)
        assertTrue(claimed.firstInFlightAt > 0)
    }

    @Test
    fun `re-claim resumes an op left IN_FLIGHT by a crash`() = runTest {
        val repo = repo()
        repo.enqueueCreate(OutboxEntityTypes.WATER_LOG, "w1", "{}", "key-w")
        val firstClaim = repo.claimHead(OutboxEntityTypes.WATER_LOG)!!
        val secondClaim = repo.claimHead(OutboxEntityTypes.WATER_LOG)!!
        assertEquals(firstClaim.id, secondClaim.id)
        assertEquals(OutboxState.IN_FLIGHT, secondClaim.state)
    }

    @Test
    fun `payload can be mutated only while QUEUED`() = runTest {
        val repo = repo()
        val id = repo.enqueueCreate(OutboxEntityTypes.MEAL_LOG, "l1", "{\"grams\":100}", "key-1")

        // Still queued: in-place edit is legal (same key, body never sent).
        assertTrue(repo.mutateQueuedPayload(id, "{\"grams\":150}"))

        // Once claimed, the key has been on the wire — mutation must refuse.
        repo.claimHead(OutboxEntityTypes.MEAL_LOG)
        assertFalse(repo.mutateQueuedPayload(id, "{\"grams\":999}"))
    }

    @Test
    fun `edits after claim require a follow-up op with a distinct key`() = runTest {
        val repo = repo()
        repo.enqueueCreate(OutboxEntityTypes.MEAL_LOG, "l1", "{}", "key-create")
        repo.claimHead(OutboxEntityTypes.MEAL_LOG)
        // The rule (plan §4.2): keep the original op + key, enqueue a PUT.
        repo.enqueueUpdate(OutboxEntityTypes.MEAL_LOG, "l1", "{\"edited\":true}")

        val ops = repo.pendingOps().filter { it.localId == "l1" }
        assertEquals(2, ops.size)
        assertEquals("key-create", ops[0].idempotencyKey)
        assertNull(ops[1].idempotencyKey) // PUT carries no idempotency key
        assertNotEquals(ops[0].idempotencyKey, ops[1].idempotencyKey)
    }

    @Test
    fun `synced and failed ops leave the pending set`() = runTest {
        val repo = repo()
        val a = repo.enqueueCreate(OutboxEntityTypes.WEIGHT_LOG, "wt1", "{}", "k1")
        val b = repo.enqueueCreate(OutboxEntityTypes.WEIGHT_LOG, "wt2", "{}", "k2")

        repo.claimHead(OutboxEntityTypes.WEIGHT_LOG)
        repo.markSynced(a)
        repo.claimHead(OutboxEntityTypes.WEIGHT_LOG)
        repo.markFailed(b, "VALIDATION_FAILED")

        assertEquals(emptyList<OutboxEntity>(), repo.pendingOps())
        assertNull(repo.claimHead(OutboxEntityTypes.WEIGHT_LOG))
    }
}
