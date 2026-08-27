package fit.aquazero.app.core.database

/** Sync state of an offline-writable log row (plan §4.1). */
enum class SyncState {
    /** Row matches the server. */
    SYNCED,

    /** Row written locally, outbox op not yet acknowledged. */
    PENDING,

    /** Server rejected the op with a 4xx — surfaced in UI, never silent. */
    FAILED,
}

/** Outbox op lifecycle (plan §4.2 state machine). */
enum class OutboxState {
    /** Enqueued; payload may still be mutated in place. */
    QUEUED,

    /** Claimed by the worker; payload is FROZEN (key already on the wire). */
    IN_FLIGHT,

    /** Acknowledged by the server. */
    SYNCED,

    /** Rejected by a 4xx validation error; requires user attention. */
    FAILED,
}
