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

    @Query("SELECT COUNT(*) FROM outbox WHERE state IN ('QUEUED', 'IN_FLIGHT', 'FAILED')")
    fun pendingCount(): Flow<Int>

    @Query(
        "UPDATE outbox SET state = :to, attempts = attempts + 1, " +
            "firstInFlightAt = CASE WHEN firstInFlightAt = 0 THEN :nowMs ELSE firstInFlightAt END " +
            "WHERE id = :id AND state = :from",
    )
    suspend fun transition(id: Long, from: OutboxState, to: OutboxState, nowMs: Long): Int

    @Query("UPDATE outbox SET state = :to, lastErrorCode = :errorCode WHERE id = :id")
    suspend fun finish(id: Long, to: OutboxState, errorCode: String?)

    /** Payload mutation — the WHERE clause enforces mutate-only-while-QUEUED. */
    @Query("UPDATE outbox SET payloadJson = :payloadJson WHERE id = :id AND state = 'QUEUED'")
    suspend fun updateQueuedPayload(id: Long, payloadJson: String): Int

    @Query("DELETE FROM outbox WHERE state = 'SYNCED' AND createdAt < :beforeMs")
    suspend fun pruneSynced(beforeMs: Long)

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
            // A crash mid-send left it IN_FLIGHT — it is ours to resume.
            OutboxState.IN_FLIGHT -> head
            else -> null
        }
    }
}
