package fit.aquazero.app.core.database

import androidx.room3.Entity
import androidx.room3.Index
import androidx.room3.PrimaryKey

/** Operation kinds the outbox can replay. */
object OutboxOpTypes {
    const val CREATE = "CREATE"
    const val UPDATE = "UPDATE"
    const val DELETE = "DELETE"
}

/** Entity streams the outbox drains FIFO per type. */
object OutboxEntityTypes {
    const val MEAL_LOG = "mealLog"
    const val WATER_LOG = "waterLog"
    const val WEIGHT_LOG = "weightLog"
}

/**
 * One queued mutation (plan §4.2). Payload is the request-body JSON as it will
 * go on the wire. The idempotency key is minted at enqueue time and NEVER
 * reused with a different payload: mutating [payloadJson] in place is legal
 * only while [state] is [OutboxState.QUEUED] (enforced by
 * `OutboxRepository.mutateQueuedPayload` inside a transaction).
 */
@Entity(
    tableName = "outbox",
    indices = [Index("state"), Index("entityType"), Index("localId")],
)
data class OutboxEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0L,
    /** [OutboxOpTypes]. */
    val opType: String,
    /** [OutboxEntityTypes] — the stream this op belongs to. */
    val entityType: String,
    /** The local row this op materializes (localId of the log entity). */
    val localId: String,
    /** Request body JSON. */
    val payloadJson: String,
    /** Key sent as `Idempotency-Key` on CREATE ops (null for PUT/DELETE). */
    val idempotencyKey: String? = null,
    /** [OutboxState] lifecycle. */
    val state: OutboxState = OutboxState.QUEUED,
    /** Delivery attempts made so far. */
    val attempts: Int = 0,
    /** Epoch millis when the op was enqueued. */
    val createdAt: Long,
    /** Epoch millis when the op first went IN_FLIGHT (0 = never claimed). */
    val firstInFlightAt: Long = 0L,
    /** Payload schema version so migrations can preserve pending ops. */
    val schemaVersion: Int = 1,
    /** Last server error code when [state] is FAILED. */
    val lastErrorCode: String? = null,
)
