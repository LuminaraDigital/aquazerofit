package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.OutboxDao
import fit.aquazero.app.core.database.OutboxEntity
import fit.aquazero.app.core.database.OutboxOpTypes
import fit.aquazero.app.core.database.OutboxState
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

/**
 * Gatekeeper for the outbox state machine (plan §4.2).
 *
 * Invariants enforced here:
 *  - QUEUED → IN_FLIGHT happens only through the transactional claim.
 *  - A payload can be mutated ONLY while its op is QUEUED — once a key has
 *    been on the wire, the server would replay the cached response for a
 *    different body, so [mutateQueuedPayload] returning false means the
 *    caller must enqueue a follow-up UPDATE op instead.
 *  - An idempotency key is minted per CREATE op and never reused.
 */
@Singleton
class OutboxRepository @Inject constructor(
    private val outboxDao: OutboxDao,
) {

    /** Ops not yet fully drained, for UI badges and the logout drain gate. */
    val pendingCount: Flow<Int> = outboxDao.pendingCount()

    /** Enqueue a CREATE with its freshly minted idempotency key. */
    suspend fun enqueueCreate(
        entityType: String,
        localId: String,
        payloadJson: String,
        idempotencyKey: String,
        nowMs: Long = System.currentTimeMillis(),
    ): Long = outboxDao.insert(
        OutboxEntity(
            opType = OutboxOpTypes.CREATE,
            entityType = entityType,
            localId = localId,
            payloadJson = payloadJson,
            idempotencyKey = idempotencyKey,
            createdAt = nowMs,
        ),
    )

    /** Enqueue a follow-up UPDATE (no idempotency key; PUT is last-write-wins). */
    suspend fun enqueueUpdate(
        entityType: String,
        localId: String,
        payloadJson: String,
        nowMs: Long = System.currentTimeMillis(),
    ): Long = outboxDao.insert(
        OutboxEntity(
            opType = OutboxOpTypes.UPDATE,
            entityType = entityType,
            localId = localId,
            payloadJson = payloadJson,
            createdAt = nowMs,
        ),
    )

    /** Enqueue a DELETE (replayed NOT_FOUND is treated as success). */
    suspend fun enqueueDelete(
        entityType: String,
        localId: String,
        nowMs: Long = System.currentTimeMillis(),
    ): Long = outboxDao.insert(
        OutboxEntity(
            opType = OutboxOpTypes.DELETE,
            entityType = entityType,
            localId = localId,
            payloadJson = "{}",
            createdAt = nowMs,
        ),
    )

    /**
     * Replace a QUEUED op's payload in place. Returns false when the op has
     * already been claimed (or finished) — the edit must then travel as a
     * separate UPDATE op with the original CREATE left untouched.
     */
    suspend fun mutateQueuedPayload(opId: Long, payloadJson: String): Boolean =
        outboxDao.updateQueuedPayload(opId, payloadJson) == 1

    /** Transactionally claim the FIFO head of a stream for delivery. */
    suspend fun claimHead(entityType: String, nowMs: Long = System.currentTimeMillis()): OutboxEntity? =
        outboxDao.claimHead(entityType, nowMs)

    /** Mark an op delivered. */
    suspend fun markSynced(opId: Long) =
        outboxDao.finish(opId, OutboxState.SYNCED, errorCode = null)

    /** Mark an op permanently rejected (4xx validation); surfaced in UI. */
    suspend fun markFailed(opId: Long, errorCode: String?) =
        outboxDao.finish(opId, OutboxState.FAILED, errorCode)

    /** All ops currently queued or in flight (drain preview / logout gate). */
    suspend fun pendingOps(): List<OutboxEntity> =
        outboxDao.inStates(listOf(OutboxState.QUEUED, OutboxState.IN_FLIGHT))

    /** Prune delivered ops older than [beforeMs] (housekeeping). */
    suspend fun pruneSynced(beforeMs: Long) = outboxDao.pruneSynced(beforeMs)
}
