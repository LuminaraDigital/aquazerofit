package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Insert
import androidx.room3.Query
import androidx.room3.Transaction
import kotlinx.coroutines.flow.Flow

/** DAO for the outbox op queue. State transitions run inside transactions. */
@Dao
interface OutboxDao {

    @Insert
    suspend fun insert(op: OutboxEntity): Long

    @Query("SELECT * FROM outbox WHERE id = :id")
    suspend fun byId(id: Long): OutboxEntity?

    /** FIFO head of one entity stream among the given states. */
    @Query(
        "SELECT * FROM outbox WHERE entityType = :entityType AND state IN (:states) " +
            "ORDER BY id ASC LIMIT 1",
    )
    suspend fun head(entityType: String, states: List<OutboxState>): OutboxEntity?

    @Query("SELECT * FROM outbox WHERE state IN (:states) ORDER BY id ASC")
    suspend fun inStates(states: List<OutboxState>): List<OutboxEntity>

    /**
     * How many CREATE ops for [localId] are still going to run.
     *
     * The outbox is the only place that can answer this. A local row with no
     * `serverId` looks exactly the same whether its CREATE is still queued or
     * was rejected hours ago, and a follow-up UPDATE has to tell those apart:
     * one is worth waiting for, the other never resolves. See the orphan rule
     * in `OutboxDrainer.resolveMissingServerId`.
     */
    @Query(
        "SELECT COUNT(*) FROM outbox WHERE localId = :localId AND opType = 'CREATE' " +
            "AND state IN ('QUEUED', 'IN_FLIGHT')",
    )
    suspend fun liveCreateCount(localId: String): Int

    @Query("SELECT COUNT(*) FROM outbox WHERE state IN ('QUEUED', 'IN_FLIGHT', 'FAILED')")
    fun pendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox WHERE state IN ('QUEUED', 'IN_FLIGHT', 'FAILED')")
    suspend fun pendingCountOnce(): Int

    @Query(
        "UPDATE outbox SET state = :to, attempts = attempts + 1, " +
            "firstInFlightAt = CASE WHEN firstInFlightAt = 0 THEN :nowMs ELSE firstInFlightAt END " +
            "WHERE id = :id AND state = :from",
    )
    suspend fun transition(id: Long, from: OutboxState, to: OutboxState, nowMs: Long): Int

    /**
     * Count one more delivery attempt against an op already IN_FLIGHT.
     *
     * [transition] only increments while moving QUEUED → IN_FLIGHT, so an op
     * that [claimHead] re-adopts — after a crash mid-send, or after a run that
     * ended in a retry — would otherwise sit on the same `attempts` value for
     * as long as it kept failing, and no ceiling built on that column could
     * ever fire.
     */
    @Query("UPDATE outbox SET attempts = attempts + 1 WHERE id = :id AND state = 'IN_FLIGHT'")
    suspend fun countResumedAttempt(id: Long)

    @Query("UPDATE outbox SET state = :to, lastErrorCode = :errorCode WHERE id = :id")
    suspend fun finish(id: Long, to: OutboxState, errorCode: String?)

    /** Payload mutation — the WHERE clause enforces mutate-only-while-QUEUED. */
    @Query("UPDATE outbox SET payloadJson = :payloadJson WHERE id = :id AND state = 'QUEUED'")
    suspend fun updateQueuedPayload(id: Long, payloadJson: String): Int

    @Query("DELETE FROM outbox WHERE state = 'SYNCED' AND createdAt < :beforeMs")
    suspend fun pruneSynced(beforeMs: Long)

    /** Remove every pending and historical op (logout / different-user sign-in). */
    @Query("DELETE FROM outbox")
    suspend fun clearAll()

    /**
     * Atomic claim: QUEUED → IN_FLIGHT for the FIFO head of a stream.
     * Returns the claimed op, or null when the stream is drained (or its head
     * is FAILED and needs user attention).
     */
    @Transaction
    suspend fun claimHead(entityType: String, nowMs: Long): OutboxEntity? {
        val head = head(entityType, listOf(OutboxState.QUEUED, OutboxState.IN_FLIGHT)) ?: return null
        return when (head.state) {
            OutboxState.QUEUED -> {
                val moved = transition(head.id, OutboxState.QUEUED, OutboxState.IN_FLIGHT, nowMs)
                if (moved == 1) byId(head.id) else null
            }
            // A crash mid-send left it IN_FLIGHT — it is ours to resume, and
            // resuming is a delivery attempt like any other.
            OutboxState.IN_FLIGHT -> {
                countResumedAttempt(head.id)
                byId(head.id)
            }
            else -> null
        }
    }
}
