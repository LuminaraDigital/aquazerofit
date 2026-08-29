package fit.aquazero.app.core.database

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The outbox state machine against real SQLite.
 *
 * `OutboxRepositoryTest` and `OutboxDrainerTest` on the JVM run this same
 * machine through `FakeOutboxDao`, a hand-written re-implementation of the
 * queries. That fake is only ever as correct as somebody's reading of the SQL,
 * and the invariants that matter here are *in* the SQL:
 *
 *  - `updateQueuedPayload` refuses once the row leaves QUEUED because of its
 *    `AND state = 'QUEUED'` clause — the single line stopping a body from
 *    changing under an idempotency key already on the wire.
 *  - `transition` is conditional on the `from` state, so two claimers cannot
 *    both believe they own an op.
 *  - `claimHead` composes those inside a `@Transaction`.
 *  - `liveCreateCount` hard-codes its state list in the query string, where no
 *    compiler checks it against [OutboxState].
 *
 * Every assertion below is one those tests cannot make.
 */
@RunWith(AndroidJUnit4::class)
class OutboxDaoStateMachineTest {

    private lateinit var db: AzfDatabase
    private lateinit var dao: OutboxDao

    @Before
    fun open() {
        db = createInMemoryDatabase()
        dao = db.outboxDao()
    }

    @After
    fun close() {
        db.close()
    }

    @Test
    fun claimHeadMovesTheFifoHeadAndStampsFirstInFlight() = runTest {
        val first = dao.insert(op(localId = "l1", key = "key-1"))
        dao.insert(op(localId = "l2", key = "key-2"))

        val claimed = dao.claimHead(OutboxEntityTypes.MEAL_LOG, nowMs = 1_000L)

        assertNotNull(claimed)
        assertEquals(first, claimed!!.id)
        assertEquals(OutboxState.IN_FLIGHT, claimed.state)
        assertEquals(1, claimed.attempts)
        assertEquals(1_000L, claimed.firstInFlightAt)
        // The second op is untouched: streams drain strictly in order, so a
        // failure on the head must not let a later op overtake it.
        assertEquals(OutboxState.QUEUED, dao.byId(first + 1)!!.state)
    }

    @Test
    fun reclaimingAnInFlightOpCountsAnotherAttemptWithoutMovingFirstInFlight() = runTest {
        dao.insert(op(localId = "w1", key = "key-w", entityType = OutboxEntityTypes.WATER_LOG))
        val first = dao.claimHead(OutboxEntityTypes.WATER_LOG, nowMs = 1_000L)!!
        val second = dao.claimHead(OutboxEntityTypes.WATER_LOG, nowMs = 5_000L)!!

        assertEquals(first.id, second.id)
        // A crash mid-send leaves the op IN_FLIGHT. Resuming it is a delivery
        // attempt: without countResumedAttempt the row would sit on attempts=1
        // forever and no retry ceiling built on the column could ever fire.
        assertEquals(2, second.attempts)
        // The original claim timestamp is the age the stuck-op detection uses;
        // re-stamping it would make an op that has been failing for hours look
        // freshly enqueued on every retry.
        assertEquals(1_000L, second.firstInFlightAt)
    }

    @Test
    fun aFailedOpDropsOutOfItsStreamAndTheNextOpIsClaimed() = runTest {
        val failed = dao.insert(op(localId = "l1", key = "key-1"))
        dao.claimHead(OutboxEntityTypes.MEAL_LOG, nowMs = 1_000L)
        dao.finish(failed, OutboxState.FAILED, errorCode = "VALIDATION_FAILED")
        dao.insert(op(localId = "l2", key = "key-2"))

        val next = dao.claimHead(OutboxEntityTypes.MEAL_LOG, nowMs = 2_000L)

        // `head` selects `state IN ('QUEUED','IN_FLIGHT')`, so a rejected op is
        // simply invisible and the stream keeps moving. That matches
        // `SyncWorker.failPermanently`, which returns `OpOutcome.Done` and lets
        // the drain loop take the next op.
        //
        // It does NOT match the KDoc on `claimHead`, which says the call
        // returns null "when ... its head is FAILED and needs user attention",
        // nor the `else -> null` branch written for that case — which the state
        // filter in `head` makes unreachable. The behaviour asserted here is
        // the one the drainer is built on; the comment and the dead branch are
        // the parts that are wrong. Flagged rather than silently pinned.
        assertNotNull(next)
        assertEquals("l2", next!!.localId)
        assertEquals(OutboxState.FAILED, dao.byId(failed)!!.state)
    }

    @Test
    fun streamsDrainIndependently() = runTest {
        dao.insert(op(localId = "m1", key = "k-m", entityType = OutboxEntityTypes.MEAL_LOG))
        dao.insert(op(localId = "w1", key = "k-w", entityType = OutboxEntityTypes.WATER_LOG))

        val meal = dao.claimHead(OutboxEntityTypes.MEAL_LOG, nowMs = 1_000L)
        val water = dao.claimHead(OutboxEntityTypes.WATER_LOG, nowMs = 1_000L)

        // FIFO is per entity stream, not global: a stuck meal log must not
        // stop water from syncing.
        assertEquals("m1", meal!!.localId)
        assertEquals("w1", water!!.localId)
    }

    @Test
    fun payloadMutationIsRefusedOnceTheKeyHasBeenOnTheWire() = runTest {
        val id = dao.insert(op(localId = "l1", key = "key-1", payload = "{\"grams\":100}"))

        assertEquals(1, dao.updateQueuedPayload(id, "{\"grams\":150}"))
        assertEquals("{\"grams\":150}", dao.byId(id)!!.payloadJson)

        dao.claimHead(OutboxEntityTypes.MEAL_LOG, nowMs = 1_000L)

        // 0 rows updated, and — the part a fake cannot prove — the stored
        // payload is genuinely unchanged. The server replays the cached
        // response for a repeated idempotency key, so a body edited after the
        // key was sent is silently discarded server-side.
        assertEquals(0, dao.updateQueuedPayload(id, "{\"grams\":999}"))
        assertEquals("{\"grams\":150}", dao.byId(id)!!.payloadJson)
    }

    @Test
    fun payloadMutationIsRefusedAfterTheOpFinishes() = runTest {
        val id = dao.insert(op(localId = "l1", key = "key-1"))
        dao.finish(id, OutboxState.SYNCED, errorCode = null)

        assertEquals(0, dao.updateQueuedPayload(id, "{\"late\":true}"))
    }

    @Test
    fun transitionOnlyFiresFromTheExpectedState() = runTest {
        val id = dao.insert(op(localId = "l1", key = "key-1"))

        assertEquals(1, dao.transition(id, OutboxState.QUEUED, OutboxState.IN_FLIGHT, 1_000L))
        // The `AND state = :from` guard is what makes the claim safe against a
        // second claimer: the loser gets 0 and backs off rather than sending
        // the same op twice.
        assertEquals(0, dao.transition(id, OutboxState.QUEUED, OutboxState.IN_FLIGHT, 2_000L))
        assertEquals(1, dao.byId(id)!!.attempts)
    }

    @Test
    fun liveCreateCountSeesQueuedAndInFlightCreatesOnly() = runTest {
        val createId = dao.insert(op(localId = "l1", key = "key-1"))
        dao.insert(op(localId = "l1", key = null, opType = OutboxOpTypes.UPDATE))

        // A follow-up UPDATE is not a live CREATE: only the CREATE can still
        // produce the serverId the UPDATE is waiting for.
        assertEquals(1, dao.liveCreateCount("l1"))

        dao.claimHead(OutboxEntityTypes.MEAL_LOG, nowMs = 1_000L)
        assertEquals(1, dao.liveCreateCount("l1"))

        dao.finish(createId, OutboxState.FAILED, errorCode = "VALIDATION_FAILED")
        // Now the count is 0, which is the drain's orphan signal: the row will
        // never get a serverId, so the queued UPDATE must be resolved rather
        // than retried forever.
        assertEquals(0, dao.liveCreateCount("l1"))
        assertEquals(0, dao.liveCreateCount("unknown-local-id"))
    }

    @Test
    fun pendingCountEmitsQueuedInFlightAndFailedButNotSynced() = runTest {
        val a = dao.insert(op(localId = "l1", key = "k1"))
        val b = dao.insert(op(localId = "l2", key = "k2"))
        assertEquals(2, dao.pendingCount().first())

        dao.finish(a, OutboxState.SYNCED, errorCode = null)
        assertEquals(1, dao.pendingCount().first())

        // FAILED still counts: the logout gate and the sync badge must both
        // keep surfacing work the user has to look at, not quietly drop it.
        dao.finish(b, OutboxState.FAILED, errorCode = "VALIDATION_FAILED")
        assertEquals(1, dao.pendingCount().first())
    }

    @Test
    fun inStatesReturnsQueuedAndInFlightInEnqueueOrder() = runTest {
        val a = dao.insert(op(localId = "l1", key = "k1"))
        dao.insert(op(localId = "l2", key = "k2"))
        dao.claimHead(OutboxEntityTypes.MEAL_LOG, nowMs = 1_000L)
        dao.insert(op(localId = "l3", key = "k3"))
        dao.finish(a, OutboxState.SYNCED, errorCode = null)

        assertEquals(
            listOf("l2", "l3"),
            dao.inStates(listOf(OutboxState.QUEUED, OutboxState.IN_FLIGHT)).map { it.localId },
        )
    }

    @Test
    fun pruneOnlyRemovesOldSyncedOps() = runTest {
        val synced = dao.insert(op(localId = "l1", key = "k1", createdAt = 1_000L))
        val recent = dao.insert(op(localId = "l2", key = "k2", createdAt = 9_000L))
        val failed = dao.insert(op(localId = "l3", key = "k3", createdAt = 1_000L))
        dao.finish(synced, OutboxState.SYNCED, errorCode = null)
        dao.finish(recent, OutboxState.SYNCED, errorCode = null)
        dao.finish(failed, OutboxState.FAILED, errorCode = "VALIDATION_FAILED")

        dao.pruneSynced(beforeMs = 5_000L)

        assertNull(dao.byId(synced))
        assertNotNull(dao.byId(recent))
        // Housekeeping must never delete evidence of a rejection the user has
        // not seen yet.
        assertNotNull(dao.byId(failed))
    }

    @Test
    fun schemaVersionDefaultsToOneSoMigrationsCanRewritePendingPayloads() = runTest {
        val id = dao.insert(op(localId = "l1", key = "key-1"))

        // Pending ops outlive an app update. The column is the only thing that
        // will tell a future migration which payload shape a queued body is in.
        assertEquals(1, dao.byId(id)!!.schemaVersion)
    }

    private fun op(
        localId: String,
        key: String?,
        entityType: String = OutboxEntityTypes.MEAL_LOG,
        opType: String = OutboxOpTypes.CREATE,
        payload: String = "{}",
        createdAt: Long = 1_000L,
    ) = OutboxEntity(
        opType = opType,
        entityType = entityType,
        localId = localId,
        payloadJson = payload,
        idempotencyKey = key,
        createdAt = createdAt,
    )
}
